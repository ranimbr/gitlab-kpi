"""init clean FULL FIXED

Revision ID: 084f2b91a770
"""

from typing import Sequence, Union
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

revision: str = '084f2b91a770'
down_revision: Union[str, Sequence[str], None] = None
branch_labels = None
depends_on = None


def upgrade() -> None:
    """Upgrade schema."""

    # ======================
    # 1. BASE TABLES (no FK)
    # ======================

    op.create_table('site',
        sa.Column('id', sa.Integer(), primary_key=True),
        sa.Column('name', sa.String(100), nullable=False, unique=True),
        sa.Column('country', sa.String(100)),
        sa.Column('timezone', sa.String(50)),
        sa.Column('is_active', sa.Boolean(), nullable=False),
        sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.text('now()')),
        sa.Column('updated_at', sa.DateTime(timezone=True), server_default=sa.text('now()'))
    )

    op.create_table('kpi_definition',
        sa.Column('id', sa.Integer(), primary_key=True),
        sa.Column('code', sa.String(100), nullable=False, unique=True),
        sa.Column('label', sa.String(255), nullable=False),
        sa.Column('formula_description', sa.Text()),
        sa.Column('unit', sa.String(50)),
        sa.Column('aggregation_level', sa.Enum('site','project','developer','group', name='aggregationlevelenum'), nullable=False),
        sa.Column('is_active', sa.Boolean(), nullable=False),
        sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.text('now()')),
        sa.Column('updated_at', sa.DateTime(timezone=True), server_default=sa.text('now()'))
    )

    op.create_table('period',
        sa.Column('id', sa.Integer(), primary_key=True),
        sa.Column('year', sa.Integer(), nullable=False),
        sa.Column('month', sa.Integer(), nullable=False),
        sa.Column('status', sa.Enum('open','closed', name='periodstatusenum'), nullable=False),
        sa.CheckConstraint('month >= 1 AND month <= 12'),
        sa.UniqueConstraint('year','month')
    )

    # ======================
    # 2. GROUP (depends on site)
    # ======================

    op.create_table('developer_group',
        sa.Column('id', sa.Integer(), primary_key=True),
        sa.Column('name', sa.String(100), nullable=False),
        sa.Column('description', sa.String(500)),
        sa.Column('site_id', sa.Integer()),
        sa.Column('manager_id', sa.Integer()),
        sa.ForeignKeyConstraint(['site_id'], ['site.id'], ondelete='SET NULL')
    )

    # ======================
    # 3. USER (depends on group + site)
    # ======================

    op.create_table('app_user',
        sa.Column('id', sa.Integer(), primary_key=True),
        sa.Column('email', sa.String(255), nullable=False, unique=True),
        sa.Column('login', sa.String(100), unique=True),
        sa.Column('name', sa.String(255)),
        sa.Column('hashed_password', sa.String(255), nullable=False),
        sa.Column('role', sa.Enum('super_admin','site_manager','team_lead','developer', name='userroleenum'), nullable=False),
        sa.Column('is_active', sa.Boolean(), nullable=False),
        sa.Column('dashboard_access', postgresql.ARRAY(sa.Integer())),
        sa.Column('site_id', sa.Integer()),
        sa.Column('group_id', sa.Integer()),
        sa.ForeignKeyConstraint(['site_id'], ['site.id'], ondelete='SET NULL'),
        sa.ForeignKeyConstraint(['group_id'], ['developer_group.id'], ondelete='SET NULL')
    )

    # FK circulaire corrigée
    op.create_foreign_key(
        'fk_devgroup_manager',
        'developer_group', 'app_user',
        ['manager_id'], ['id'],
        ondelete='SET NULL'
    )

    # ======================
    # 4. PROJECT + CONFIG
    # ======================

    op.create_table('gitlab_config',
        sa.Column('id', sa.Integer(), primary_key=True),
        sa.Column('name', sa.String(100)),
        sa.Column('domain', sa.String(255), unique=True),
        sa.Column('token', sa.String(512)),
        sa.Column('is_active', sa.Boolean(), nullable=False),
        sa.Column('site_id', sa.Integer()),
        sa.ForeignKeyConstraint(['site_id'], ['site.id'], ondelete='SET NULL')
    )

    op.create_table('project',
        sa.Column('id', sa.Integer(), primary_key=True),
        sa.Column('gitlab_project_id', sa.Integer(), nullable=False, unique=True),
        sa.Column('name', sa.String(255)),
        sa.Column('path', sa.String(255)),
        sa.Column('visibility', sa.Enum('private','internal','public', name='visibilityenum')),
        sa.Column('archived', sa.Boolean(), nullable=False),
        sa.Column('is_active', sa.Boolean(), nullable=False),
        sa.Column('gitlab_config_id', sa.Integer()),
        sa.ForeignKeyConstraint(['gitlab_config_id'], ['gitlab_config.id'], ondelete='SET NULL')
    )

    # ======================
    # 5. DEVELOPER
    # ======================

    op.create_table('developer',
        sa.Column('id', sa.Integer(), primary_key=True),
        sa.Column('name', sa.String(255)),
        sa.Column('email', sa.String(255)),
        sa.Column('is_active', sa.Boolean(), nullable=False),
        sa.Column('group_id', sa.Integer()),
        sa.ForeignKeyConstraint(['group_id'], ['developer_group.id'], ondelete='SET NULL')
    )

    # ======================
    # 6. RELATIONS
    # ======================

    op.create_table('developer_project',
        sa.Column('developer_id', sa.Integer(), primary_key=True),
        sa.Column('project_id', sa.Integer(), primary_key=True),
        sa.ForeignKeyConstraint(['developer_id'], ['developer.id'], ondelete='CASCADE'),
        sa.ForeignKeyConstraint(['project_id'], ['project.id'], ondelete='CASCADE')
    )

    # ======================
    # 7. EXTRACTION
    # ======================

    op.create_table('extraction_lot',
        sa.Column('id', sa.Integer(), primary_key=True),
        sa.Column('status', sa.Enum('pending','running','completed','failed', name='extractionstatusenum')),
        sa.Column('period_id', sa.Integer()),
        sa.Column('project_id', sa.Integer()),
        sa.ForeignKeyConstraint(['period_id'], ['period.id'], ondelete='CASCADE'),
        sa.ForeignKeyConstraint(['project_id'], ['project.id'], ondelete='CASCADE')
    )

    # ======================
    # 8. COMMITS + MR
    # ======================

    op.create_table('git_commit',
        sa.Column('id', sa.Integer(), primary_key=True),
        sa.Column('gitlab_commit_id', sa.String(64)),
        sa.Column('project_id', sa.Integer()),
        sa.Column('developer_id', sa.Integer()),
        sa.ForeignKeyConstraint(['project_id'], ['project.id'], ondelete='CASCADE'),
        sa.ForeignKeyConstraint(['developer_id'], ['developer.id'], ondelete='SET NULL')
    )

    op.create_table('merge_request',
        sa.Column('id', sa.Integer(), primary_key=True),
        sa.Column('gitlab_mr_id', sa.Integer()),
        sa.Column('state', sa.Enum('opened','closed','merged', name='mrstateenum')),
        sa.Column('project_id', sa.Integer()),
        sa.ForeignKeyConstraint(['project_id'], ['project.id'], ondelete='CASCADE')
    )

    # ======================
    # 9. KPI + ALERT
    # ======================

    op.create_table('kpi_snapshot',
        sa.Column('id', sa.Integer(), primary_key=True),
        sa.Column('project_id', sa.Integer()),
        sa.Column('period_id', sa.Integer()),
        sa.ForeignKeyConstraint(['project_id'], ['project.id'], ondelete='CASCADE'),
        sa.ForeignKeyConstraint(['period_id'], ['period.id'], ondelete='CASCADE')
    )

    op.create_table('kpi_threshold',
        sa.Column('id', sa.Integer(), primary_key=True),
        sa.Column('project_id', sa.Integer()),
        sa.Column('kpi_definition_id', sa.Integer()),
        sa.ForeignKeyConstraint(['project_id'], ['project.id'], ondelete='CASCADE'),
        sa.ForeignKeyConstraint(['kpi_definition_id'], ['kpi_definition.id'], ondelete='CASCADE')
    )

    op.create_table('alert',
        sa.Column('id', sa.Integer(), primary_key=True),
        sa.Column('level', sa.Enum('WARNING','CRITICAL', name='alertlevelenum')),
        sa.Column('kpi_snapshot_id', sa.Integer()),
        sa.ForeignKeyConstraint(['kpi_snapshot_id'], ['kpi_snapshot.id'], ondelete='CASCADE')
    )


def downgrade() -> None:
    """Downgrade schema"""

    op.drop_table('alert')
    op.drop_table('kpi_threshold')
    op.drop_table('kpi_snapshot')
    op.drop_table('merge_request')
    op.drop_table('git_commit')
    op.drop_table('extraction_lot')
    op.drop_table('developer_project')
    op.drop_table('developer')
    op.drop_table('project')
    op.drop_table('gitlab_config')
    op.drop_table('app_user')
    op.drop_table('developer_group')
    op.drop_table('period')
    op.drop_table('kpi_definition')
    op.drop_table('site')

    # DROP ENUMS 🔥
    op.execute("DROP TYPE IF EXISTS userroleenum CASCADE")
    op.execute("DROP TYPE IF EXISTS aggregationlevelenum CASCADE")
    op.execute("DROP TYPE IF EXISTS periodstatusenum CASCADE")
    op.execute("DROP TYPE IF EXISTS visibilityenum CASCADE")
    op.execute("DROP TYPE IF EXISTS extractionstatusenum CASCADE")
    op.execute("DROP TYPE IF EXISTS mrstateenum CASCADE")
    op.execute("DROP TYPE IF EXISTS alertlevelenum CASCADE")