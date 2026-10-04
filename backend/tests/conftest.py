import pytest
from fastapi.testclient import TestClient
from sqlalchemy.orm import Session

from app.db import engine, get_session
from app.main import app
from app.models import Account, User
from app.users import create_user, get_current_user


@pytest.fixture
def session():
    """A session whose changes are rolled back when the test ends.

    Tests run against the real Postgres, inside one outer transaction, so they
    leave nothing behind and never see each other's rows.
    """
    connection = engine.connect()
    outer = connection.begin()
    session = Session(bind=connection, join_transaction_mode="create_savepoint")
    try:
        yield session
    finally:
        session.close()
        outer.rollback()
        connection.close()


@pytest.fixture
def user(session) -> User:
    return create_user(session, "Test user")


@pytest.fixture
def account(session, user) -> Account:
    account = Account(user_id=user.id, name="Chequing")
    session.add(account)
    session.flush()
    return account


@pytest.fixture
def client(session, user):
    app.dependency_overrides[get_session] = lambda: session
    app.dependency_overrides[get_current_user] = lambda: user
    yield TestClient(app)
    app.dependency_overrides.clear()
