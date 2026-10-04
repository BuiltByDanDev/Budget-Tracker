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
    classify(("2026-02-10", "PAYROLL"), kind="pay")
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
    assert february["pay_cents"] == 200000
    assert february["other_income_cents"] == 0
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


def test_other_income_is_counted_apart_from_pay_and_not_in_the_savings_rate(
    client, session, account
):
    statement = b"""Date,Description,Amount
2026-06-01,PAYROLL,1000.00
2026-06-05,E-TRANSFER FROM SAM,400.00
2026-06-09,GROCERY MART,-250.00
"""
    client.put(f"/api/accounts/{account.id}/csv-mapping", json=MAPPING)
    client.post(
        f"/api/accounts/{account.id}/imports",
        files={"file": ("export.csv", statement, "text/csv")},
    )
    payroll = session.scalar(
        select(Transaction).where(
            Transaction.account_id == account.id, Transaction.description == "PAYROLL"
        )
    )

    before = report(client, "2026-06", "2026-06")["months"][0]
    # A Rule, so later pay is marked without being asked.
    client.put(
        f"/api/transactions/{payroll.id}/classification",
        json={"kind": "pay", "rule_match_text": "PAYROLL"},
    )
    june = report(client, "2026-06", "2026-06")["months"][0]

    # Money in starts as Other Income, and there is no Savings Rate without Pay.
    assert before["pay_cents"] == 0
    assert before["other_income_cents"] == 140000
    assert before["savings_rate"] is None
    assert june["pay_cents"] == 100000
    assert june["other_income_cents"] == 40000
    # 750 of the 1,000 Pay is left; the 400 e-transfer does not raise it.
    assert june["savings_rate"] == pytest.approx(0.75)


def test_pay_counts_in_the_month_of_its_nearest_pay_day(client, session, account):
    # August 1st 2026 is a Saturday, so that pay arrives on Friday July 31st.
    statement = b"""Date,Description,Amount
2026-07-02,PAYROLL,1000.00
2026-07-16,PAYROLL,1000.00
2026-07-31,PAYROLL,1000.00
2026-07-31,E-TRANSFER FROM SAM,50.00
2026-08-14,PAYROLL,1000.00
"""
    client.put(f"/api/accounts/{account.id}/csv-mapping", json=MAPPING)
    client.post(
        f"/api/accounts/{account.id}/imports",
        files={"file": ("export.csv", statement, "text/csv")},
    )
    payroll = session.scalars(
        select(Transaction).where(
            Transaction.account_id == account.id, Transaction.description == "PAYROLL"
        )
    ).first()
    client.put(
        f"/api/transactions/{payroll.id}/classification",
        json={"kind": "pay", "rule_match_text": "PAYROLL"},
    )

    by_posting_date = report(client, "2026-07", "2026-08")["months"]
    response = client.put("/api/settings", json={"pay_days": [16, 1]})
    july, august = report(client, "2026-07", "2026-08")["months"]
    listed = client.get("/api/transactions", params={"kind": "pay"}).json()["items"]

    assert [m["pay_cents"] for m in by_posting_date] == [300000, 100000]
    assert response.json()["pay_days"] == [1, 16]
    assert july["pay_cents"] == 200000
    assert august["pay_cents"] == 200000
    # Only Pay moves: the e-transfer of the same day stays in July.
    assert july["other_income_cents"] == 5000
    moved = {t["posted_on"]: t["counts_in_month"] for t in listed}
    assert moved == {
        "2026-07-02": None,
        "2026-07-16": None,
        "2026-07-31": "2026-08",
        "2026-08-14": None,
    }


def test_changing_one_setting_leaves_the_other(client):
    client.put("/api/settings", json={"spending_limit_cents": 300000})
    client.put("/api/settings", json={"pay_days": [1, 16]})
    after_limit = client.put("/api/settings", json={"spending_limit_cents": 250000})

    assert after_limit.json() == {"spending_limit_cents": 250000, "pay_days": [1, 16]}
    assert client.put("/api/settings", json={"pay_days": [0]}).status_code == 422
    assert client.put("/api/settings", json={"pay_days": [32]}).status_code == 422
