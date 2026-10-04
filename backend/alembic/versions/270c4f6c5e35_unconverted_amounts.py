"""unconverted amounts

Revision ID: 270c4f6c5e35
Revises: 018eb0f7bb66
"""
from alembic import op
import sqlalchemy as sa


revision = '270c4f6c5e35'
down_revision = '018eb0f7bb66'
branch_labels = None
depends_on = None


def upgrade() -> None:
    # Existing rows: the imported amount is the amount they already have, and
    # none of them is unconverted. Added as nullable, filled, then made required.
    op.add_column('transactions', sa.Column('imported_amount_cents', sa.Integer(), nullable=True))
    op.add_column('transactions', sa.Column('amount_unconverted', sa.Boolean(), nullable=True))
    op.execute("UPDATE transactions SET imported_amount_cents = amount_cents, amount_unconverted = false")
    op.alter_column('transactions', 'imported_amount_cents', nullable=False)
    op.alter_column('transactions', 'amount_unconverted', nullable=False)


def downgrade() -> None:
    op.drop_column('transactions', 'amount_unconverted')
    op.drop_column('transactions', 'imported_amount_cents')
