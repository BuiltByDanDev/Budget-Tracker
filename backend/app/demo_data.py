"""Fills the demo stack's database with mock data, replacing whatever is there.

Run it inside the demo stack's api container:

    docker compose --env-file .env.demo exec api python -m app.demo_data

It deletes every row first, so it refuses to run unless DEMO is true. That flag
is only set by .env.demo, which keeps it away from the real database.

The rows are written as two CSVs and sent through the same Import code as a
real bank export, so mock data arrives the way real data does.
"""

import random
import sys
from datetime import date, timedelta

from app.classifying.rules import reapply_rules
from app.config import settings
from app.db import SessionLocal
from app.importing.service import import_csv
from app.models import Account, Base, Category, Importance, Kind, Merchant, Rule
from app.reporting.monthly import next_month
from app.users import create_user

MONTHS = 6

# Chequing: one signed amount column, money out negative.
CHEQUING_MAPPING = {
    "has_header": True,
    "date_column": 0,
    "date_format": "%Y-%m-%d",
    "description_columns": [1],
    "amount_mode": "single",
    "amount_column": 2,
}

# Credit card: purchases are positive, and a US purchase leaves CAD$ empty and
# fills USD$, which makes it an Unconverted Amount.
CARD_MAPPING = {
    "has_header": True,
    "date_column": 0,
    "date_format": "%m/%d/%Y",
    "description_columns": [1],
    "amount_mode": "single",
    "amount_column": 2,
    "fallback_amount_column": 3,
    "money_out_is_negative": False,
}

# (text, Kind, Category, Importance, Merchant). The gas station, Amazon (its
# Refund included) and the US charge have no Rule on purpose, so the Review
# Inbox has something in it.
RULES = [
    ("MAPLE PROPERTY MGMT", Kind.EXPENSE, "Housing", Importance.ESSENTIAL, None),
    ("LOBLAWS", Kind.EXPENSE, "Groceries", Importance.ESSENTIAL, "Loblaws"),
    ("HYDRO ONE", Kind.EXPENSE, "Utilities", Importance.ESSENTIAL, "Hydro One"),
    ("ROGERS WIRELESS", Kind.EXPENSE, "Utilities", Importance.HAVE_TO_HAVE, "Rogers"),
    ("NETFLIX.COM", Kind.EXPENSE, "Subscriptions", Importance.NICE_TO_HAVE, "Netflix"),
    ("SPOTIFY", Kind.EXPENSE, "Subscriptions", Importance.NICE_TO_HAVE, "Spotify"),
    ("UBER EATS", Kind.EXPENSE, "Dining", Importance.SHOULDNT_HAVE, "Uber Eats"),
    ("CORNER CAFE", Kind.EXPENSE, "Dining", Importance.NICE_TO_HAVE, "Corner Cafe"),
    ("PAYROLL DEPOSIT", Kind.PAY, None, None, None),
    # A housemate's share of the rent and bills.
    ("E-TRANSFER FROM JORDAN", Kind.MONEY_BACK, None, None, None),
    ("SAVINGS INTEREST", Kind.OTHER_INCOME, None, None, None),
    # Both sides of the monthly card payment.
    ("VISA PAYMENT", Kind.TRANSFER, None, None, None),
    ("PAYMENT - THANK YOU", Kind.TRANSFER, None, None, None),
]

SPENDING_LIMIT_CENTS = 350_000
PAY_DAYS = [1, 16]
CATEGORY_TARGETS_CENTS = {"Groceries": 60_000, "Dining": 15_000, "Transportation": 30_000}


def pay_day(day: date) -> date:
    """Pay due on a weekend arrives the Friday before, sometimes in the previous Month."""
    while day.weekday() >= 5:
        day -= timedelta(days=1)
    return day


def mock_rows(today: date) -> tuple[list[tuple], list[tuple]]:
    """Rows for the chequing and the card CSV: (date, Description, amount[, USD amount]).

    The same seed every time, so two runs on the same day give the same figures.
    """
    rng = random.Random(34)
    dollars = lambda low, high: f"{rng.uniform(low, high):.2f}"
    first = today.replace(day=1)
    for _ in range(MONTHS - 1):
        first = (first - timedelta(days=1)).replace(day=1)

    chequing: list[tuple] = []
    card: list[tuple] = []
    month = first
    while month <= today:
        on = lambda day_of_month: month.replace(day=day_of_month)
        some_days = lambda count: sorted(rng.sample(range(1, 29), count))
        # Twice-monthly pay.
        for day in PAY_DAYS:
            chequing.append((pay_day(on(day)), "PAYROLL DEPOSIT ACME CORP", "2450.00"))
        chequing.append((on(1), "PREAUTHORIZED DEBIT MAPLE PROPERTY MGMT", "-1650.00"))
        chequing.append((on(12), "HYDRO ONE BILL PAYMENT", "-" + dollars(70, 120)))
        chequing.append((on(20), "ROGERS WIRELESS", "-85.00"))
        # Money in that is not pay: Money Back, and a little Other Income.
        for day in some_days(rng.randint(1, 2)):
            chequing.append((on(day), "E-TRANSFER FROM JORDAN", dollars(40, 300)))
        chequing.append((on(28), "SAVINGS INTEREST", dollars(2, 6)))
        # The card payment leaves chequing and arrives on the card.
        payment = dollars(900, 1500)
        chequing.append((on(25), "VISA PAYMENT", "-" + payment))
        card.append((on(25), "PAYMENT - THANK YOU", "-" + payment, ""))

        card.append((on(3), "NETFLIX.COM 4471", "16.99", ""))
        card.append((on(8), "SPOTIFY P2A91B", "11.99", ""))
        card.append((on(14), "DIGITALOCEAN.COM", "", "12.00"))
        for day in some_days(4):
            card.append((on(day), "LOBLAWS #1021", dollars(60, 160), ""))
        # One gas station, two sorts of purchase: fill-ups and snacks.
        for day in some_days(rng.randint(2, 3)):
            card.append((on(day), "PETRO-CANADA 1234", dollars(45, 95), ""))
        for day in some_days(rng.randint(2, 4)):
            card.append((on(day), "PETRO-CANADA 1234", dollars(3, 12), ""))
        for day in some_days(rng.randint(3, 5)):
            card.append((on(day), "UBER EATS TORONTO", dollars(18, 45), ""))
        for day in some_days(rng.randint(4, 7)):
            card.append((on(day), "SQ *CORNER CAFE", dollars(4, 9), ""))
        for day in some_days(rng.randint(1, 3)):
            order = rng.randint(10000, 99999)
            card.append((on(day), f"AMZN Mktp CA*{order}", dollars(15, 120), ""))

        month = next_month(month)

    # One Refund, in the second Month.
    card.append((next_month(first).replace(day=18), "AMZN Mktp CA*REFUND", "-34.50", ""))

    not_future = lambda rows: sorted(row for row in rows if row[0] <= today)
    return not_future(chequing), not_future(card)


def as_csv(header: str, rows: list[tuple], date_format: str) -> bytes:
    lines = [header]
    for posted_on, *cells in rows:
        lines.append(",".join([posted_on.strftime(date_format), *cells]))
    return ("\n".join(lines) + "\n").encode()


def main() -> None:
    if not settings.demo:
        sys.exit(
            "Refusing to run: this deletes every row, and DEMO is not true.\n"
            "Use the demo stack: docker compose --env-file .env.demo exec api python -m app.demo_data"
        )

    chequing_rows, card_rows = mock_rows(date.today())
    with SessionLocal() as session:
        # Children before parents, so no row is deleted while another points at it.
        for table in reversed(Base.metadata.sorted_tables):
            session.execute(table.delete())

        user = create_user(session, "Demo")
        user.spending_limit_cents = SPENDING_LIMIT_CENTS
        user.pay_days = PAY_DAYS
        categories = {
            category.name: category
            for category in session.query(Category).filter_by(user_id=user.id)
        }
        for name, target_cents in CATEGORY_TARGETS_CENTS.items():
            categories[name].monthly_target_cents = target_cents

        chequing = Account(user_id=user.id, name="Chequing", csv_mapping=CHEQUING_MAPPING)
        card = Account(user_id=user.id, name="Credit card", csv_mapping=CARD_MAPPING)
        session.add_all([chequing, card])
        session.flush()

        import_csv(
            session,
            chequing,
            "chequing.csv",
            as_csv("Date,Description,Amount", chequing_rows, "%Y-%m-%d"),
        )
        import_csv(
            session,
            card,
            "card.csv",
            as_csv("Date,Description,CAD$,USD$", card_rows, "%m/%d/%Y"),
        )

        for text, kind, category_name, importance, merchant_name in RULES:
            merchant = None
            if merchant_name:
                merchant = Merchant(user_id=user.id, name=merchant_name)
                session.add(merchant)
                session.flush()
            session.add(
                Rule(
                    user_id=user.id,
                    match_text=text,
                    kind=kind,
                    category_id=categories[category_name].id if category_name else None,
                    importance=importance,
                    merchant_id=merchant.id if merchant else None,
                )
            )
        session.flush()
        classified = reapply_rules(session, user.id)
        session.commit()

    total = len(chequing_rows) + len(card_rows)
    print(f"Demo data loaded: {total} transactions, {classified} classified by rules.")


if __name__ == "__main__":
    main()
