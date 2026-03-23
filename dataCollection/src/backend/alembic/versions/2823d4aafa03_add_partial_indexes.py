"""add_partial_indexes

Revision ID: <celui généré automatiquement>
Revises: c81398df81ac
Create Date: ...
"""
from typing import Sequence, Union
from alembic import op

revision: str = '<celui généré automatiquement>'
down_revision: Union[str, Sequence[str], None] = 'c81398df81ac'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.execute("""
        CREATE UNIQUE INDEX IF NOT EXISTS idx_kpi_snapshot_unique
        ON kpi_snapshot (
            project_id,
            period_id,
            COALESCE(site_id, -1),
            COALESCE(group_id, -1),
            COALESCE(developer_id, -1)
        )
    """)
    op.execute("""
        CREATE UNIQUE INDEX IF NOT EXISTS idx_developer_gitlab_project_unique
        ON developer (gitlab_user_id, project_id)
        WHERE gitlab_user_id IS NOT NULL
    """)


def downgrade() -> None:
    op.execute("DROP INDEX IF EXISTS idx_kpi_snapshot_unique")
    op.execute("DROP INDEX IF EXISTS idx_developer_gitlab_project_unique")