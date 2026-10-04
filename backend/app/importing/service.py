"""Stores the rows of a CSV as Transactions, skipping ones already imported."""

from collections import Counter

from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.classifying.rules import apply_rules
from app.importing.csv_parser import CsvMapping, ParsedRow, parse_csv
from app.models import Account, Import, Kind, Transaction


def _rows_already_stored(
    session: Session, account: Account, rows: list[ParsedRow]
) -> Counter[ParsedRow]:
    """How many Transactions matching each row the Account already has."""
    if not rows:
        return Counter()
    earliest = min(row.posted_on for row in rows)
    latest = max(row.posted_on for row in rows)
    stored = session.execute(
        select(
            Transaction.posted_on,
            Transaction.amount_cents,
            Transaction.description,
            func.count(),
        )
        .where(
            Transaction.account_id == account.id,
            Transaction.posted_on.between(earliest, latest),
        )
        .group_by(
            Transaction.posted_on, Transaction.amount_cents, Transaction.description
        )
    )
    return Counter(
        {
            ParsedRow(posted_on, amount_cents, description): count
            for posted_on, amount_cents, description, count in stored
        }
    )


def import_csv(
    session: Session, account: Account, filename: str, content: bytes
) -> Import:
    """Runs one Import. Raises CsvParseError, storing nothing, if any row is unreadable.

    A row is a duplicate when the Account already has a Transaction with the
    same date, amount and Description. Two identical rows in one file are both
    kept: if the file has three of a row and the Account has one, two are added.

    Money out starts as an Expense and money in as Income; Rules then classify
    whatever they match.
    """
    mapping = CsvMapping.model_validate(account.csv_mapping)
    rows = parse_csv(content, mapping)

    remaining_duplicates = _rows_already_stored(session, account, rows)
    new_rows: list[ParsedRow] = []
    for row in rows:
        if remaining_duplicates[row] > 0:
            remaining_duplicates[row] -= 1
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
            description=row.description,
            kind=Kind.EXPENSE if row.amount_cents < 0 else Kind.INCOME,
        )
        for row in new_rows
    ]
    apply_rules(session, account.user_id, transactions)
    session.add_all(transactions)
    session.flush()
    return record
