# Budgeting

A personal app for seeing where your money goes each month. You export CSV files from your bank accounts, import them, give each expense a category and an importance, and then look at the month and at the trend over time.

## What it does

- **Import** CSVs from any bank. The first time you import for an account you answer a few questions about how the file is laid out; the answers are saved for next time. Re-importing an overlapping export skips the rows you already have.
- **Review** new expenses: give each a category (Groceries, Housing, ...) and an importance (Essential, Have to Have, Nice to Have, Shouldn't Have). Tick "Always do this when the description contains ..." to save a rule, and matching transactions are classified for you from then on.
- **Dashboard** for one month: spending against your spending limit, income, savings rate, and spending by category (against each category's target) and by importance.
- **Trends** across months: spending, savings rate, importance and a category-by-month table.
- **Transactions**: every transaction, with filters and totals. Click a row to change it.
- **Settings**: your monthly spending limit, and your categories and their monthly targets.

Money moved between your own accounts (a credit card payment, a transfer to savings) is marked as a transfer and left out of spending and income.

## Running it

You need [Docker Desktop](https://www.docker.com/products/docker-desktop/). Nothing else has to be installed.

```sh
docker compose up -d
```

Then open <http://localhost:8088>.

```sh
docker compose down          # stop; your data is kept
docker compose logs -f api   # watch the API's output
```

To use a different port or database password, copy `.env.example` to `.env` and edit it.

## Trying things on mock data

The demo stack is a second copy of the app with its own database, so you can try a feature without touching your real transactions. It runs next to the real one, on port 8089.

```sh
docker compose --env-file .env.demo up -d                             # start it
docker compose --env-file .env.demo exec api python -m app.demo_data  # load mock data, or reset it
docker compose --env-file .env.demo down                              # stop it; add -v to delete its database
```

Then open <http://localhost:8089>. The header shows a "Demo data" badge so you can tell the two apart.

`.env.demo` gives the stack a different project name (`budgeting-demo`). Docker Compose names containers and volumes after the project, which is what keeps the two databases separate. Both stacks read the same source folders, so a code change shows up in both.

The mock data covers the last six months for a chequing account and a credit card. `app/demo_data.py` wipes the database before loading, and refuses to run anywhere except the demo stack.

## How it is put together

```
browser -> nginx -> web  (React + TypeScript, Vite dev server)
                 -> api  (Python, FastAPI) -> db (Postgres)
```

| Folder | What is in it |
|---|---|
| `frontend/` | The React app. Pages are in `src/pages/`, the typed API client in `src/api/client.ts`. |
| `backend/` | The Python API. Tables in `app/models.py`, CSV reading in `app/importing/`, rules in `app/classifying/`, monthly figures in `app/reporting/`, routes in `app/api/`. |
| `backend/alembic/` | Database migrations. |
| `nginx/` | nginx configuration for development (`dev.conf`) and production (`prod.conf`). |
| `docs/adr/` | Short records of decisions that would otherwise look odd. |
| `CONTEXT.md` | The glossary: what Transaction, Transfer, Rule, Spending Limit and the rest mean here. |

`docker-compose.yml` is the development setup, with live reload for both the UI and the API. `docker-compose.prod.yml` builds the UI once and has nginx serve it as static files.

## Working on it

Run the backend tests:

```sh
docker compose exec api pytest
```

Check the frontend (from `frontend/`, needs Node 20.19 or newer):

```sh
npm run build
npm run lint
```

After changing `backend/app/models.py`, create a migration and apply it:

```sh
docker compose exec api alembic revision --autogenerate -m "what changed"
docker compose exec api alembic upgrade head
```

After adding a frontend package, rebuild the `web` container so it picks it up:

```sh
docker compose up -d --build -V web
```

## Not built yet

A page for managing rules, a merchant breakdown, recurring-charge detection, month-versus-average comparison, login and multiple users, and currency conversion.
