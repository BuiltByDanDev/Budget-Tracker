from sqlalchemy import select

from app.models import Category, Kind, Rule, Transaction

MAPPING = {
    "has_header": True,
    "date_column": 0,
    "date_format": "%Y-%m-%d",
    "description_columns": [1],
    "amount_mode": "single",
    "amount_column": 2,
}

MAY = b"""Date,Description,Amount
2026-05-02,PETRO-CANADA 1234,-62.00
2026-05-03,PETRO-CANADA 1234,-4.50
2026-05-10,PETRO-CANADA 1234,-71.25
2026-05-11,LOBLAWS #1021,-88.10
2026-05-12,LOBLAWS #1021,-40.00
"""


def upload(client, account, content=MAY):
    client.put(f"/api/accounts/{account.id}/csv-mapping", json=MAPPING)
    return client.post(
        f"/api/accounts/{account.id}/imports",
        files={"file": ("export.csv", content, "text/csv")},
    )


def category_id(session, user, name):
    return session.scalar(
        select(Category.id).where(Category.user_id == user.id, Category.name == name)
    )


def transactions(session, account):
    session.expire_all()
    return session.scalars(
        select(Transaction)
        .where(Transaction.account_id == account.id)
        .order_by(Transaction.posted_on)
    ).all()


def classify(client, transaction, **body):
    return client.put(f"/api/transactions/{transaction.id}/classification", json=body)


def petro_rule(client, session, user, account, **extra):
    """Classifies the snack purchase by hand and saves a text-only "PETRO" Rule."""
    upload(client, account)
    classify(
        client,
        transactions(session, account)[1],
        kind="expense",
        category_id=category_id(session, user, "Dining"),
        importance="nice_to_have",
        rule_match_text="PETRO",
        **extra,
    )
    return client.get("/api/rules").json()[0]


def test_rules_are_listed_with_how_many_transactions_they_classify(
    client, session, user, account
):
    rule = petro_rule(client, session, user, account)

    assert rule["match_text"] == "PETRO"
    assert rule["category_name"] == "Dining"
    assert rule["amount_min_cents"] is None
    # The two fill-ups. The snack was set by hand, so it belongs to no Rule.
    assert rule["transaction_count"] == 2
    listed = client.get("/api/transactions", params={"rule_id": rule["id"]}).json()
    assert listed["total"] == 2


def test_changing_what_a_rule_sets_changes_its_transactions(
    client, session, user, account
):
    rule = petro_rule(client, session, user, account)
    transportation = category_id(session, user, "Transportation")

    response = client.put(
        f"/api/rules/{rule['id']}",
        json={
            "match_text": "PETRO",
            "kind": "expense",
            "category_id": transportation,
            "importance": "essential",
            "merchant_name": "Petro-Canada",
        },
    )

    assert response.status_code == 200
    assert response.json()["changed"] == 2
    fill_up, snack, second_fill_up, *_ = transactions(session, account)
    assert fill_up.category_id == transportation
    assert second_fill_up.merchant.name == "Petro-Canada"
    # Set by hand, so the Rule leaves it alone.
    assert snack.category_id == category_id(session, user, "Dining")


def test_narrowing_a_rule_sends_transactions_back_to_the_review_inbox(
    client, session, user, account
):
    rule = petro_rule(client, session, user, account)

    response = client.put(
        f"/api/rules/{rule['id']}",
        json={
            "match_text": "PETRO",
            # Money out of up to $10: neither fill-up.
            "amount_min_cents": -1000,
            "amount_max_cents": 0,
            "kind": "expense",
            "category_id": rule["category_id"],
            "importance": "nice_to_have",
        },
    )

    assert response.json()["changed"] == 2
    assert response.json()["rule"]["transaction_count"] == 0
    fill_up = transactions(session, account)[0]
    assert fill_up.category_id is None
    assert fill_up.rule_id is None
    assert fill_up.kind == Kind.EXPENSE


def test_a_stronger_rule_takes_over_transactions_from_a_weaker_one(
    client, session, user, account
):
    rule = petro_rule(client, session, user, account)
    transportation = category_id(session, user, "Transportation")
    fill_up = transactions(session, account)[0]
    assert fill_up.rule_id == rule["id"]

    # Classifying a Transaction that already has a Category, with an amount Rule.
    response = classify(
        client,
        fill_up,
        kind="expense",
        category_id=transportation,
        importance="essential",
        rule_match_text="PETRO",
        rule_amount_min_cents=-15000,
        rule_amount_max_cents=-4000,
    )

    assert response.json()["also_classified"] == 1
    second_fill_up = transactions(session, account)[2]
    assert second_fill_up.category_id == transportation
    assert second_fill_up.rule_id != rule["id"]


def test_deleting_a_rule_unclassifies_its_transactions(client, session, user, account):
    rule = petro_rule(client, session, user, account)

    response = client.delete(f"/api/rules/{rule['id']}")

    assert response.status_code == 200
    assert response.json()["changed"] == 2
    assert client.get("/api/rules").json() == []
    fill_up, snack, *_ = transactions(session, account)
    assert fill_up.category_id is None
    assert snack.category_id == category_id(session, user, "Dining")
    assert session.scalars(select(Rule).where(Rule.user_id == user.id)).all() == []


def test_a_rule_change_is_checked(client, session, user, account):
    rule = petro_rule(client, session, user, account)
    classify(
        client,
        transactions(session, account)[3],
        kind="expense",
        category_id=category_id(session, user, "Groceries"),
        importance="essential",
        rule_match_text="LOBLAWS",
    )
    body = {
        "kind": "expense",
        "category_id": rule["category_id"],
        "importance": "nice_to_have",
    }
    change = lambda **fields: client.put(
        f"/api/rules/{rule['id']}", json={**body, **fields}
    ).status_code

    assert change(match_text="PE") == 422
    assert change(match_text="PETRO", amount_min_cents=-500) == 422
    assert change(match_text="PETRO", amount_min_cents=-100, amount_max_cents=-900) == 422
    assert change(match_text="PETRO", category_id=None) == 422
    # The same text and amount as the other Rule.
    assert change(match_text="loblaws") == 422
    assert client.put("/api/rules/999999", json={**body, "match_text": "PETRO"}).status_code == 404
