"""Merge all heads

Revision ID: 62bb524c2d60
Revises: add_project_manager_to_enum, add_target_database_to_import_log, add_user_site_ts, add_viewer_dynamic, fix_user_project_access_sequence
Create Date: 2026-06-14 00:52:30.967751

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = '62bb524c2d60'
down_revision: Union[str, Sequence[str], None] = ('add_project_manager_to_enum', 'add_target_database_to_import_log', 'add_user_site_ts', 'add_viewer_dynamic', 'fix_user_project_access_sequence')
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Upgrade schema."""
    pass


def downgrade() -> None:
    """Downgrade schema."""
    pass
