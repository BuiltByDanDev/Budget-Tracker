from datetime import date

import pytest

from app.importing.csv_parser import (
    CsvMapping,
    CsvParseError,
    ParsedRow,
    parse_amount,
    parse_csv,
)

SIGNED = CsvMapping(
    has_header=True,
    date_column=0,
    date_format="%Y-%m-%d",
    description_columns=[1],
    amount_mode="single",
    amount_column=2,
)


@pytest.mark.parametrize(
    ("raw", "cents"),
    [
        ("12.34", 1234),
        ("-12.34", -1234),
        ("$1,234.50", 123450),
        ("(45.00)", -4500),
        (" 7 ", 700),
        ("0.1", 10),
    ],
)
def test_parse_amount(raw, cents):
    assert parse_amount(raw) == cents


def test_signed_amount_column():
    content = b"Date,Description,Amount\n2026-03-01,COFFEE SHOP,-4.50\n2026-03-02,PAYROLL,2000.00\n"

    assert parse_csv(content, SIGNED) == [
        ParsedRow(date(2026, 3, 1), -450, "COFFEE SHOP"),
        ParsedRow(date(2026, 3, 2), 200000, "PAYROLL"),
    ]


def test_credit_card_where_purchases_are_positive():
    mapping = SIGNED.model_copy(update={"money_out_is_negative": False})
    content = b"Date,Description,Amount\n2026-03-01,COFFEE SHOP,4.50\n2026-03-05,PAYMENT - THANK YOU,-300.00\n"

    rows = parse_csv(content, mapping)

    assert [row.amount_cents for row in rows] == [-450, 30000]


def test_separate_money_out_and_money_in_columns_without_header():
    mapping = CsvMapping(
        has_header=False,
        date_column=0,
        date_format="%m/%d/%Y",
        description_columns=[1, 2],
        amount_mode="split",
        money_out_column=3,
        money_in_column=4,
    )
    content = b"03/01/2026,COFFEE SHOP,TORONTO ON,4.50,\n03/02/2026,PAYROLL,,,2000.00\n"

    assert parse_csv(content, mapping) == [
        ParsedRow(date(2026, 3, 1), -450, "COFFEE SHOP TORONTO ON"),
        ParsedRow(date(2026, 3, 2), 200000, "PAYROLL"),
    ]


def test_blank_lines_and_byte_order_mark_are_ignored():
    content = "﻿Date,Description,Amount\n\n2026-03-01,COFFEE,-4.50\n\n".encode()

    assert len(parse_csv(content, SIGNED)) == 1


def test_unreadable_rows_are_all_reported_with_their_line():
    content = b"Date,Description,Amount\n2026-03-01,COFFEE,-4.50\n01/03/2026,LUNCH,-12.00\n2026-03-03,DINNER,abc\n2026-03-04\n"

    with pytest.raises(CsvParseError) as raised:
        parse_csv(content, SIGNED)

    assert [error.line for error in raised.value.errors] == [3, 4, 5]


TWO_CURRENCIES = SIGNED.model_copy(update={"amount_column": 2, "fallback_amount_column": 3})


def test_empty_amount_falls_back_to_the_second_column():
    content = b"Date,Description,CAD$,USD$\n2026-03-01,COFFEE,-4.50,\n2026-03-02,US STORE,,-20.00\n"

    rows = parse_csv(content, TWO_CURRENCIES)

    # The USD amount is taken as written and marked as unconverted.
    assert [row.amount_cents for row in rows] == [-450, -2000]
    assert [row.unconverted for row in rows] == [False, True]


def test_a_row_with_no_amount_in_either_column_is_reported():
    content = b"Date,Description,CAD$,USD$\n2026-03-01,COFFEE,,\n"

    with pytest.raises(CsvParseError) as raised:
        parse_csv(content, TWO_CURRENCIES)

    assert raised.value.errors[0].message == "no amount in this row"


def test_a_mapping_must_name_the_columns_its_mode_needs():
    with pytest.raises(ValueError):
        CsvMapping(
            has_header=True,
            date_column=0,
            date_format="%Y-%m-%d",
            description_columns=[1],
            amount_mode="split",
            money_out_column=2,
        )
