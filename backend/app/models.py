"""Database tables. The vocabulary here follows CONTEXT.md."""

import enum
from datetime import date, datetime

from sqlalchemy import JSON, Enum, ForeignKey, Index, UniqueConstraint, func
from sqlalchemy.orm import DeclarativeBase, Mapped, mapped_column, relationship


class Base(DeclarativeBase):
    pass


class Kind(enum.StrEnum):
    EXPENSE = "expense"
    INCOME = "income"
    TRANSFER = "transfer"


class Importance(enum.StrEnum):
    ESSENTIAL = "essential"
    HAVE_TO_HAVE = "have_to_have"
    NICE_TO_HAVE = "nice_to_have"
    SHOULDNT_HAVE = "shouldnt_have"


def _enum_column(enum_class: type[enum.Enum]) -> Enum:
    # Stored as plain text ("expense"), not as a Postgres enum type, so adding
    # a value later does not need a special migration.
    return Enum(
        enum_class,
        native_enum=False,
        length=20,
        values_callable=lambda members: [member.value for member in members],
    )


class User(Base):
    __tablename__ = "users"

    id: Mapped[int] = mapped_column(primary_key=True)
    name: Mapped[str]
    spending_limit_cents: Mapped[int | None]


class Account(Base):
    __tablename__ = "accounts"
    __table_args__ = (UniqueConstraint("user_id", "name"),)

    id: Mapped[int] = mapped_column(primary_key=True)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id"))
    name: Mapped[str]
    # The CSV Mapping, as the dict form of app.importing.csv_parser.CsvMapping.
    # Empty until the first Import for this Account.
    csv_mapping: Mapped[dict | None] = mapped_column(JSON)


class Category(Base):
    __tablename__ = "categories"
    __table_args__ = (UniqueConstraint("user_id", "name"),)

    id: Mapped[int] = mapped_column(primary_key=True)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id"))
    name: Mapped[str]
    # The Category Target.
    monthly_target_cents: Mapped[int | None]
    retired: Mapped[bool] = mapped_column(default=False)


class Merchant(Base):
    __tablename__ = "merchants"
    __table_args__ = (UniqueConstraint("user_id", "name"),)

    id: Mapped[int] = mapped_column(primary_key=True)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id"))
    name: Mapped[str]


class Rule(Base):
    __tablename__ = "rules"

    id: Mapped[int] = mapped_column(primary_key=True)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id"))
    # Matches when the Description contains this text, ignoring case.
    match_text: Mapped[str]
    # Optional: also requires the amount to be in this range, ends included.
    # Signed like Transaction.amount_cents, so money out between $40 and $150
    # is min -15000, max -4000. Both empty means any amount; an exact amount
    # has both the same.
    amount_min_cents: Mapped[int | None]
    amount_max_cents: Mapped[int | None]
    kind: Mapped[Kind] = mapped_column(_enum_column(Kind))
    category_id: Mapped[int | None] = mapped_column(ForeignKey("categories.id"))
    importance: Mapped[Importance | None] = mapped_column(_enum_column(Importance))
    merchant_id: Mapped[int | None] = mapped_column(ForeignKey("merchants.id"))


class Import(Base):
    __tablename__ = "imports"

    id: Mapped[int] = mapped_column(primary_key=True)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id"))
    account_id: Mapped[int] = mapped_column(ForeignKey("accounts.id"))
    filename: Mapped[str]
    imported_at: Mapped[datetime] = mapped_column(server_default=func.now())
    new_count: Mapped[int]
    skipped_count: Mapped[int]


class Transaction(Base):
    __tablename__ = "transactions"
    __table_args__ = (Index("ix_transactions_user_posted", "user_id", "posted_on"),)

    id: Mapped[int] = mapped_column(primary_key=True)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id"))
    account_id: Mapped[int] = mapped_column(ForeignKey("accounts.id"))
    import_id: Mapped[int] = mapped_column(ForeignKey("imports.id"))
    posted_on: Mapped[date]
    # Negative for money out, positive for money in.
    amount_cents: Mapped[int]
    # The amount as read from the CSV. Never edited, so a re-import still
    # recognises the row after the User corrects amount_cents.
    imported_amount_cents: Mapped[int]
    # True while the amount is one read from the CSV's second amount column
    # (another currency) that the User has not yet confirmed or converted.
    amount_unconverted: Mapped[bool] = mapped_column(default=False)
    # Exactly what the bank wrote. Never edited.
    description: Mapped[str]
    kind: Mapped[Kind] = mapped_column(_enum_column(Kind))
    category_id: Mapped[int | None] = mapped_column(ForeignKey("categories.id"))
    importance: Mapped[Importance | None] = mapped_column(_enum_column(Importance))
    merchant_id: Mapped[int | None] = mapped_column(ForeignKey("merchants.id"))
    # True once the User has classified this Transaction themselves.
    # Rules never change a Transaction that was set by hand.
    set_by_hand: Mapped[bool] = mapped_column(default=False)

    account: Mapped[Account] = relationship()
    category: Mapped[Category | None] = relationship()
    merchant: Mapped[Merchant | None] = relationship()
