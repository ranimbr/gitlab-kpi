"""add_timestamps_to_app_user

Revision ID: 4f1bea3d073d
Revises: 084f2b91a770
Create Date: 2026-03-28

"""
from typing import Sequence, Union
from alembic import op
import sqlalchemy as sa

revision: str = '4f1bea3d073d'
down_revision: Union[str, Sequence[str], None] = '084f2b91a770'
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column('app_user',
        sa.Column('created_at', sa.DateTime(timezone=True),
                  server_default=sa.text('now()'), nullable=False))
    op.add_column('app_user',
        sa.Column('updated_at', sa.DateTime(timezone=True),
                  server_default=sa.text('now()'), nullable=False))


def downgrade() -> None:
    op.drop_column('app_user', 'updated_at')
    op.drop_column('app_user', 'created_at')