"""add_total_mrs_draft

Revision ID: e7a3b1c2d4f5
Revises: d1db7f36cece
Create Date: 2026-04-08 10:40:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = 'e7a3b1c2d4f5'
down_revision: Union[str, Sequence[str], None] = '6f7f7e920eb0'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Ajoute la colonne total_mrs_draft pour tracer les MRs brouillon."""
    op.add_column(
        'kpi_snapshot',
        sa.Column('total_mrs_draft', sa.Integer(), nullable=False, server_default='0')
    )


def downgrade() -> None:
    """Supprime la colonne total_mrs_draft."""
    op.drop_column('kpi_snapshot', 'total_mrs_draft')
