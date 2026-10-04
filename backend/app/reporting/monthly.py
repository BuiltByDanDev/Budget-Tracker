"""Spending, Income and Savings Rate per Month."""

from dataclasses import dataclass, field
from datetime import date

from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.models import Importance, Kind, Transaction


@dataclass
class MonthFigures:
    # The first day of the Month.
    month: date
    spending_cents: int = 0
    income_cents: int = 0
    # Keyed by Category id; None holds Expenses still in the Review Inbox.
    spending_by_category: dict[int | None, int] = field(default_factory=dict)
    spending_by_importance: dict[Importance | None, int] = field(default_factory=dict)

    @property
    def savings_rate(self) -> float | None:
        """The share of Income left after Spending. None in a Month with no Income."""
        if self.income_cents <= 0:
            return None
        return (self.income_cents - self.spending_cents) / self.income_cents


def next_month(month: date) -> date:
    return date(month.year + month.month // 12, month.month % 12 + 1, 1)


def monthly_figures(
    session: Session, user_id: int, first_month: date, last_month: date
) -> list[MonthFigures]:
    """Figures for every Month from first_month to last_month, including empty ones.

    A Transaction belongs to the Month of its posting date. Transfers count
    towards nothing. A Refund is an Expense with money in, so it lowers Spending.
    """
    figures: dict[date, MonthFigures] = {}
    month = first_month
    while month <= last_month:
        figures[month] = MonthFigures(month)
        month = next_month(month)

    month_start = func.date_trunc("month", Transaction.posted_on)
    rows = session.execute(
        select(
            month_start,
            Transaction.kind,
            Transaction.category_id,
            Transaction.importance,
            func.sum(Transaction.amount_cents),
        )
        .where(
            Transaction.user_id == user_id,
            Transaction.kind != Kind.TRANSFER,
            Transaction.posted_on >= first_month,
            Transaction.posted_on < next_month(last_month),
        )
        .group_by(
            month_start, Transaction.kind, Transaction.category_id, Transaction.importance
        )
    )
    for started, kind, category_id, importance, amount_cents in rows:
        month_figures = figures[started.date()]
        if kind == Kind.INCOME:
            month_figures.income_cents += amount_cents
            continue
        spent = -amount_cents
        month_figures.spending_cents += spent
        by_category = month_figures.spending_by_category
        by_category[category_id] = by_category.get(category_id, 0) + spent
        by_importance = month_figures.spending_by_importance
        by_importance[importance] = by_importance.get(importance, 0) + spent

    return list(figures.values())


def months_with_transactions(session: Session, user_id: int) -> tuple[date, date] | None:
    """The first and last Month that have any Transaction, or None if there are none."""
    earliest, latest = session.execute(
        select(func.min(Transaction.posted_on), func.max(Transaction.posted_on)).where(
            Transaction.user_id == user_id
        )
    ).one()
    if earliest is None:
        return None
    return earliest.replace(day=1), latest.replace(day=1)
