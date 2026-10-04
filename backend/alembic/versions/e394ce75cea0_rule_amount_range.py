"""rule amount range

Revision ID: e394ce75cea0
Revises: 270c4f6c5e35
"""
from alembic import op
import sqlalchemy as sa


revision = 'e394ce75cea0'
down_revision = '270c4f6c5e35'
branch_labels = None
depends_on = None


def upgrade() -> None:
    # Existing Rules keep both empty, which means "any amount".
    op.add_column('rules', sa.Column('amount_min_cents', sa.Integer(), nullable=True))
    op.add_column('rules', sa.Column('amount_max_cents', sa.Integer(), nullable=True))


def downgrade() -> None:
    op.drop_column('rules', 'amount_max_cents')
    op.drop_column('rules', 'amount_min_cents')
