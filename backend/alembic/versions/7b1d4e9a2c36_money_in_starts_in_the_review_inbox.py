"""money in starts in the review inbox

Revision ID: 7b1d4e9a2c36
Revises: 00c16d3c4544
"""
from alembic import op


revision = '7b1d4e9a2c36'
down_revision = '00c16d3c4544'
branch_labels = None
depends_on = None

# Money in that neither a Rule nor the User has classified.
UNCLASSIFIED_MONEY_IN = "amount_cents > 0 AND rule_id IS NULL AND NOT set_by_hand"


def upgrade() -> None:
    # Money in used to start as Other Income; it now starts as an Expense with
    # no Category, which puts it in the Review Inbox. Move the rows nothing has
    # classified to where a fresh Import would leave them. Money in that a Rule
    # or the User made Other Income stays Other Income. The new Kind
    # "money_back" needs no change here: Kind is stored as plain text.
    op.execute(
        "UPDATE transactions SET kind = 'expense' "
        f"WHERE kind = 'other_income' AND {UNCLASSIFIED_MONEY_IN}"
    )


def downgrade() -> None:
    op.execute(
        "UPDATE transactions SET kind = 'other_income' "
        f"WHERE kind = 'expense' AND category_id IS NULL AND {UNCLASSIFIED_MONEY_IN}"
    )
    # The Kind "money_back" did not exist; Other Income is the closest.
    op.execute("UPDATE transactions SET kind = 'other_income' WHERE kind = 'money_back'")
    op.execute("UPDATE rules SET kind = 'other_income' WHERE kind = 'money_back'")
