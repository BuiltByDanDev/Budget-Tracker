import pytest
from sqlalchemy import select

from app.models import Category, Transaction

MAPPING = {
    "has_header": True,
    "date_column": 0,
    "date_format": "%Y-%m-%d",
    "description_columns": [1],
    "amount_mode": "single",
    "amount_column": 2,
}

STATEMENT = b"""Date,Description,Amount
2026-01-31,GROCERY MART,-100.00
2026-02-01,GROCERY MART,-60.00
2026-02-10,PAYROLL,2000.00
2026-02-12,SHOE STORE,-120.00
2026-02-14,TFR TO SAVINGS,-500.00
2026-02-20,SHOE STORE REFUND,40.00
2026-02-28,MYSTERY CHARGE,-15.00
2026-04-02,GROCERY MART,-70.00
"""


def category_id(session, user, name):
    return session.scalar(
        select(Category.id).where(Category.user_id == user.id, Category.name == name)
    )


@pytest.fixture
def classified(client, session, user, account):
    """The statement imported, with everything but the mystery charge classified."""
    client.put(f"/api/accounts/{account.id}/csv-mapping", json=MAPPING)
    client.post(
        f"/api/accounts/{account.id}/imports",
        files={"file": ("export.csv", STATEMENT, "text/csv")},
    )
    transactions = {
        (t.posted_on.isoformat(), t.description): t
        for t in session.scalars(
            select(Transaction).where(Transaction.account_id == account.id)
        )
    }

    def classify(key, **body):
        response = client.put(
            f"/api/transactions/{transactions[key].id}/classification", json=body
        )
        assert response.status_code == 200

    groceries = category_id(session, user, "Groceries")
    shopping = category_id(session, user, "Shopping")
    classify(
        ("2026-01-31", "GROCERY MART"),
        kind="expense",
        category_id=groceries,
        importance="essential",
        rule_match_text="GROCERY MART",
    )
    classify(
        ("2026-02-12", "SHOE STORE"),
        kind="expense",
        category_id=shopping,
        importance="nice_to_have",
        rule_match_text="SHOE STORE",
    )
    classify(("2026-02-14", "TFR TO SAVINGS"), kind="transfer")
    return {"groceries": groceries, "shopping": shopping}


def report(client, first_month, last_month):
    response = client.get(
        "/api/reports/monthly",
        params={"first_month": first_month, "last_month": last_month},
    )
    assert response.status_code == 200
    return response.json()


def test_month_totals_leave_out_transfers_and_net_refunds(client, classified):
    february = report(client, "2026-02", "2026-02")["months"][0]

    # 60 groceries + 120 shoes - 40 refund + 15 mystery; the 500 transfer is excluded.
    assert february["spending_cents"] == 15500
    assert february["income_cents"] == 200000
    assert february["savings_rate"] == pytest.approx(0.9225)


def test_a_refund_lowers_spending_in_its_category(client, classified):
    february = report(client, "2026-02", "2026-02")["months"][0]
    by_category = {c["category_id"]: c["spending_cents"] for c in february["by_category"]}

    assert by_category == {
        classified["groceries"]: 6000,
        classified["shopping"]: 8000,
        None: 1500,
    }


def test_spending_by_importance(client, classified):
    february = report(client, "2026-02", "2026-02")["months"][0]
    by_importance = {i["importance"]: i["spending_cents"] for i in february["by_importance"]}

    assert by_importance == {"essential": 6000, "nice_to_have": 8000, None: 1500}


def test_a_transaction_belongs_to_the_month_of_its_posting_date(client, classified):
    months = report(client, "2026-01", "2026-02")["months"]

    assert [m["month"] for m in months] == ["2026-01", "2026-02"]
    assert months[0]["spending_cents"] == 10000


def test_months_without_transactions_are_included_as_zero(client, classified):
    months = report(client, "2026-02", "2026-04")["months"]

    assert [m["spending_cents"] for m in months] == [15500, 0, 7000]
    assert months[1]["savings_rate"] is None
    assert months[1]["by_category"] == []


def test_data_range_spans_first_to_last_transaction(client, classified):
    assert client.get("/api/reports/data-range").json() == {
        "first_month": "2026-01",
        "last_month": "2026-04",
    }


def test_spending_limit_is_returned_with_the_report(client, classified):
    client.put("/api/settings", json={"spending_limit_cents": 300000})

    assert report(client, "2026-02", "2026-02")["spending_limit_cents"] == 300000


def test_category_target_can_be_set_and_removed(client, classified):
    groceries = classified["groceries"]

    set_target = client.patch(
        f"/api/categories/{groceries}", json={"monthly_target_cents": 60000}
    )
    renamed = client.patch(f"/api/categories/{groceries}", json={"name": "Food"})
    removed = client.patch(
        f"/api/categories/{groceries}", json={"monthly_target_cents": None}
    )

    assert set_target.json()["monthly_target_cents"] == 60000
    # Renaming does not touch the target.
    assert renamed.json() == {
        "id": groceries,
        "name": "Food",
        "monthly_target_cents": 60000,
        "retired": False,
    }
    assert removed.json()["monthly_target_cents"] is None


def test_category_names_are_unique(client, classified):
    assert client.post("/api/categories", json={"name": "groceries"}).status_code == 409
    assert client.post("/api/categories", json={"name": "Pets"}).status_code == 201
