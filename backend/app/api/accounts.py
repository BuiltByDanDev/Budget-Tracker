from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, ConfigDict
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.db import get_session
from app.importing.csv_parser import CsvMapping
from app.models import Account, User
from app.users import get_current_user

router = APIRouter(prefix="/api/accounts", tags=["accounts"])


class AccountIn(BaseModel):
    name: str


class AccountOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    name: str
    csv_mapping: CsvMapping | None


def get_account(
    account_id: int,
    session: Session = Depends(get_session),
    user: User = Depends(get_current_user),
) -> Account:
    account = session.get(Account, account_id)
    if account is None or account.user_id != user.id:
        raise HTTPException(404, "Account not found")
    return account


@router.get("", response_model=list[AccountOut])
def list_accounts(
    session: Session = Depends(get_session), user: User = Depends(get_current_user)
):
    return session.scalars(
        select(Account).where(Account.user_id == user.id).order_by(Account.name)
    ).all()


@router.post("", response_model=AccountOut, status_code=201)
def create_account(
    body: AccountIn,
    session: Session = Depends(get_session),
    user: User = Depends(get_current_user),
):
    name = body.name.strip()
    if not name:
        raise HTTPException(422, "Account name is required")
    exists = session.scalar(
        select(Account).where(Account.user_id == user.id, Account.name == name)
    )
    if exists:
        raise HTTPException(409, f"You already have an account named '{name}'")
    account = Account(user_id=user.id, name=name)
    session.add(account)
    session.commit()
    return account


@router.put("/{account_id}/csv-mapping", response_model=AccountOut)
def set_csv_mapping(
    mapping: CsvMapping,
    account: Account = Depends(get_account),
    session: Session = Depends(get_session),
):
    account.csv_mapping = mapping.model_dump()
    session.commit()
    return account
