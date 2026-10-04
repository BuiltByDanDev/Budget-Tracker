from datetime import date

from sqlalchemy import select

from app.models import Category, Importance, Kind, Transaction

MAPPING = {
    "has_header": True,
    "date_column": 0,
    "date_format": "%Y-%m-%d",
    "description_columns": [1],
    "amount_mode": "single",
    "amount_column": 2,
}

MARCH = b"""Date,Description,Amount
2026-03-01,NETFLIX.COM 4471,-16.99
2026-03-04,AMZN Mktp CA*2K4L81,-42.10
2026-03-09,AMZN PRIME VIDEO*RT5,-9.99
2026-03-15,PAYMENT - THANK YOU,-300.00
2026-03-20,AMZN Mktp CA*88ZZ01,25.00
"""

APRIL = b"""Date,Description,Amount
2026-04-01,NETFLIX.COM 4471,-16.99
2026-04-06,AMZN Mktp CA*7HH219,-13.37
"""


def upload(client, account, content):
    client.put(f"/api/accounts/{account.id}/csv-mapping", json=MAPPING)
    return client.post(
        f"/api/accounts/{account.id}/imports",
        files={"file": ("export.csv", content, "text/csv")},
    )


def category_id(session, user, name):
    return session.scalar(
        select(Category.id).where(Category.user_id == user.id, Category.name == name)
    )


def by_description(session, account):
    session.expire_all()
    transactions = session.scalars(
        select(Transaction).where(Transaction.account_id == account.id)
    )
    return {t.description: t for t in transactions}


def classify(client, transaction, **body):
    return client.put(f"/api/transactions/{transaction.id}/classification", json=body)


def review_inbox(client):
    return client.get("/api/transactions", params={"needs_review": True}).json()


def test_review_inbox_holds_expenses_without_a_category(client, account):
    upload(client, account, MARCH)

    inbox = review_inbox(client)

    # Four money-out rows; the refund arrives as Income until it is classified.
    assert inbox["total"] == 4


def test_classifying_by_hand_takes_a_transaction_out_of_the_inbox(
    client, session, user, account
):
    upload(client, account, MARCH)
    netflix = by_description(session, account)["NETFLIX.COM 4471"]

    response = classify(
        client,
        netflix,
        kind="expense",
        category_id=category_id(session, user, "Subscriptions"),
        importance="nice_to_have",
        merchant_name="Netflix",
    )

    assert response.status_code == 200
    assert response.json()["transaction"]["merchant_name"] == "Netflix"
    assert response.json()["also_classified"] == 0
    assert review_inbox(client)["total"] == 3


def test_an_expense_needs_a_category_and_an_importance(client, session, account):
    upload(client, account, MARCH)
    netflix = by_description(session, account)["NETFLIX.COM 4471"]

    assert classify(client, netflix, kind="expense").status_code == 422


def test_a_new_rule_classifies_other_uncategorised_matches(
    client, session, user, account
):
    upload(client, account, MARCH)
    shopping = category_id(session, user, "Shopping")
    purchase = by_description(session, account)["AMZN Mktp CA*2K4L81"]

    response = classify(
        client,
        purchase,
        kind="expense",
        category_id=shopping,
        importance="nice_to_have",
        merchant_name="Amazon",
        rule_match_text="amzn",
    )

    transactions = by_description(session, account)
    # The Prime Video charge and the refund both contain "AMZN".
    assert response.json()["also_classified"] == 2
    assert transactions["AMZN PRIME VIDEO*RT5"].category_id == shopping
    assert transactions["AMZN PRIME VIDEO*RT5"].importance == Importance.NICE_TO_HAVE
    assert transactions["AMZN PRIME VIDEO*RT5"].set_by_hand is False
    assert transactions["NETFLIX.COM 4471"].category_id is None


def test_a_refund_matched_by_an_expense_rule_becomes_a_negative_expense(
    client, session, user, account
):
    upload(client, account, MARCH)
    purchase = by_description(session, account)["AMZN Mktp CA*2K4L81"]
    classify(
        client,
        purchase,
        kind="expense",
        category_id=category_id(session, user, "Shopping"),
        importance="nice_to_have",
        rule_match_text="AMZN Mktp",
    )

    refund = by_description(session, account)["AMZN Mktp CA*88ZZ01"]
    totals = client.get("/api/transactions", params={"search": "amzn mktp"}).json()

    assert refund.kind == Kind.EXPENSE
    assert refund.amount_cents == 2500
    # 42.10 spent, 25.00 refunded.
    assert totals["spending_cents"] == 1710


def test_the_longest_matching_rule_wins(client, session, user, account):
    upload(client, account, MARCH)
    shopping = category_id(session, user, "Shopping")
    entertainment = category_id(session, user, "Entertainment")
    transactions = by_description(session, account)
    classify(
        client,
        transactions["AMZN Mktp CA*2K4L81"],
        kind="expense",
        category_id=shopping,
        importance="nice_to_have",
        rule_match_text="AMZN",
    )
    # Set by hand, with a longer, more specific rule than "AMZN".
    classify(
        client,
        transactions["AMZN PRIME VIDEO*RT5"],
        kind="expense",
        category_id=entertainment,
        importance="nice_to_have",
        rule_match_text="AMZN PRIME VIDEO",
    )

    april = b"Date,Description,Amount\n2026-04-09,AMZN PRIME VIDEO*QQ1,-9.99\n2026-04-10,AMZN Mktp CA*1,-5.00\n"
    upload(client, account, april)

    transactions = by_description(session, account)
    assert transactions["AMZN PRIME VIDEO*QQ1"].category_id == entertainment
    assert transactions["AMZN Mktp CA*1"].category_id == shopping


def test_rules_are_applied_on_import(client, session, user, account):
    upload(client, account, MARCH)
    subscriptions = category_id(session, user, "Subscriptions")
    classify(
        client,
        by_description(session, account)["NETFLIX.COM 4471"],
        kind="expense",
        category_id=subscriptions,
        importance="nice_to_have",
        merchant_name="Netflix",
        rule_match_text="NETFLIX",
    )

    upload(client, account, APRIL)

    april_netflix = session.scalar(
        select(Transaction).where(
            Transaction.account_id == account.id,
            Transaction.posted_on == date(2026, 4, 1),
        )
    )
    assert april_netflix.category_id == subscriptions
    assert april_netflix.merchant.name == "Netflix"
    assert april_netflix.set_by_hand is False


def test_a_rule_never_changes_a_transaction_set_by_hand(client, session, user, account):
    upload(client, account, MARCH)
    shopping = category_id(session, user, "Shopping")
    entertainment = category_id(session, user, "Entertainment")
    transactions = by_description(session, account)
    classify(
        client,
        transactions["AMZN PRIME VIDEO*RT5"],
        kind="expense",
        category_id=entertainment,
        importance="shouldnt_have",
    )

    classify(
        client,
        transactions["AMZN Mktp CA*2K4L81"],
        kind="expense",
        category_id=shopping,
        importance="nice_to_have",
        rule_match_text="AMZN",
    )

    prime = by_description(session, account)["AMZN PRIME VIDEO*RT5"]
    assert prime.category_id == entertainment
    assert prime.importance == Importance.SHOULDNT_HAVE


def test_a_transfer_rule_keeps_card_payments_out_of_spending(
    client, session, account
):
    upload(client, account, MARCH)
    payment = by_description(session, account)["PAYMENT - THANK YOU"]

    classify(client, payment, kind="transfer", rule_match_text="PAYMENT - THANK YOU")

    payment = by_description(session, account)["PAYMENT - THANK YOU"]
    totals = client.get("/api/transactions").json()
    assert payment.kind == Kind.TRANSFER
    assert payment.category_id is None
    # 16.99 + 42.10 + 9.99, without the 300.00 payment.
    assert totals["spending_cents"] == 6908
    assert review_inbox(client)["total"] == 3


def test_rule_text_must_appear_in_the_description(client, session, user, account):
    upload(client, account, MARCH)
    netflix = by_description(session, account)["NETFLIX.COM 4471"]

    response = classify(
        client,
        netflix,
        kind="expense",
        category_id=category_id(session, user, "Subscriptions"),
        importance="nice_to_have",
        rule_match_text="SPOTIFY",
    )

    assert response.status_code == 422


def test_filters_narrow_the_list(client, session, user, account):
    upload(client, account, MARCH)
    upload(client, account, APRIL)

    april = client.get(
        "/api/transactions", params={"date_from": "2026-04-01", "date_to": "2026-04-30"}
    ).json()
    income = client.get("/api/transactions", params={"kind": "income"}).json()

    assert april["total"] == 2
    assert april["spending_cents"] == 3036
    assert income["total"] == 1
    assert income["income_cents"] == 2500
