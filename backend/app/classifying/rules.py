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


def _classification(transaction: Transaction) -> tuple:
    return (
        transaction.kind,
        transaction.category_id,
        transaction.importance,
        transaction.merchant_id,
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
    """Puts each Transaction in step with the Rules. Returns how many it changed.

    A Transaction takes the classification of its best Rule. One that no Rule
    matches goes back to how an Import leaves it: an Expense with no Category,
    whether it is money out or money in, so it waits in the Review Inbox.
    """
    rules = session.scalars(select(Rule).where(Rule.user_id == user_id)).all()
    changed = 0
    for transaction in transactions:
        before = _classification(transaction)
        rule = best_rule(rules, transaction.description, transaction.amount_cents)
        if rule is not None:
            classify(
                transaction, rule.kind, rule.category_id, rule.importance, rule.merchant_id
            )
        else:
            classify(transaction, Kind.EXPENSE, None, None, None)
        transaction.rule_id = rule.id if rule is not None else None
        if _classification(transaction) != before:
            changed += 1
    return changed


def reapply_rules(session: Session, user_id: int) -> int:
    """Runs the Rules over every stored Transaction the User has not set by hand.

    Called whenever a Rule is added, changed or deleted, so that those
    Transactions always reflect the Rules as they are now.
    """
    not_set_by_hand = session.scalars(
        select(Transaction).where(
            Transaction.user_id == user_id,
            Transaction.set_by_hand.is_(False),
        )
    ).all()
    return apply_rules(session, user_id, not_set_by_hand)
