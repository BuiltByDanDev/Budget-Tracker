"""transaction rule link

Revision ID: cc20ea295aae
Revises: e394ce75cea0
"""
from alembic import op
import sqlalchemy as sa


revision = 'cc20ea295aae'
down_revision = 'e394ce75cea0'
branch_labels = None
depends_on = None


def upgrade() -> None:
    # Empty for every existing Transaction until the Rules are next run over them.
    op.add_column('transactions', sa.Column('rule_id', sa.Integer(), nullable=True))
    op.create_foreign_key(
        'transactions_rule_id_fkey', 'transactions', 'rules', ['rule_id'], ['id'],
        ondelete='SET NULL',
    )


def downgrade() -> None:
    op.drop_constraint('transactions_rule_id_fkey', 'transactions', type_='foreignkey')
    op.drop_column('transactions', 'rule_id')
