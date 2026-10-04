"""pay days

Revision ID: 00c16d3c4544
Revises: 5396fc122c67
"""
from alembic import op
import sqlalchemy as sa


revision = '00c16d3c4544'
down_revision = '5396fc122c67'
branch_labels = None
depends_on = None


def upgrade() -> None:
    # Empty for existing Users, which means Pay is not moved between Months.
    op.add_column('users', sa.Column('pay_days', sa.JSON(), nullable=True))


def downgrade() -> None:
    op.drop_column('users', 'pay_days')
