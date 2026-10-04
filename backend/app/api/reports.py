from datetime import date

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy.orm import Session

from app.db import get_session
from app.models import Importance, User
from app.reporting.monthly import (
    MonthFigures,
    monthly_figures,
    months_with_transactions,
)
from app.users import get_current_user

router = APIRouter(prefix="/api/reports", tags=["reports"])

MAX_MONTHS = 120


class CategorySpending(BaseModel):
    # None holds Expenses still in the Review Inbox.
    category_id: int | None
    spending_cents: int


class ImportanceSpending(BaseModel):
    importance: Importance | None
    spending_cents: int


class MonthOut(BaseModel):
    # "2026-03"
    month: str
    spending_cents: int
    pay_cents: int
    other_income_cents: int
    savings_rate: float | None
    by_category: list[CategorySpending]
    by_importance: list[ImportanceSpending]

    @classmethod
    def from_figures(cls, figures: MonthFigures) -> "MonthOut":
        return cls(
            month=figures.month.strftime("%Y-%m"),
            spending_cents=figures.spending_cents,
            pay_cents=figures.pay_cents,
            other_income_cents=figures.other_income_cents,
            savings_rate=figures.savings_rate,
            by_category=[
                CategorySpending(category_id=category_id, spending_cents=cents)
                for category_id, cents in figures.spending_by_category.items()
            ],
            by_importance=[
                ImportanceSpending(importance=importance, spending_cents=cents)
                for importance, cents in figures.spending_by_importance.items()
            ],
        )


class MonthlyReport(BaseModel):
    months: list[MonthOut]
    spending_limit_cents: int | None


class DataRange(BaseModel):
    # The first and last Month with any Transaction ("2026-03"), or null when empty.
    first_month: str | None
    last_month: str | None


def _parse_month(value: str) -> date:
    try:
        year, month = value.split("-")
        return date(int(year), int(month), 1)
    except ValueError:
        raise HTTPException(422, f"'{value}' is not a month like 2026-03") from None


@router.get("/monthly", response_model=MonthlyReport)
def monthly_report(
    first_month: str,
    last_month: str,
    session: Session = Depends(get_session),
    user: User = Depends(get_current_user),
):
    first, last = _parse_month(first_month), _parse_month(last_month)
    span = (last.year - first.year) * 12 + last.month - first.month + 1
    if span < 1 or span > MAX_MONTHS:
        raise HTTPException(422, f"Choose between 1 and {MAX_MONTHS} months")
    return MonthlyReport(
        months=[
            MonthOut.from_figures(figures)
            for figures in monthly_figures(
                session, user.id, first, last, user.pay_days or []
            )
        ],
        spending_limit_cents=user.spending_limit_cents,
    )


@router.get("/data-range", response_model=DataRange)
def data_range(
    session: Session = Depends(get_session), user: User = Depends(get_current_user)
):
    months = months_with_transactions(session, user.id)
    if months is None:
        return DataRange(first_month=None, last_month=None)
    return DataRange(
        first_month=months[0].strftime("%Y-%m"), last_month=months[1].strftime("%Y-%m")
    )
