"""remove_project_ids_column_from_app_user

Revision ID: remove_project_ids_column
Revises: add_user_project_access
Create Date: 2026-06-10
"""
from alembic import op
import sqlalchemy as sa


# revision identifiers
revision = 'remove_project_ids_column'
down_revision = 'add_user_project_access'


def upgrade():
    op.drop_column('app_user', 'project_ids')


def downgrade():
    op.add_column('app_user', sa.Column('project_ids', sa.ARRAY(sa.Integer()), nullable=True, server_default='{}'))
