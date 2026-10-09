# Budgeting app

Personal spending tracker: CSV import, rule-based categorising, monthly dashboard and trends. Single user today; built to take more later. It is also Daniel's project for learning Python, Docker and nginx, so keep those parts readable and explain what they do.

Read `CONTEXT.md` before naming anything: it is the glossary, and code, UI text and tests use its terms. `docs/adr/` holds the decisions that look odd without context. `README.md` has the layout and commands. Daniel keeps his running feedback and feature wishes in `docs/notes/feedback.txt`; read it before proposing what to build next.

## Fixed constraints

- React + TypeScript on Vite. No Next.js.
- Python (FastAPI, SQLAlchemy 2, Alembic) for the API.
- Docker Compose runs everything; nginx is the only entry point. Postgres.

## Commands

- Start: `docker compose up -d`, then http://localhost:8088 (8080 is taken by another container on Daniel's machine).
- Demo stack (mock data, own database, http://localhost:8089): `docker compose --env-file .env.demo up -d`, then `docker compose --env-file .env.demo exec api python -m app.demo_data` to load or reset the mock data. Both stacks mount the same source.
- Backend tests: `docker compose exec api pytest`. They run against the dev Postgres inside a transaction that is rolled back, so they need the stack up and leave nothing behind.
- Frontend: `npm run build` and `npm run lint` in `frontend/`.
- Model change: `docker compose exec api alembic revision --autogenerate -m "..."`, then edit the generated file if existing rows need backfilling, then `alembic upgrade head`. Run the upgrade in the demo stack too if it is up (`docker compose --env-file .env.demo exec api alembic upgrade head`); both stacks run the same code, so an unmigrated one breaks.
- New npm package: `docker compose up -d --build -V web`, or the container keeps its old `node_modules`.

## Rules the code depends on

- Amounts are integer cents, negative for money out. `imported_amount_cents` is never edited; duplicate detection uses it.
- Every table has `user_id`. `app/users.py::get_current_user` returns the one default User and is the only place login needs to plug in.
- A Rule never changes a Transaction with `set_by_hand`. Every other Transaction is kept in step with the Rules: after a Rule is added, changed or deleted, `reapply_rules` gives each one its best match (recorded in `rule_id`), or resets it to Expense with no Category when nothing matches, money in as well as money out. A Rule with an amount beats a text-only one; then the longest matching rule text wins. A Transaction classified by hand while saving a Rule stays `set_by_hand`, so it is not counted under that Rule.
- Transfers are excluded from Spending and Income everywhere. A Refund is an Expense with a positive amount.
- Money in starts as an Expense with no Category, so it sits in the Review Inbox and lowers Spending until a Rule or the User makes it a Refund (Expense with a Category), Money Back, Pay, Other Income or a Transfer (`docs/adr/0006`). Money Back lowers Spending in no Category, so the Categories add up to Spending before Money Back.
- Income is two Kinds, Pay and Other Income. The Savings Rate uses Pay alone; Other Income lowers nothing.
- A Month is a calendar month by posting date, with one exception: when the User has Pay Days, a Pay Transaction counts in the Month of its nearest Pay Day (`reporting/monthly.py::pay_month`). `posted_on` is never changed. The exception applies to the monthly figures only; the Transactions list filters and totals by posting date and shows `counts_in_month` as a note.
- UI components come from shadcn/ui (`frontend/src/components/ui/`, generated; do not hand-edit). Charts use one blue for every series, with red reserved for "over"; colours are the `--viz-*` variables in `frontend/src/index.css`.
- Light and dark themes: the `dark` class on `<html>` switches the colour variables in `index.css`, set by `ThemeToggle.tsx` and, before first paint, by the script in `index.html`. Use the theme variables or a `dark:` variant for any new colour, and check both themes.

## Deliberately not in v1

Creating a Rule from the Rules page (they are created from a Transaction), merchant breakdown, recurring-charge detection, month-versus-average, login, currency conversion (a USD-only row is imported as an Unconverted Amount for the User to settle). Do not treat these as oversights.

## Open items

- Never clicked through in a browser: the Import upload flow and the two buttons that settle an Unconverted Amount. Their API endpoints are tested.
- `docker-compose.prod.yml` builds but has not been run.
- `npm audit` reports 7 high-severity issues via the `shadcn` package (needed for its stylesheet); not investigated.
- Unclassified money in lowers Spending, so an incoming Transfer (a card payment arriving on the card) understates Spending until it is classified. It shows in the Review Inbox, and the Dashboard says so when the Month's unreviewed total is not positive.
- Daniel's real database (8088) was emptied on 2026-10-04 for a fresh import; he has still to recreate his Account, CSV Mapping, Rules (including a Pay Rule) and Pay Days (1 and 16). The dump from before is in `backups/` (ignored by git; restore with `psql` into an empty database).

## Checking UI changes

There is no browser tool. Headless Chrome works for screenshots but never exits against the Vite dev server, so wrap it in a time limit:

`perl -e 'alarm 14; exec @ARGV' "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome" --headless=new --window-size=1280,1600 --virtual-time-budget=5000 --screenshot=out.png http://localhost:8089/dashboard`

For a dark-theme screenshot, temporarily put `class="dark"` on `<html>` in `frontend/index.html` and remove it afterwards; headless Chrome cannot click the toggle.

Look at pages on the demo stack (port 8089), and add cases to `backend/app/demo_data.py` when a feature needs data it lacks. Never load mock data into the stack on 8088; its database holds Daniel's real transactions.
