"""add_enterprise_metrics_to_snapshot

Revision ID: 20c4b5a6b484
Revises: 43b920d14f39
Create Date: 2026-04-15 11:43:05.076379

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = '20c4b5a6b484'
down_revision: Union[str, Sequence[str], None] = '43b920d14f39'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Upgrade schema."""
    op.add_column('kpi_snapshot', sa.Column('bus_factor', sa.Integer(), server_default='0', nullable=False))
    # Note: On utilise server_default='0' pour les tables existantes
    op.add_column('kpi_snapshot', sa.Column('sprint_velocity', sa.Float(), server_default='0.0', nullable=False))
    op.add_column('kpi_snapshot', sa.Column('code_churn_rate', sa.Float(), server_default='0.0', nullable=False))


def downgrade() -> None:
    """Downgrade schema."""
    op.drop_column('kpi_snapshot', 'code_churn_rate')
    op.drop_column('kpi_snapshot', 'sprint_velocity')
    op.drop_column('kpi_snapshot', 'bus_factor')
