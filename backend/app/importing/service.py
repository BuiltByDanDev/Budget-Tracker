"""Stores the rows of a CSV as Transactions, skipping ones already imported."""

from collections import Counter
from datetime import date

from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.classifying.rules import apply_rules
from app.importing.csv_parser import CsvMapping, ParsedRow, parse_csv
from app.models import Account, Import, Kind, Transaction


# What makes two rows "the same transaction": date, amount as imported, Description.
RowKey = tuple[date, int, str]


def _key(row: ParsedRow) -> RowKey:
    return (row.posted_on, row.amount_cents, row.description)


def _rows_already_stored(
    session: Session, account: Account, rows: list[ParsedRow]
) -> Counter[RowKey]:
    """How many Transactions matching each row the Account already has."""
    if not rows:
        return Counter()
    earliest = min(row.posted_on for row in rows)
    latest = max(row.posted_on for row in rows)
    stored = session.execute(
        select(
            Transaction.posted_on,
            Transaction.imported_amount_cents,
            Transaction.description,
            func.count(),
        )
        .where(
            Transaction.account_id == account.id,
            Transaction.posted_on.between(earliest, latest),
        )
        .group_by(
            Transaction.posted_on,
            Transaction.imported_amount_cents,
            Transaction.description,
        )
    )
    return Counter(
        {
            (posted_on, amount_cents, description): count
            for posted_on, amount_cents, description, count in stored
        }
    )


def import_csv(
    session: Session, account: Account, filename: str, content: bytes
) -> Import:
    """Runs one Import. Raises CsvParseError, storing nothing, if any row is unreadable.

    A row is a duplicate when the Account already has a Transaction with the
    same date, amount (as it was imported) and Description. Two identical rows in one file are both
    kept: if the file has three of a row and the Account has one, two are added.

    Every row starts as an Expense with no Category, money in included, so it
    sits in the Review Inbox and counts in Spending; Rules then classify
    whatever they match.
    """
    mapping = CsvMapping.model_validate(account.csv_mapping)
    rows = parse_csv(content, mapping)

    remaining_duplicates = _rows_already_stored(session, account, rows)
    new_rows: list[ParsedRow] = []
    for row in rows:
        if remaining_duplicates[_key(row)] > 0:
            remaining_duplicates[_key(row)] -= 1
        else:
            new_rows.append(row)

    record = Import(
        user_id=account.user_id,
        account_id=account.id,
        filename=filename,
        new_count=len(new_rows),
        skipped_count=len(rows) - len(new_rows),
    )
    session.add(record)
    session.flush()

    transactions = [
        Transaction(
            user_id=account.user_id,
            account_id=account.id,
            import_id=record.id,
            posted_on=row.posted_on,
            amount_cents=row.amount_cents,
            imported_amount_cents=row.amount_cents,
            amount_unconverted=row.unconverted,
            description=row.description,
            kind=Kind.EXPENSE,
        )
        for row in new_rows
    ]
    apply_rules(session, account.user_id, transactions)
    session.add_all(transactions)
    session.flush()
    return record
