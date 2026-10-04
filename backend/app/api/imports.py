from fastapi import APIRouter, Depends, HTTPException, UploadFile
from fastapi.responses import JSONResponse
from pydantic import BaseModel, ConfigDict
from sqlalchemy.orm import Session

from app.api.accounts import get_account
from app.db import get_session
from app.importing.csv_parser import CsvParseError, read_cells
from app.importing.service import import_csv
from app.models import Account

router = APIRouter(prefix="/api", tags=["imports"])

PREVIEW_ROWS = 8
MAX_ERRORS_SHOWN = 10


class CsvPreview(BaseModel):
    rows: list[list[str]]
    total_rows: int


class ImportSummary(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    filename: str
    new_count: int
    skipped_count: int


@router.post("/csv-preview", response_model=CsvPreview)
async def preview_csv(file: UploadFile):
    """The first rows of a CSV as raw cells, for setting up a CSV Mapping."""
    rows = read_cells(await file.read())
    if not rows:
        raise HTTPException(422, "The file is empty")
    return CsvPreview(rows=rows[:PREVIEW_ROWS], total_rows=len(rows))


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
    return record
