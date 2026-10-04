from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy import func, select
from sqlalchemy.orm import Session, selectinload

from app.api.transactions import MIN_MATCH_TEXT_LENGTH, merchant_id_for
from app.classifying.rules import reapply_rules
from app.db import get_session
from app.models import Category, Importance, Kind, Rule, Transaction, User
from app.users import get_current_user

router = APIRouter(prefix="/api/rules", tags=["rules"])


class RuleOut(BaseModel):
    id: int
    match_text: str
    # Both null means any amount. Signed: money out is negative.
    amount_min_cents: int | None
    amount_max_cents: int | None
    kind: Kind
    category_id: int | None
    category_name: str | None
    importance: Importance | None
    merchant_name: str | None
    # How many Transactions this Rule currently classifies.
    transaction_count: int

    @classmethod
    def from_model(cls, rule: Rule, transaction_count: int) -> "RuleOut":
        return cls(
            id=rule.id,
            match_text=rule.match_text,
            amount_min_cents=rule.amount_min_cents,
            amount_max_cents=rule.amount_max_cents,
            kind=rule.kind,
            category_id=rule.category_id,
            category_name=rule.category.name if rule.category else None,
            importance=rule.importance,
            merchant_name=rule.merchant.name if rule.merchant else None,
            transaction_count=transaction_count,
        )


class RuleIn(BaseModel):
    match_text: str
    amount_min_cents: int | None = None
    amount_max_cents: int | None = None
    kind: Kind
    category_id: int | None = None
    importance: Importance | None = None
    merchant_name: str | None = None


class RuleSaved(BaseModel):
    rule: RuleOut
    # How many Transactions changed when the Rules were run again.
    changed: int


class RuleDeleted(BaseModel):
    changed: int


def _transaction_counts(session: Session, user: User) -> dict[int, int]:
    """How many Transactions each Rule classifies, keyed by Rule id."""
    rows = session.execute(
        select(Transaction.rule_id, func.count())
        .where(Transaction.user_id == user.id, Transaction.rule_id.is_not(None))
        .group_by(Transaction.rule_id)
    )
    return dict(rows.all())


def _own_rule(session: Session, user: User, rule_id: int) -> Rule:
    rule = session.get(Rule, rule_id)
    if rule is None or rule.user_id != user.id:
        raise HTTPException(404, "Rule not found")
    return rule


@router.get("", response_model=list[RuleOut])
def list_rules(
    session: Session = Depends(get_session), user: User = Depends(get_current_user)
):
    rules = session.scalars(
        select(Rule)
        .where(Rule.user_id == user.id)
        .options(selectinload(Rule.category), selectinload(Rule.merchant))
        .order_by(func.lower(Rule.match_text), Rule.id)
    ).all()
    counts = _transaction_counts(session, user)
    return [RuleOut.from_model(rule, counts.get(rule.id, 0)) for rule in rules]


@router.put("/{rule_id}", response_model=RuleSaved)
def change_rule(
    rule_id: int,
    body: RuleIn,
    session: Session = Depends(get_session),
    user: User = Depends(get_current_user),
):
    """Changes a Rule, then puts every Transaction not set by hand in step with the Rules."""
    rule = _own_rule(session, user, rule_id)

    match_text = body.match_text.strip()
    if len(match_text) < MIN_MATCH_TEXT_LENGTH:
        raise HTTPException(
            422, f"Rule text needs at least {MIN_MATCH_TEXT_LENGTH} characters"
        )
    if (body.amount_min_cents is None) != (body.amount_max_cents is None):
        raise HTTPException(422, "A rule amount needs both ends of its range")
    if body.amount_min_cents is not None and body.amount_min_cents > body.amount_max_cents:
        raise HTTPException(422, "The rule's amount range is the wrong way round")
    if body.kind == Kind.EXPENSE:
        if body.category_id is None or body.importance is None:
            raise HTTPException(422, "An expense needs a category and an importance")
        category = session.get(Category, body.category_id)
        if category is None or category.user_id != user.id:
            raise HTTPException(422, "Unknown category")

    twin = session.scalar(
        select(Rule).where(
            Rule.user_id == user.id,
            Rule.id != rule.id,
            func.lower(Rule.match_text) == match_text.lower(),
            Rule.amount_min_cents.is_not_distinct_from(body.amount_min_cents),
            Rule.amount_max_cents.is_not_distinct_from(body.amount_max_cents),
        )
    )
    if twin is not None:
        raise HTTPException(422, "Another rule already has this text and amount")

    rule.match_text = match_text
    rule.amount_min_cents = body.amount_min_cents
    rule.amount_max_cents = body.amount_max_cents
    rule.kind = body.kind
    # Only an Expense has a Category and an Importance.
    rule.category_id = body.category_id if body.kind == Kind.EXPENSE else None
    rule.importance = body.importance if body.kind == Kind.EXPENSE else None
    rule.merchant_id = merchant_id_for(session, user, body.merchant_name)
    session.flush()

    changed = reapply_rules(session, user.id)
    session.commit()
    count = _transaction_counts(session, user).get(rule.id, 0)
    return RuleSaved(rule=RuleOut.from_model(rule, count), changed=changed)


@router.delete("/{rule_id}", response_model=RuleDeleted)
def delete_rule(
    rule_id: int,
    session: Session = Depends(get_session),
    user: User = Depends(get_current_user),
):
    """Deletes a Rule. Its Transactions pass to the next best Rule, or to none."""
    rule = _own_rule(session, user, rule_id)
    session.delete(rule)
    session.flush()
    # The database emptied rule_id on this Rule's Transactions; read them again.
    session.expire_all()
    changed = reapply_rules(session, user.id)
    session.commit()
    return RuleDeleted(changed=changed)
