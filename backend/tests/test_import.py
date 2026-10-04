import json

from sqlalchemy import func, select

from app.models import Kind, Transaction

MAPPING = {
    "has_header": True,
    "date_column": 0,
    "date_format": "%Y-%m-%d",
    "description_columns": [1],
    "amount_mode": "single",
    "amount_column": 2,
}

JAN_TO_FEB = b"""Date,Description,Amount
2026-01-15,RENT,-1500.00
2026-02-03,COFFEE SHOP,-4.50
2026-02-03,COFFEE SHOP,-4.50
2026-02-10,PAYROLL,2000.00
"""

FEB_TO_MAR = b"""Date,Description,Amount
2026-02-03,COFFEE SHOP,-4.50
2026-02-03,COFFEE SHOP,-4.50
2026-02-10,PAYROLL,2000.00
2026-03-01,GROCERY MART,-80.25
"""


def upload(client, account, content, filename="export.csv"):
    return client.post(
        f"/api/accounts/{account.id}/imports",
        files={"file": (filename, content, "text/csv")},
    )


def stored_count(session, account):
    return session.scalar(
        select(func.count()).where(Transaction.account_id == account.id)
    )


def test_import_needs_a_csv_mapping_first(client, account):
    assert upload(client, account, JAN_TO_FEB).status_code == 409


def test_import_stores_rows_and_keeps_identical_rows_in_one_file(
    client, session, account
):
    client.put(f"/api/accounts/{account.id}/csv-mapping", json=MAPPING)

    response = upload(client, account, JAN_TO_FEB)

    assert response.status_code == 200
    assert response.json()["new_count"] == 4
    assert response.json()["skipped_count"] == 0
    assert stored_count(session, account) == 4


def test_money_out_is_an_expense_and_money_in_is_other_income(client, session, account):
    client.put(f"/api/accounts/{account.id}/csv-mapping", json=MAPPING)
    upload(client, account, JAN_TO_FEB)

    kinds = dict(
        session.execute(
            select(Transaction.description, Transaction.kind).where(
                Transaction.account_id == account.id
            )
        ).all()
    )

    assert kinds["RENT"] == Kind.EXPENSE
    assert kinds["PAYROLL"] == Kind.OTHER_INCOME


def test_reimporting_the_same_file_adds_nothing(client, session, account):
    client.put(f"/api/accounts/{account.id}/csv-mapping", json=MAPPING)
    upload(client, account, JAN_TO_FEB)

    again = upload(client, account, JAN_TO_FEB).json()

    assert (again["new_count"], again["skipped_count"]) == (0, 4)
    assert stored_count(session, account) == 4


def test_overlapping_export_adds_only_the_new_rows(client, session, account):
    client.put(f"/api/accounts/{account.id}/csv-mapping", json=MAPPING)
    upload(client, account, JAN_TO_FEB)

    overlap = upload(client, account, FEB_TO_MAR).json()

    assert (overlap["new_count"], overlap["skipped_count"]) == (1, 3)
    assert stored_count(session, account) == 5


def test_same_row_in_another_account_is_not_a_duplicate(client, session, user, account):
    other = client.post("/api/accounts", json={"name": "Visa"}).json()
    for account_id in (account.id, other["id"]):
        client.put(f"/api/accounts/{account_id}/csv-mapping", json=MAPPING)
    upload(client, account, JAN_TO_FEB)

    response = client.post(
        f"/api/accounts/{other['id']}/imports",
        files={"file": ("visa.csv", JAN_TO_FEB, "text/csv")},
    )

    assert response.json()["new_count"] == 4


def test_unreadable_file_stores_nothing_and_reports_rows(client, session, account):
    client.put(f"/api/accounts/{account.id}/csv-mapping", json=MAPPING)
    bad = b"Date,Description,Amount\n2026-01-15,RENT,-1500.00\n15/01/2026,LUNCH,-12.00\n"

    response = upload(client, account, bad)

    assert response.status_code == 422
    assert response.json()["row_errors"][0]["line"] == 3
    assert stored_count(session, account) == 0


def test_transactions_are_listed_newest_first(client, account):
    client.put(f"/api/accounts/{account.id}/csv-mapping", json=MAPPING)
    upload(client, account, JAN_TO_FEB)

    page = client.get("/api/transactions").json()

    assert page["total"] == 4
    assert page["items"][0]["description"] == "PAYROLL"
    assert page["items"][0]["account_name"] == "Chequing"
    assert page["items"][-1]["amount_cents"] == -150000


def test_preview_shows_how_a_mapping_reads_the_file_without_storing(
    client, session, account
):
    response = client.post(
        "/api/csv-preview",
        files={"file": ("export.csv", JAN_TO_FEB, "text/csv")},
        data={"mapping": json.dumps(MAPPING)},
    )

    preview = response.json()
    assert preview["rows"][0] == ["Date", "Description", "Amount"]
    assert preview["transactions"][0] == {
        "posted_on": "2026-01-15",
        "description": "RENT",
        "amount_cents": -150000,
        "unconverted": False,
    }
    assert stored_count(session, account) == 0


def test_preview_reports_rows_the_mapping_cannot_read(client):
    wrong_dates = {**MAPPING, "date_format": "%d/%m/%Y"}

    preview = client.post(
        "/api/csv-preview",
        files={"file": ("export.csv", JAN_TO_FEB, "text/csv")},
        data={"mapping": json.dumps(wrong_dates)},
    ).json()

    assert preview["transactions"] == []
    assert preview["error_count"] == 4
    assert preview["row_errors"][0]["line"] == 2


TWO_CURRENCY_MAPPING = {
    "has_header": True,
    "date_column": 0,
    "date_format": "%Y-%m-%d",
    "description_columns": [1],
    "amount_mode": "single",
    "amount_column": 2,
    "fallback_amount_column": 3,
}

TWO_CURRENCIES = b"""Date,Description,CAD$,USD$
2026-03-01,COFFEE SHOP,-4.50,
2026-03-02,US STORE ONLINE,,-20.00
"""


def import_two_currencies(client, account):
    client.put(f"/api/accounts/{account.id}/csv-mapping", json=TWO_CURRENCY_MAPPING)
    return upload(client, account, TWO_CURRENCIES).json()


def test_a_usd_only_row_is_imported_as_an_unconverted_amount(client, account):
    summary = import_two_currencies(client, account)

    flagged = client.get("/api/transactions", params={"amount_unconverted": True}).json()

    assert summary["unconverted_count"] == 1
    assert flagged["total"] == 1
    assert flagged["items"][0]["description"] == "US STORE ONLINE"
    assert flagged["items"][0]["amount_cents"] == -2000


def test_setting_the_amount_settles_an_unconverted_amount(client, account):
    import_two_currencies(client, account)
    flagged = client.get("/api/transactions", params={"amount_unconverted": True}).json()

    settled = client.put(
        f"/api/transactions/{flagged['items'][0]['id']}/amount",
        json={"amount_cents": -2740},
    ).json()

    assert settled["amount_cents"] == -2740
    assert settled["imported_amount_cents"] == -2000
    assert settled["amount_unconverted"] is False


def test_a_corrected_amount_is_still_a_duplicate_on_reimport(client, session, account):
    import_two_currencies(client, account)
    flagged = client.get("/api/transactions", params={"amount_unconverted": True}).json()
    client.put(
        f"/api/transactions/{flagged['items'][0]['id']}/amount",
        json={"amount_cents": -2740},
    )

    again = upload(client, account, TWO_CURRENCIES).json()

    assert (again["new_count"], again["skipped_count"]) == (0, 2)
    assert stored_count(session, account) == 2
