"""Rules: 'when the Description contains X, classify the Transaction like this'.

A Rule can also require the amount to be in a range.
"""

from collections.abc import Iterable

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.models import Kind, Rule, Transaction


def has_amount(rule: Rule) -> bool:
    return rule.amount_min_cents is not None


def matches(rule: Rule, description: str, amount_cents: int) -> bool:
    """True when the Description contains the Rule's text and the amount is in its range."""
    if rule.match_text.lower() not in description.lower():
        return False
    if not has_amount(rule):
        return True
    return rule.amount_min_cents <= amount_cents <= rule.amount_max_cents


def best_rule(rules: Iterable[Rule], description: str, amount_cents: int) -> Rule | None:
    """The matching Rule that is most specific.

    A Rule with an amount beats one without; then the longest match text wins;
    then the newest.
    """
    matching = [rule for rule in rules if matches(rule, description, amount_cents)]
    return max(
        matching,
        key=lambda rule: (has_amount(rule), len(rule.match_text), rule.id),
        default=None,
    )


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
        rule = best_rule(rules, transaction.description, transaction.amount_cents)
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
