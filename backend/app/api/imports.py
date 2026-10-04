from datetime import date

from fastapi import APIRouter, Depends, Form, HTTPException, UploadFile
from fastapi.responses import JSONResponse
from pydantic import BaseModel, ConfigDict, ValidationError
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.api.accounts import get_account
from app.db import get_session
from app.importing.csv_parser import (
    CsvMapping,
    CsvParseError,
    parse_csv,
    read_cells,
)
from app.importing.service import import_csv
from app.models import Account, Transaction

router = APIRouter(prefix="/api", tags=["imports"])

PREVIEW_ROWS = 8
MAX_ERRORS_SHOWN = 5


class PreviewTransaction(BaseModel):
    posted_on: date
    description: str
    amount_cents: int
    unconverted: bool


class PreviewRowError(BaseModel):
    line: int
    message: str


class CsvPreview(BaseModel):
    rows: list[list[str]]
    total_rows: int
    # With a mapping: how the first rows would be read, or which rows cannot be.
    transactions: list[PreviewTransaction] = []
    row_errors: list[PreviewRowError] = []
    error_count: int = 0


class ImportSummary(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    filename: str
    new_count: int
    skipped_count: int
    # How many of the new Transactions are Unconverted Amounts.
    unconverted_count: int = 0


@router.post("/csv-preview", response_model=CsvPreview)
async def preview_csv(file: UploadFile, mapping: str | None = Form(None)):
    """The first rows of a CSV, for setting up a CSV Mapping. Stores nothing.

    Always returns the raw cells. Given a mapping (as JSON), also returns how
    the file would be read with it.
    """
    content = await file.read()
    rows = read_cells(content)
    if not rows:
        raise HTTPException(422, "The file is empty")
    preview = CsvPreview(rows=rows[:PREVIEW_ROWS], total_rows=len(rows))
    if mapping is None:
        return preview

    try:
        csv_mapping = CsvMapping.model_validate_json(mapping)
    except ValidationError as error:
        raise HTTPException(422, error.errors()[0]["msg"]) from None
    try:
        parsed = parse_csv(content, csv_mapping)
    except CsvParseError as error:
        preview.error_count = len(error.errors)
        preview.row_errors = [
            PreviewRowError(line=row.line, message=row.message)
            for row in error.errors[:MAX_ERRORS_SHOWN]
        ]
        return preview
    preview.transactions = [
        PreviewTransaction(
            posted_on=row.posted_on,
            description=row.description,
            amount_cents=row.amount_cents,
            unconverted=row.unconverted,
        )
        for row in parsed[:PREVIEW_ROWS]
    ]
    return preview


@router.post("/accounts/{account_id}/imports", response_model=ImportSummary)
async def create_import(
    file: UploadFile,
    account: Account = Depends(get_account),
    session: Session = Depends(get_session),
):
    if account.csv_mapping is None:
        raise HTTPException(409, "This account has no CSV mapping yet")
    try:
        record = import_csv(
            session, account, file.filename or "upload.csv", await file.read()
        )
    except CsvParseError as error:
        session.rollback()
        return JSONResponse(
            status_code=422,
            content={
                "detail": str(error),
                "row_errors": [
                    {"line": row.line, "message": row.message}
                    for row in error.errors[:MAX_ERRORS_SHOWN]
                ],
            },
        )
    session.commit()
    summary = ImportSummary.model_validate(record)
    summary.unconverted_count = session.scalar(
        select(func.count()).where(
            Transaction.import_id == record.id, Transaction.amount_unconverted
        )
    )
    return summary
