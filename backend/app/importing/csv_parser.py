"""Turns the bytes of a bank's CSV into rows, using an Account's CSV Mapping.

Nothing here touches the database.
"""

import csv
import io
from dataclasses import dataclass
from datetime import date, datetime
from decimal import Decimal, InvalidOperation
from typing import Literal

from pydantic import BaseModel, model_validator


class CsvMapping(BaseModel):
    """Describes one bank's CSV layout. Columns are numbered from 0."""

    has_header: bool
    date_column: int
    # A strptime format, for example "%Y-%m-%d" or "%m/%d/%Y".
    date_format: str
    # Some banks split the description over two columns; they are joined with a space.
    description_columns: list[int]

    # "single": one amount column holding both money in and money out.
    # "split": one column for money out and another for money in.
    amount_mode: Literal["single", "split"]
    amount_column: int | None = None
    # Only for "single". Used for a row whose amount column is empty, for banks
    # that put each currency in its own column (CAD$, USD$). The amount is taken
    # as written, and the row is marked as an Unconverted Amount.
    fallback_amount_column: int | None = None
    # Only for "single". Chequing exports usually show money out as negative;
    # credit card exports often show purchases as positive.
    money_out_is_negative: bool = True
    money_out_column: int | None = None
    money_in_column: int | None = None

    @model_validator(mode="after")
    def _has_the_columns_its_mode_needs(self) -> "CsvMapping":
        if not self.description_columns:
            raise ValueError("choose at least one description column")
        if self.amount_mode == "single" and self.amount_column is None:
            raise ValueError("choose the amount column")
        if self.amount_mode == "split" and (
            self.money_out_column is None or self.money_in_column is None
        ):
            raise ValueError("choose both the money out and the money in column")
        return self


@dataclass(frozen=True)
class ParsedRow:
    posted_on: date
    # Negative for money out, positive for money in.
    amount_cents: int
    description: str
    # The amount came from the second amount column, so it is in another currency.
    unconverted: bool = False


@dataclass(frozen=True)
class RowError:
    # 1-based line of the file, as a spreadsheet would show it.
    line: int
    message: str


class CsvParseError(Exception):
    def __init__(self, errors: list[RowError]):
        super().__init__(f"{len(errors)} rows could not be read")
        self.errors = errors


def read_cells(content: bytes) -> list[list[str]]:
    """Decodes the file and splits it into rows of cells, dropping blank rows."""
    try:
        text = content.decode("utf-8-sig")
    except UnicodeDecodeError:
        text = content.decode("latin-1")
    rows = csv.reader(io.StringIO(text))
    return [row for row in rows if any(cell.strip() for cell in row)]


def parse_amount(raw: str) -> int:
    """'$1,234.50' -> 123450, '(12.00)' -> -1200, '-3.5' -> -350."""
    cleaned = raw.strip().replace("$", "").replace(",", "").replace(" ", "")
    negative = cleaned.startswith("(") and cleaned.endswith(")")
    if negative:
        cleaned = cleaned[1:-1]
    try:
        amount = Decimal(cleaned)
    except InvalidOperation:
        raise ValueError(f"'{raw}' is not an amount") from None
    cents = int((amount * 100).to_integral_value())
    return -cents if negative else cents


def _amount_cents(row: list[str], mapping: CsvMapping) -> tuple[int, bool]:
    """The signed amount, and whether it came from the second amount column."""
    if mapping.amount_mode == "single":
        raw = row[mapping.amount_column]
        unconverted = False
        if not raw.strip() and mapping.fallback_amount_column is not None:
            raw = row[mapping.fallback_amount_column]
            unconverted = True
        if not raw.strip():
            raise ValueError("no amount in this row")
        cents = parse_amount(raw)
        return (cents if mapping.money_out_is_negative else -cents), unconverted

    money_out = row[mapping.money_out_column].strip()
    money_in = row[mapping.money_in_column].strip()
    if money_out and money_in:
        return abs(parse_amount(money_in)) - abs(parse_amount(money_out)), False
    if money_out:
        return -abs(parse_amount(money_out)), False
    if money_in:
        return abs(parse_amount(money_in)), False
    raise ValueError("no amount in either the money out or money in column")


def parse_csv(content: bytes, mapping: CsvMapping) -> list[ParsedRow]:
    """Reads every row, or raises CsvParseError listing each row that failed."""
    rows = read_cells(content)
    first_line = 1
    if mapping.has_header:
        rows = rows[1:]
        first_line = 2

    parsed: list[ParsedRow] = []
    errors: list[RowError] = []
    for line, row in enumerate(rows, start=first_line):
        try:
            raw_date = row[mapping.date_column].strip()
            try:
                posted_on = datetime.strptime(raw_date, mapping.date_format).date()
            except ValueError:
                raise ValueError(
                    f"'{raw_date}' is not a date in the chosen format"
                ) from None
            description = " ".join(
                row[column].strip()
                for column in mapping.description_columns
                if row[column].strip()
            )
            amount_cents, unconverted = _amount_cents(row, mapping)
            parsed.append(ParsedRow(posted_on, amount_cents, description, unconverted))
        except IndexError:
            errors.append(RowError(line, "row has fewer columns than the mapping expects"))
        except ValueError as error:
            errors.append(RowError(line, str(error)))

    if errors:
        raise CsvParseError(errors)
    return parsed
