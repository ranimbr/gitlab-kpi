"""add user_project_access table

Revision ID: add_user_project_access
Revises: 
Create Date: 2026-06-09
"""
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects.postgresql import ARRAY


# revision identifiers, used by Alembic.
revision = 'add_user_project_access'
down_revision = 'add_multi_site_group_access'


def upgrade():
    op.create_table(
        'user_project_access',
        sa.Column('id', sa.Integer(), autoincrement=True, nullable=False),
        sa.Column('user_id', sa.Integer(), nullable=False, index=True),
        sa.Column('project_id', sa.Integer(), nullable=False, index=True),
        sa.Column('is_primary', sa.Boolean(), default=False),
        sa.Column('assigned_at', sa.DateTime(), server_default=sa.text('now()')),
        sa.Column('created_at', sa.DateTime(), server_default=sa.text('now()')),
        sa.Column('updated_at', sa.DateTime(), server_default=sa.text('now()'), onupdate=sa.text('now()')),
    )


def downgrade():
    op.drop_table('user_project_access')
