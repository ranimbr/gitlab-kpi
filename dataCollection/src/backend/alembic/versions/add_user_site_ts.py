"""add timestamps to user_site_access

Revision ID: add_user_site_ts
Revises:
Create Date: 2026-06-10 19:06:00.000000

"""
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

# revision identifiers, used by Alembic.
revision = 'add_user_site_ts'
down_revision = 'add_multi_site_group_access'


def upgrade():
    # Ajouter les colonnes created_at et updated_at à la table user_site_access
    op.add_column('user_site_access', sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.text('NOW()'), nullable=False))
    op.add_column('user_site_access', sa.Column('updated_at', sa.DateTime(timezone=True), server_default=sa.text('NOW()'), nullable=False))


def downgrade():
    # Supprimer les colonnes en cas de rollback
    op.drop_column('user_site_access', 'updated_at')
    op.drop_column('user_site_access', 'created_at')
