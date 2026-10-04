from fastapi import Depends, FastAPI
from sqlalchemy import text
from sqlalchemy.orm import Session

from app.api import accounts, categories, imports, reports, transactions
from app.db import get_session

app = FastAPI(title="Budgeting API")
app.include_router(accounts.router)
app.include_router(categories.router)
app.include_router(imports.router)
app.include_router(reports.router)
app.include_router(transactions.router)


@app.get("/api/health")
def health(session: Session = Depends(get_session)) -> dict[str, str]:
    session.execute(text("SELECT 1"))
    return {"status": "ok", "database": "ok"}
