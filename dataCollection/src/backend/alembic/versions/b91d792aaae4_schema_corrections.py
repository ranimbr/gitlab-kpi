"""schema_corrections

Revision ID: b91d792aaae4
Revises: <celui généré automatiquement>
Create Date: 2026-03-20 01:15:35.080761

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

revision: str = 'b91d792aaae4'
down_revision: Union[str, Sequence[str], None] = '<celui généré automatiquement>'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:

    # ── extraction_lot : RENOMMAGE type → extraction_type ────────────────────
    # ✅ alter_column au lieu de add_column + drop_column → préserve les données
    op.alter_column('extraction_lot', 'type', new_column_name='extraction_type')

    # Index sur extraction_type (recréer car le nom de colonne a changé)
    op.drop_index('idx_lot_type_status', table_name='extraction_lot')
    op.create_index('idx_lot_type_status',   'extraction_lot', ['extraction_type', 'status'], unique=False)
    op.create_index('idx_lot_completed_at',  'extraction_lot', ['completed_at'],              unique=False)
    op.create_index('idx_lot_project_status','extraction_lot', ['project_id', 'status'],      unique=False)

    # ── kpi_snapshot : nouveaux deltas ───────────────────────────────────────
    op.add_column('kpi_snapshot', sa.Column('delta_approved_mr_rate', sa.Float(), nullable=True))
    op.add_column('kpi_snapshot', sa.Column('delta_merged_mr_rate',   sa.Float(), nullable=True))
    op.add_column('kpi_snapshot', sa.Column('delta_nb_commits',       sa.Float(), nullable=True))

    # Index COALESCE supprimé par autogenerate → recréer manuellement
    op.drop_index('idx_kpi_snapshot_unique', table_name='kpi_snapshot', if_exists=True)
    op.create_index('idx_snapshot_period_site', 'kpi_snapshot', ['period_id', 'site_id'], unique=False)
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

    # ── kpi_threshold : RENOMMAGE type → threshold_type ──────────────────────
    # ✅ alter_column au lieu de add_column + drop_column → préserve les données
    op.alter_column('kpi_threshold', 'type', new_column_name='threshold_type')

    # Index COALESCE supprimé par autogenerate → recréer manuellement
    op.drop_index('idx_kpi_threshold_unique', table_name='kpi_threshold', if_exists=True)
    op.create_index('idx_kpi_threshold_type', 'kpi_threshold', ['threshold_type'], unique=False)
    op.execute("""
        CREATE UNIQUE INDEX IF NOT EXISTS idx_kpi_threshold_unique
        ON kpi_threshold (
            COALESCE(dashboard_id, -1),
            kpi_definition_id,
            threshold_type,
            project_id
        )
    """)

    # ── developer : index unique partiel COALESCE ────────────────────────────
    # Alembic l'a droppé → recréer avec la bonne syntaxe WHERE
    op.drop_index('idx_developer_gitlab_project_unique', table_name='developer', if_exists=True)
    op.execute("""
        CREATE UNIQUE INDEX IF NOT EXISTS idx_developer_gitlab_project_unique
        ON developer (gitlab_user_id, project_id)
        WHERE gitlab_user_id IS NOT NULL
    """)

    # ── project : nettoyage index ix_ auto-générés → remplacés par idx_ ──────
    op.drop_index('ix_project_gitlab_config_id', table_name='project', if_exists=True)
    op.drop_index('ix_project_gitlab_project_id', table_name='project', if_exists=True)
    op.drop_index('ix_project_id',               table_name='project', if_exists=True)
    op.drop_index('ix_project_site_id',          table_name='project', if_exists=True)
    op.create_index('idx_project_active', 'project', ['is_active'], unique=False)
    op.create_unique_constraint('uq_project_gitlab_id', 'project', ['gitlab_project_id'])


def downgrade() -> None:

    # ── project ───────────────────────────────────────────────────────────────
    op.drop_constraint('uq_project_gitlab_id', 'project', type_='unique')
    op.drop_index('idx_project_active', table_name='project')
    op.create_index('ix_project_site_id',          'project', ['site_id'],          unique=False)
    op.create_index('ix_project_id',               'project', ['id'],               unique=False)
    op.create_index('ix_project_gitlab_project_id','project', ['gitlab_project_id'],unique=True)
    op.create_index('ix_project_gitlab_config_id', 'project', ['gitlab_config_id'], unique=False)

    # ── kpi_threshold : RENOMMAGE inverse ────────────────────────────────────
    op.alter_column('kpi_threshold', 'threshold_type', new_column_name='type')
    op.drop_index('idx_kpi_threshold_type', table_name='kpi_threshold')
    op.execute("DROP INDEX IF EXISTS idx_kpi_threshold_unique")
    op.create_index('idx_kpi_threshold_unique', 'kpi_threshold',
                    ['dashboard_id', 'kpi_definition_id', 'type'], unique=True)

    # ── kpi_snapshot ──────────────────────────────────────────────────────────
    op.drop_index('idx_snapshot_period_site', table_name='kpi_snapshot')
    op.execute("DROP INDEX IF EXISTS idx_kpi_snapshot_unique")
    op.execute("""
        CREATE UNIQUE INDEX idx_kpi_snapshot_unique
        ON kpi_snapshot (
            project_id, period_id,
            COALESCE(site_id, -1),
            COALESCE(group_id, -1),
            COALESCE(developer_id, -1)
        )
    """)
    op.drop_column('kpi_snapshot', 'delta_nb_commits')
    op.drop_column('kpi_snapshot', 'delta_merged_mr_rate')
    op.drop_column('kpi_snapshot', 'delta_approved_mr_rate')

    # ── extraction_lot : RENOMMAGE inverse ────────────────────────────────────
    op.alter_column('extraction_lot', 'extraction_type', new_column_name='type')
    op.drop_index('idx_lot_project_status', table_name='extraction_lot')
    op.drop_index('idx_lot_completed_at',   table_name='extraction_lot')
    op.drop_index('idx_lot_type_status',    table_name='extraction_lot')
    op.create_index('idx_lot_type_status', 'extraction_lot', ['type', 'status'], unique=False)

    # ── developer ─────────────────────────────────────────────────────────────
    op.execute("DROP INDEX IF EXISTS idx_developer_gitlab_project_unique")
    op.create_index('idx_developer_gitlab_project_unique', 'developer',
                    ['gitlab_user_id', 'project_id'], unique=True,
                    postgresql_where='(gitlab_user_id IS NOT NULL)')