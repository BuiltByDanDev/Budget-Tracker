"""pay and other income

Revision ID: 5396fc122c67
Revises: cc20ea295aae
"""
from alembic import op
import sqlalchemy as sa


revision = '5396fc122c67'
down_revision = 'cc20ea295aae'
branch_labels = None
depends_on = None


def upgrade() -> None:
    # The Kind "income" is split into "pay" and "other_income". Nothing recorded
    # which was which, so existing Income becomes Other Income; a Rule or the
    # User then marks the Pay. Kind is stored as plain text, so this is only data.
    op.execute("UPDATE transactions SET kind = 'other_income' WHERE kind = 'income'")
    op.execute("UPDATE rules SET kind = 'other_income' WHERE kind = 'income'")


def downgrade() -> None:
    op.execute("UPDATE transactions SET kind = 'income' WHERE kind IN ('pay', 'other_income')")
    op.execute("UPDATE rules SET kind = 'income' WHERE kind IN ('pay', 'other_income')")
