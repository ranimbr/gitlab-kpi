"""Add MR cycle_time_hours

Revision ID: 0b8ab2e6e902
Revises: e7a3b1c2d4f5
Create Date: 2026-04-09 19:41:33.051852

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = '0b8ab2e6e902'
down_revision: Union[str, Sequence[str], None] = 'e7a3b1c2d4f5'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column('merge_request', sa.Column('cycle_time_hours', sa.Float(), nullable=True))

def downgrade() -> None:
    op.drop_column('merge_request', 'cycle_time_hours')
