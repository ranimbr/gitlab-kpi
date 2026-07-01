"""add autoincrement to git_commit.id

Revision ID: 195a4a04bc85
Revises: b36df72b1909
Create Date: 2026-07-01 10:42:12.524795

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = '195a4a04bc85'
down_revision: Union[str, Sequence[str], None] = 'b36df72b1909'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Upgrade schema."""
    op.alter_column('git_commit', 'id', existing_type=sa.Integer(), nullable=False, autoincrement=True)


def downgrade() -> None:
    """Downgrade schema."""
    op.alter_column('git_commit', 'id', existing_type=sa.Integer(), nullable=False)
