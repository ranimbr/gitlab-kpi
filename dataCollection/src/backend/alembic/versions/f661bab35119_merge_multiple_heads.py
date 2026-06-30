"""Merge multiple heads

Revision ID: f661bab35119
Revises: 66dd2781ea6a, de3eb69f2144
Create Date: 2026-06-23 22:35:19.197094

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = 'f661bab35119'
down_revision: Union[str, Sequence[str], None] = ('66dd2781ea6a', 'de3eb69f2144')
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Upgrade schema."""
    pass


def downgrade() -> None:
    """Downgrade schema."""
    pass
