from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, ConfigDict, Field
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.db import get_session
from app.models import Category, Merchant, User
from app.users import get_current_user

router = APIRouter(prefix="/api", tags=["categories"])


class CategoryOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    name: str
    monthly_target_cents: int | None
    retired: bool


class CategoryIn(BaseModel):
    name: str


class CategoryChanges(BaseModel):
    """Only the fields that are sent are changed."""

    name: str | None = None
    # The Category Target. Send null to remove it.
    monthly_target_cents: int | None = Field(default=None, ge=0)
    retired: bool | None = None


class MerchantOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    name: str


class Settings(BaseModel):
    # The Spending Limit. Null means none is set.
    spending_limit_cents: int | None = Field(default=None, ge=0)
    # The Pay Days, such as [1, 16]. Empty means Pay is not moved between Months.
    pay_days: list[int] = []


def _unused_name(session: Session, user: User, name: str, except_id: int | None = None) -> str:
    name = name.strip()
    if not name:
        raise HTTPException(422, "Category name is required")
    clash = session.scalar(
        select(Category).where(
            Category.user_id == user.id,
            func.lower(Category.name) == name.lower(),
            Category.id != except_id,
        )
    )
    if clash:
        raise HTTPException(409, f"You already have a category named '{clash.name}'")
    return name


@router.get("/categories", response_model=list[CategoryOut])
def list_categories(
    session: Session = Depends(get_session), user: User = Depends(get_current_user)
):
    return session.scalars(
        select(Category).where(Category.user_id == user.id).order_by(Category.name)
    ).all()


@router.post("/categories", response_model=CategoryOut, status_code=201)
def create_category(
    body: CategoryIn,
    session: Session = Depends(get_session),
    user: User = Depends(get_current_user),
):
    category = Category(user_id=user.id, name=_unused_name(session, user, body.name))
    session.add(category)
    session.commit()
    return category


@router.patch("/categories/{category_id}", response_model=CategoryOut)
def change_category(
    category_id: int,
    body: CategoryChanges,
    session: Session = Depends(get_session),
    user: User = Depends(get_current_user),
):
    category = session.get(Category, category_id)
    if category is None or category.user_id != user.id:
        raise HTTPException(404, "Category not found")
    sent = body.model_fields_set
    if "name" in sent and body.name is not None:
        category.name = _unused_name(session, user, body.name, except_id=category.id)
    if "monthly_target_cents" in sent:
        category.monthly_target_cents = body.monthly_target_cents
    if "retired" in sent and body.retired is not None:
        category.retired = body.retired
    session.commit()
    return category


@router.get("/merchants", response_model=list[MerchantOut])
def list_merchants(
    session: Session = Depends(get_session), user: User = Depends(get_current_user)
):
    return session.scalars(
        select(Merchant).where(Merchant.user_id == user.id).order_by(Merchant.name)
    ).all()


@router.get("/settings", response_model=Settings)
def get_settings(user: User = Depends(get_current_user)):
    return Settings(
        spending_limit_cents=user.spending_limit_cents, pay_days=user.pay_days or []
    )


@router.put("/settings", response_model=Settings)
def change_settings(
    body: Settings,
    session: Session = Depends(get_session),
    user: User = Depends(get_current_user),
):
    """Only the fields that are sent are changed."""
    sent = body.model_fields_set
    if "spending_limit_cents" in sent:
        user.spending_limit_cents = body.spending_limit_cents
    if "pay_days" in sent:
        if any(day < 1 or day > 31 for day in body.pay_days):
            raise HTTPException(422, "A pay day is a day of the month, from 1 to 31")
        user.pay_days = sorted(set(body.pay_days))
    session.commit()
    return get_settings(user)
