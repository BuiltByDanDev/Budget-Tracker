"""Rules: 'when the Description contains X, classify the Transaction like this'."""

from collections.abc import Iterable

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.models import Kind, Rule, Transaction


def best_rule(rules: Iterable[Rule], description: str) -> Rule | None:
    """The matching Rule with the longest match text; the newest wins a tie."""
    lowered = description.lower()
    matching = [rule for rule in rules if rule.match_text.lower() in lowered]
    return max(matching, key=lambda rule: (len(rule.match_text), rule.id), default=None)


def classify(
    transaction: Transaction,
    kind: Kind,
    category_id: int | None,
    importance,
    merchant_id: int | None,
) -> None:
    """Only an Expense has a Category and an Importance."""
    transaction.kind = kind
    transaction.category_id = category_id if kind == Kind.EXPENSE else None
    transaction.importance = importance if kind == Kind.EXPENSE else None
    transaction.merchant_id = merchant_id


def apply_rules(session: Session, user_id: int, transactions: Iterable[Transaction]) -> int:
    """Classifies each Transaction by its best Rule. Returns how many matched one."""
    rules = session.scalars(select(Rule).where(Rule.user_id == user_id)).all()
    matched = 0
    for transaction in transactions:
        rule = best_rule(rules, transaction.description)
        if rule is not None:
            classify(
                transaction, rule.kind, rule.category_id, rule.importance, rule.merchant_id
            )
            matched += 1
    return matched


def apply_rules_to_unclassified(session: Session, user_id: int) -> int:
    """Runs the Rules over stored Transactions that nothing has classified yet.

    A Transaction the User set by hand, or that already has a Category, is left alone.
    """
    unclassified = session.scalars(
        select(Transaction).where(
            Transaction.user_id == user_id,
            Transaction.set_by_hand.is_(False),
            Transaction.category_id.is_(None),
        )
    ).all()
    return apply_rules(session, user_id, unclassified)
