"""add_viewer_menu_access

Revision ID: de3eb69f2144
Revises: 10067eb6f8ff
Create Date: 2026-06-14 02:01:50.443573

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = 'de3eb69f2144'
down_revision: Union[str, Sequence[str], None] = '10067eb6f8ff'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Upgrade schema."""
    pass


def downgrade() -> None:
    """Downgrade schema."""
    pass
