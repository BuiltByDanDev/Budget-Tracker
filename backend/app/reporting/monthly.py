"""Spending, Money Back, Pay, Other Income and Savings Rate per Month."""

from collections.abc import Sequence
from dataclasses import dataclass, field
from datetime import date, timedelta

from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.models import Importance, Kind, Transaction


@dataclass
class MonthFigures:
    # The first day of the Month.
    month: date
    # Expenses less Refunds and Money Back.
    spending_cents: int = 0
    # The part of that reduction that came from Money Back.
    money_back_cents: int = 0
    pay_cents: int = 0
    other_income_cents: int = 0
    # Keyed by Category id; None holds Expenses still in the Review Inbox.
    spending_by_category: dict[int | None, int] = field(default_factory=dict)
    spending_by_importance: dict[Importance | None, int] = field(default_factory=dict)

    @property
    def savings_rate(self) -> float | None:
        """The share of Pay left after Spending. None in a Month with no Pay.

        Other Income is left out, so money in that is neither earnings nor
        someone repaying a cost (a tax refund, a gift) cannot make a Month look
        better than it was.
        """
        if self.pay_cents <= 0:
            return None
        return (self.pay_cents - self.spending_cents) / self.pay_cents


def next_month(month: date) -> date:
    return date(month.year + month.month // 12, month.month % 12 + 1, 1)


def previous_month(month: date) -> date:
    return (month - timedelta(days=1)).replace(day=1)


def pay_month(posted_on: date, pay_days: Sequence[int]) -> date:
    """The first day of the Month a Pay Transaction counts in.

    Pay due on the 1st can arrive on the last days of the month before, when the
    1st is a weekend or a holiday. So Pay counts in the Month of its nearest Pay
    Day, looking at the month before, its own month and the month after. With
    no Pay Days it counts in the Month it was posted.
    """
    own_month = posted_on.replace(day=1)
    if not pay_days:
        return own_month
    candidates = []
    for month in (previous_month(own_month), own_month, next_month(own_month)):
        last_day = (next_month(month) - timedelta(days=1)).day
        # A Pay Day the month does not have (the 31st in June) is its last day.
        candidates += [month.replace(day=min(day, last_day)) for day in pay_days]
    nearest = min(
        candidates,
        # The closest Pay Day; when two are equally close, the one in its own month.
        key=lambda pay_day: (abs((pay_day - posted_on).days), pay_day.replace(day=1) != own_month),
    )
    return nearest.replace(day=1)


def monthly_figures(
    session: Session,
    user_id: int,
    first_month: date,
    last_month: date,
    pay_days: Sequence[int] = (),
) -> list[MonthFigures]:
    """Figures for every Month from first_month to last_month, including empty ones.

    A Transaction belongs to the Month of its posting date, except Pay, which
    belongs to the Month of its nearest Pay Day (see pay_month). Transfers count
    towards nothing. A Refund is an Expense with money in, so it lowers Spending
    in its Category. Money Back lowers Spending too, but in no Category.
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
            Transaction.kind.not_in([Kind.TRANSFER, Kind.PAY]),
            Transaction.posted_on >= first_month,
            Transaction.posted_on < next_month(last_month),
        )
        .group_by(
            month_start, Transaction.kind, Transaction.category_id, Transaction.importance
        )
    )
    for started, kind, category_id, importance, amount_cents in rows:
        month_figures = figures[started.date()]
        if kind == Kind.OTHER_INCOME:
            month_figures.other_income_cents += amount_cents
            continue
        if kind == Kind.MONEY_BACK:
            month_figures.money_back_cents += amount_cents
            month_figures.spending_cents -= amount_cents
            continue
        spent = -amount_cents
        month_figures.spending_cents += spent
        by_category = month_figures.spending_by_category
        by_category[category_id] = by_category.get(category_id, 0) + spent
        by_importance = month_figures.spending_by_importance
        by_importance[importance] = by_importance.get(importance, 0) + spent

    # Pay is placed one Transaction at a time, since it can count in the Month
    # before or after its posting date. So look one month either side.
    pay = session.execute(
        select(Transaction.posted_on, Transaction.amount_cents).where(
            Transaction.user_id == user_id,
            Transaction.kind == Kind.PAY,
            Transaction.posted_on >= previous_month(first_month),
            Transaction.posted_on < next_month(next_month(last_month)),
        )
    )
    for posted_on, amount_cents in pay:
        month = pay_month(posted_on, pay_days)
        if month in figures:
            figures[month].pay_cents += amount_cents

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
