"""baseline

Revision ID: c81398df81ac
Revises: 126d02920e38
Create Date: 2026-03-18 17:26:31.329809

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = 'c81398df81ac'
down_revision: Union[str, Sequence[str], None] = '126d02920e38'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Upgrade schema."""
    pass


def downgrade() -> None:
    """Downgrade schema."""
    pass
