"""Add cross_contribution_score

Revision ID: 43b920d14f39
Revises: 0b8ab2e6e902
Create Date: 2026-04-09 19:58:35.174719

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = '43b920d14f39'
down_revision: Union[str, Sequence[str], None] = '0b8ab2e6e902'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Upgrade schema."""
    op.add_column('kpi_snapshot', sa.Column('cross_contribution_score', sa.Integer(), server_default='0', nullable=False))


def downgrade() -> None:
    """Downgrade schema."""
    op.drop_column('kpi_snapshot', 'cross_contribution_score')
