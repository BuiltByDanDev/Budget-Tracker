from datetime import date

from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel
from sqlalchemy import case, func, select
from sqlalchemy.orm import Session, selectinload

from app.classifying.rules import classify, reapply_rules
from app.db import get_session
from app.models import Category, Importance, Kind, Merchant, Rule, Transaction, User
from app.users import get_current_user

router = APIRouter(prefix="/api/transactions", tags=["transactions"])

MIN_MATCH_TEXT_LENGTH = 3


class TransactionOut(BaseModel):
    id: int
    posted_on: date
    amount_cents: int
    # The amount as read from the CSV, before any correction by the User.
    imported_amount_cents: int
    amount_unconverted: bool
    description: str
    kind: Kind
    account_id: int
    account_name: str
    category_id: int | None
    category_name: str | None
    importance: Importance | None
    merchant_name: str | None

    @classmethod
    def from_model(cls, transaction: Transaction) -> "TransactionOut":
        return cls(
            id=transaction.id,
            posted_on=transaction.posted_on,
            amount_cents=transaction.amount_cents,
            imported_amount_cents=transaction.imported_amount_cents,
            amount_unconverted=transaction.amount_unconverted,
            description=transaction.description,
            kind=transaction.kind,
            account_id=transaction.account_id,
            account_name=transaction.account.name,
            category_id=transaction.category_id,
            category_name=transaction.category.name if transaction.category else None,
            importance=transaction.importance,
            merchant_name=transaction.merchant.name if transaction.merchant else None,
        )


class TransactionPage(BaseModel):
    items: list[TransactionOut]
    total: int
    # Totals over every Transaction matching the filters, not just this page.
    spending_cents: int
    income_cents: int


class Classification(BaseModel):
    kind: Kind
    category_id: int | None = None
    importance: Importance | None = None
    merchant_name: str | None = None
    # When set, also saves a Rule for Descriptions containing this text.
    rule_match_text: str | None = None
    # With rule_match_text: the Rule also requires an amount in this range,
    # ends included and signed (money out is negative). Set both or neither;
    # the same value twice means an exact amount.
    rule_amount_min_cents: int | None = None
    rule_amount_max_cents: int | None = None


class AmountIn(BaseModel):
    amount_cents: int


class ClassifyResult(BaseModel):
    transaction: TransactionOut
    # How many other Transactions changed when the Rules were run again.
    also_classified: int


@router.get("", response_model=TransactionPage)
def list_transactions(
    date_from: date | None = None,
    date_to: date | None = None,
    account_id: int | None = None,
    category_id: int | None = None,
    importance: Importance | None = None,
    kind: Kind | None = None,
    rule_id: int | None = None,
    search: str | None = None,
    needs_review: bool = False,
    amount_unconverted: bool = False,
    limit: int = Query(50, le=200),
    offset: int = 0,
    session: Session = Depends(get_session),
    user: User = Depends(get_current_user),
):
    conditions = [Transaction.user_id == user.id]
    if date_from:
        conditions.append(Transaction.posted_on >= date_from)
    if date_to:
        conditions.append(Transaction.posted_on <= date_to)
    if account_id:
        conditions.append(Transaction.account_id == account_id)
    if category_id:
        conditions.append(Transaction.category_id == category_id)
    if importance:
        conditions.append(Transaction.importance == importance)
    if kind:
        conditions.append(Transaction.kind == kind)
    if rule_id:
        conditions.append(Transaction.rule_id == rule_id)
    if needs_review:
        # The Review Inbox: Expenses with no Category.
        conditions.append(Transaction.kind == Kind.EXPENSE)
        conditions.append(Transaction.category_id.is_(None))
    if amount_unconverted:
        conditions.append(Transaction.amount_unconverted)
    if search and search.strip():
        pattern = f"%{search.strip()}%"
        merchant_matches = select(Merchant.id).where(
            Merchant.user_id == user.id, Merchant.name.ilike(pattern)
        )
        conditions.append(
            Transaction.description.ilike(pattern)
            | Transaction.merchant_id.in_(merchant_matches)
        )

    total, spending, income = session.execute(
        select(
            func.count(),
            # A Refund is an Expense with money in, so it lowers Spending.
            func.coalesce(
                func.sum(
                    case(
                        (Transaction.kind == Kind.EXPENSE, -Transaction.amount_cents),
                        else_=0,
                    )
                ),
                0,
            ),
            func.coalesce(
                func.sum(
                    case(
                        (Transaction.kind == Kind.INCOME, Transaction.amount_cents),
                        else_=0,
                    )
                ),
                0,
            ),
        ).where(*conditions)
    ).one()

    transactions = session.scalars(
        select(Transaction)
        .where(*conditions)
        .options(
            selectinload(Transaction.account),
            selectinload(Transaction.category),
            selectinload(Transaction.merchant),
        )
        .order_by(Transaction.posted_on.desc(), Transaction.id.desc())
        .limit(limit)
        .offset(offset)
    ).all()
    return TransactionPage(
        items=[TransactionOut.from_model(t) for t in transactions],
        total=total,
        spending_cents=spending,
        income_cents=income,
    )


def merchant_id_for(session: Session, user: User, name: str | None) -> int | None:
    """Finds the Merchant with this name, ignoring case, or creates it."""
    if not name or not name.strip():
        return None
    name = name.strip()
    merchant = session.scalar(
        select(Merchant).where(
            Merchant.user_id == user.id, func.lower(Merchant.name) == name.lower()
        )
    )
    if merchant is None:
        merchant = Merchant(user_id=user.id, name=name)
        session.add(merchant)
        session.flush()
    return merchant.id


@router.put("/{transaction_id}/classification", response_model=ClassifyResult)
def classify_transaction(
    transaction_id: int,
    body: Classification,
    session: Session = Depends(get_session),
    user: User = Depends(get_current_user),
):
    """The User classifies one Transaction by hand, optionally saving a Rule."""
    transaction = session.get(Transaction, transaction_id)
    if transaction is None or transaction.user_id != user.id:
        raise HTTPException(404, "Transaction not found")

    if body.kind == Kind.EXPENSE:
        if body.category_id is None or body.importance is None:
            raise HTTPException(422, "An expense needs a category and an importance")
        category = session.get(Category, body.category_id)
        if category is None or category.user_id != user.id:
            raise HTTPException(422, "Unknown category")

    match_text = (body.rule_match_text or "").strip()
    if body.rule_match_text is not None:
        if len(match_text) < MIN_MATCH_TEXT_LENGTH:
            raise HTTPException(
                422, f"Rule text needs at least {MIN_MATCH_TEXT_LENGTH} characters"
            )
        if match_text.lower() not in transaction.description.lower():
            raise HTTPException(
                422, "Rule text must appear in this transaction's description"
            )

    amount_min, amount_max = body.rule_amount_min_cents, body.rule_amount_max_cents
    if amount_min is not None or amount_max is not None:
        if not match_text:
            raise HTTPException(422, "A rule amount needs rule text as well")
        if amount_min is None or amount_max is None:
            raise HTTPException(422, "A rule amount needs both ends of its range")
        if amount_min > amount_max:
            raise HTTPException(422, "The rule's amount range is the wrong way round")
        if not amount_min <= transaction.amount_cents <= amount_max:
            raise HTTPException(
                422, "The rule's amount range must include this transaction's amount"
            )

    merchant_id = merchant_id_for(session, user, body.merchant_name)
    classify(transaction, body.kind, body.category_id, body.importance, merchant_id)
    transaction.set_by_hand = True
    transaction.rule_id = None

    also_classified = 0
    if match_text:
        # A Rule is replaced only by one with the same text and the same amount
        # range, so "PETRO" and "PETRO between $40 and $150" are two Rules.
        # is_not_distinct_from is "equals" that also treats two NULLs as equal.
        rule = session.scalar(
            select(Rule).where(
                Rule.user_id == user.id,
                func.lower(Rule.match_text) == match_text.lower(),
                Rule.amount_min_cents.is_not_distinct_from(amount_min),
                Rule.amount_max_cents.is_not_distinct_from(amount_max),
            )
        )
        if rule is None:
            rule = Rule(
                user_id=user.id,
                match_text=match_text,
                amount_min_cents=amount_min,
                amount_max_cents=amount_max,
                kind=body.kind,
            )
            session.add(rule)
        rule.kind = transaction.kind
        rule.category_id = transaction.category_id
        rule.importance = transaction.importance
        rule.merchant_id = transaction.merchant_id
        session.flush()
        also_classified = reapply_rules(session, user.id)

    session.commit()
    return ClassifyResult(
        transaction=TransactionOut.from_model(transaction),
        also_classified=also_classified,
    )


@router.put("/{transaction_id}/amount", response_model=TransactionOut)
def set_amount(
    transaction_id: int,
    body: AmountIn,
    session: Session = Depends(get_session),
    user: User = Depends(get_current_user),
):
    """The User settles an Unconverted Amount: a converted value, or the same one kept."""
    transaction = session.get(Transaction, transaction_id)
    if transaction is None or transaction.user_id != user.id:
        raise HTTPException(404, "Transaction not found")
    transaction.amount_cents = body.amount_cents
    transaction.amount_unconverted = False
    session.commit()
    return TransactionOut.from_model(transaction)
