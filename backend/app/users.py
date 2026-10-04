"""The current User.

There is no login yet: every request acts as one default User. When login is
added, `get_current_user` is the only place that needs to change.
"""

from fastapi import Depends
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.db import get_session
from app.models import Category, User

STARTER_CATEGORIES = [
    "Housing",
    "Groceries",
    "Dining",
    "Transportation",
    "Utilities",
    "Health",
    "Shopping",
    "Entertainment",
    "Travel",
    "Subscriptions",
    "Other",
]


def create_user(session: Session, name: str) -> User:
    """Creates a User with the starter Categories."""
    user = User(name=name)
    session.add(user)
    session.flush()
    session.add_all(Category(user_id=user.id, name=name) for name in STARTER_CATEGORIES)
    session.flush()
    return user


def get_current_user(session: Session = Depends(get_session)) -> User:
    user = session.scalars(select(User).order_by(User.id).limit(1)).first()
    if user is None:
        user = create_user(session, "Me")
        session.commit()
    return user
