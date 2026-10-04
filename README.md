# Budgeting

A personal app for seeing where your money goes each month. You export CSV files from your bank accounts, import them, give each expense a category and an importance, and then look at the month and at the trend over time.

## What it does

- **Import** CSVs from any bank. The first time you import for an account you answer a few questions about how the file is laid out; the answers are saved for next time. Re-importing an overlapping export skips the rows you already have.
- **Review** new expenses: give each a category (Groceries, Housing, ...) and an importance (Essential, Have to Have, Nice to Have, Shouldn't Have). Tick "Always do this when the description contains ..." to save a rule, and matching transactions are classified for you from then on. A rule can also depend on the amount, either exact or within a range, so one gas station can be Transportation for a $60 fill-up and Dining for a $5 snack.
- **Dashboard** for one month: spending against your spending limit, pay and other income, savings rate (the share of pay left after spending), and spending by category (against each category's target) and by importance.
- **Trends** across months: spending, savings rate, importance and a category-by-month table.
- **Rules**: every rule, the transactions it applies to, and a form to change or delete it. Transactions you have not classified by hand follow the rules, so changing or deleting a rule updates them, and a transaction no rule matches any more goes back to Review. When two rules match, one with an amount wins, then the one with the longest text.
- **Transactions**: every transaction, with filters (including money in or money out) and totals. Click a row to change it.
- **Settings**: your monthly spending limit, your pay days, and your categories and their monthly targets.

Money in is counted as other income until you mark it as pay, by hand or with a rule on your employer's description, so an e-transfer from a friend does not pass for earnings.

If you are paid on fixed days, enter them as pay days in Settings (for example 1, 16). Pay that lands a day or two early or late because of a weekend or holiday then counts in the month it was meant for, so a month does not show three paycheques and the next one only one. The transaction keeps its real date.

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

The demo stack is a second copy of the app with its own database, so you can try a feature without touching your real transactions. It runs next to the real one, on port 8089, and shows a "Demo data" badge in the header so you can tell the two browser tabs apart.

```sh
docker compose --env-file .env.demo up -d                             # start it
docker compose --env-file .env.demo exec api python -m app.demo_data  # load the mock data
```

Then open <http://localhost:8089>. The first start takes a minute while Docker builds the images.

Run the second command again whenever you want a clean slate: it deletes everything in the demo database and loads the same mock data again.

```sh
docker compose --env-file .env.demo ps            # is it running?
docker compose --env-file .env.demo logs -f api   # watch the demo API's output
docker compose --env-file .env.demo down          # stop it; the mock data is kept
docker compose --env-file .env.demo down -v       # stop it and delete its database
```

### What the mock data contains

About six months ending today, for a chequing account and a credit card. It is built to exercise the awkward cases:

- a gas station whose fill-ups and snacks share one description, left in Review
- pay on the 1st and 16th, marked as pay by a rule and moved to the Friday before when that is a weekend, so some months receive three pay deposits and some one; pay days of 1 and 16 are set, which puts each back in its own month
- e-transfers coming in that are not pay, and a refund
- a credit card payment that shows up on both accounts
- a monthly US charge that arrives as an amount in another currency
- rules for the regular merchants, a spending limit and three category targets

To add a case, edit `backend/app/demo_data.py` and load the mock data again.

### How it stays separate

`.env.demo` sets three things: a different project name (`budgeting-demo`), port 8089 and `DEMO=true`.

- Docker Compose names containers, networks and volumes after the project, so the demo stack gets its own Postgres volume. The two databases never meet.
- `DEMO=true` turns on the badge and is the only thing that lets `app.demo_data` run. Run against the real stack, it stops with a message and changes nothing.
- Both stacks read the same source folders, so a code change shows up in both at once.

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
| `backend/app/demo_data.py` | Builds the mock data for the demo stack. |
| `.env.demo` | Settings that turn the same Compose file into the demo stack. |
| `nginx/` | nginx configuration for development (`dev.conf`) and production (`prod.conf`). |
| `docs/adr/` | Short records of decisions that would otherwise look odd. |
| `CONTEXT.md` | The glossary: what Transaction, Transfer, Rule, Spending Limit and the rest mean here. |

`docker-compose.yml` is the development setup, with live reload for both the UI and the API. `docker-compose.prod.yml` builds the UI once and has nginx serve it as static files.

## Working on it

Run the backend tests:

```sh
docker compose exec api pytest
```

The tests use the main stack's database, inside a transaction that is rolled back at the end, so they leave your data as it was.

Check the frontend (from `frontend/`, needs Node 20.19 or newer):

```sh
npm run build
npm run lint
```

After changing `backend/app/models.py`, create a migration and apply it:

```sh
docker compose exec api alembic revision --autogenerate -m "what changed"
docker compose exec api alembic upgrade head
docker compose --env-file .env.demo exec api alembic upgrade head   # if the demo stack is running
```

Both stacks run the same code, so each database needs the migration. A stack also applies new migrations by itself whenever its `api` container starts.

After adding a frontend package, rebuild the `web` container so it picks it up:

```sh
docker compose up -d --build -V web
```

## Not built yet

A merchant breakdown, recurring-charge detection, month-versus-average comparison, login and multiple users, and currency conversion.
