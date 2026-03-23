"""add_is_validated_is_bot_source_to_developer

Revision ID: 6f89c6bdd578
Revises: 2179b4d0ca54
Create Date: 2026-03-15 23:31:00.270697

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

# revision identifiers, used by Alembic.
revision: str = '6f89c6bdd578'
down_revision: Union[str, Sequence[str], None] = '2179b4d0ca54'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Upgrade schema."""

    # [FIX] Vérification dynamique des tables existantes
    conn      = op.get_bind()
    inspector = sa.inspect(conn)
    tables    = inspector.get_table_names()
    indexes   = {idx['name'] for tbl in tables for idx in inspector.get_indexes(tbl)}

    # [FIX] sub_project — supprimer seulement si existe
    if 'sub_project' in tables:
        for idx in ['idx_subproject_parent','ix_sub_project_gitlab_project_id',
                    'ix_sub_project_id','ix_sub_project_project_id']:
            if idx in indexes:
                op.drop_index(idx, table_name='sub_project')
        op.drop_table('sub_project')

    # [FIX] dashboard_access — supprimer seulement si existe
    if 'dashboard_access' in tables:
        for idx in ['idx_dashboard_access_dashboard','idx_dashboard_access_user',
                    'ix_dashboard_access_dashboard_id','ix_dashboard_access_id',
                    'ix_dashboard_access_user_id']:
            if idx in indexes:
                op.drop_index(idx, table_name='dashboard_access')
        op.drop_table('dashboard_access')

    # [FIX] uq_commit_mr — supprimé (existe déjà)
    # op.create_unique_constraint('uq_commit_mr', 'commit_merge_request', ['commit_id', 'mr_id'])

    # Nouvelles colonnes avec server_default (table non vide)
    op.add_column('developer', sa.Column(
        'is_validated', sa.Boolean(), nullable=False,
        server_default=sa.text('false'),
        comment='False = extrait auto GitLab, True = valide par admin'
    ))
    op.add_column('developer', sa.Column(
        'is_bot', sa.Boolean(), nullable=False,
        server_default=sa.text('false'),
        comment='True = bot detecte auto (exclu des KPIs)'
    ))
    op.add_column('developer', sa.Column(
        'source', sa.String(length=50), nullable=False,
        server_default=sa.text("'gitlab_extraction'"),
        comment='gitlab_extraction | manual'
    ))

    # Nouveaux index uniquement
    op.create_index('idx_developer_bot',       'developer', ['is_bot'],       unique=False)
    op.create_index('idx_developer_validated',  'developer', ['is_validated'], unique=False)

    # [FIX] ix_developer_group_id — supprimé (existe déjà)
    # op.create_index(op.f('ix_developer_group_id'), 'developer', ['group_id'], unique=False)


def downgrade() -> None:
    """Downgrade schema."""

    # [FIX] ix_developer_group_id supprimé
    # op.drop_index(op.f('ix_developer_group_id'), table_name='developer')

    op.drop_index('idx_developer_validated', table_name='developer')
    op.drop_index('idx_developer_bot',       table_name='developer')
    op.drop_column('developer', 'source')
    op.drop_column('developer', 'is_bot')
    op.drop_column('developer', 'is_validated')

    # [FIX] uq_commit_mr supprimé
    # op.drop_constraint('uq_commit_mr', 'commit_merge_request', type_='unique')

    op.create_table('dashboard_access',
    sa.Column('id', sa.INTEGER(), autoincrement=True, nullable=False),
    sa.Column('user_id', sa.INTEGER(), autoincrement=False, nullable=False),
    sa.Column('dashboard_id', sa.INTEGER(), autoincrement=False, nullable=False),
    sa.Column('created_at', postgresql.TIMESTAMP(timezone=True), server_default=sa.text("timezone('utc'::text, now())"), autoincrement=False, nullable=False),
    sa.Column('updated_at', postgresql.TIMESTAMP(timezone=True), server_default=sa.text("timezone('utc'::text, now())"), autoincrement=False, nullable=False),
    sa.ForeignKeyConstraint(['dashboard_id'], ['dashboard.id'], name='dashboard_access_dashboard_id_fkey', ondelete='CASCADE'),
    sa.ForeignKeyConstraint(['user_id'], ['app_user.id'], name='dashboard_access_user_id_fkey', ondelete='CASCADE'),
    sa.PrimaryKeyConstraint('id', name='dashboard_access_pkey'),
    sa.UniqueConstraint('user_id', 'dashboard_id', name='uq_dashboard_access')
    )
    op.create_index('ix_dashboard_access_user_id',     'dashboard_access', ['user_id'],      unique=False)
    op.create_index('ix_dashboard_access_id',           'dashboard_access', ['id'],           unique=False)
    op.create_index('ix_dashboard_access_dashboard_id', 'dashboard_access', ['dashboard_id'], unique=False)
    op.create_index('idx_dashboard_access_user',        'dashboard_access', ['user_id'],      unique=False)
    op.create_index('idx_dashboard_access_dashboard',   'dashboard_access', ['dashboard_id'], unique=False)
    op.create_table('sub_project',
    sa.Column('id', sa.INTEGER(), autoincrement=True, nullable=False),
    sa.Column('gitlab_project_id', sa.INTEGER(), autoincrement=False, nullable=False),
    sa.Column('name', sa.VARCHAR(length=255), autoincrement=False, nullable=False),
    sa.Column('path', sa.VARCHAR(length=255), autoincrement=False, nullable=False),
    sa.Column('description', sa.VARCHAR(), autoincrement=False, nullable=True),
    sa.Column('archived', sa.BOOLEAN(), autoincrement=False, nullable=False),
    sa.Column('project_id', sa.INTEGER(), autoincrement=False, nullable=False),
    sa.Column('created_at', postgresql.TIMESTAMP(timezone=True), server_default=sa.text("timezone('utc'::text, now())"), autoincrement=False, nullable=False),
    sa.Column('updated_at', postgresql.TIMESTAMP(timezone=True), server_default=sa.text("timezone('utc'::text, now())"), autoincrement=False, nullable=False),
    sa.ForeignKeyConstraint(['project_id'], ['project.id'], name='sub_project_project_id_fkey', ondelete='CASCADE'),
    sa.PrimaryKeyConstraint('id', name='sub_project_pkey')
    )
    op.create_index('ix_sub_project_project_id',        'sub_project', ['project_id'],        unique=False)
    op.create_index('ix_sub_project_id',                'sub_project', ['id'],                unique=False)
    op.create_index('ix_sub_project_gitlab_project_id', 'sub_project', ['gitlab_project_id'], unique=True)
    op.create_index('idx_subproject_parent',            'sub_project', ['project_id'],        unique=False)
