"""scd_type2_sites_groups

Revision ID: 055646d7e82b
Revises: 5af652e3cdb7
Create Date: 2026-05-09 18:10:10.315665

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = '055646d7e82b'
down_revision: Union[str, Sequence[str], None] = '5af652e3cdb7'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """
    [SCD TYPE 2] Migration safe sur données existantes.

    Stratégie pour developer_group_link :
    1. Créer une séquence pour la PK surrogate
    2. Ajouter id nullable → peupler via séquence → NOT NULL
    3. Ajouter is_active avec server_default=true (les lignes existantes = actives)

    Stratégie pour developer_site :
    4. Ajouter is_active / start_date / end_date avec defaults sûrs
    """

    # ── developer_group_link ──────────────────────────────────────────────────

    # 1. Séquence pour la nouvelle clé surrogate
    op.execute("CREATE SEQUENCE IF NOT EXISTS developer_group_link_id_seq")

    # 2. Ajouter id nullable (avec default depuis séquence)
    op.add_column('developer_group_link', sa.Column(
        'id', sa.Integer(),
        server_default=sa.text("nextval('developer_group_link_id_seq')"),
        nullable=True
    ))
    # Peupler les lignes existantes
    op.execute(
        "UPDATE developer_group_link "
        "SET id = nextval('developer_group_link_id_seq') "
        "WHERE id IS NULL"
    )
    # Rendre NOT NULL une fois peuplé
    op.alter_column('developer_group_link', 'id', nullable=False,
                    server_default=sa.text("nextval('developer_group_link_id_seq')"))

    # 3. Colonne is_active — server_default=true pour les lignes existantes
    op.add_column('developer_group_link', sa.Column(
        'is_active', sa.Boolean(),
        server_default='true',
        nullable=False,
        comment='False = affectation cloturee'
    ))

    # 4. Colonnes nullables (aucun risque)
    op.add_column('developer_group_link', sa.Column(
        'start_date', sa.Date(), nullable=True,
        comment="Date d'entree dans l'equipe"
    ))
    op.add_column('developer_group_link', sa.Column(
        'end_date', sa.Date(), nullable=True,
        comment="Date de sortie (NULL = encore dans l'equipe)"
    ))
    op.add_column('developer_group_link', sa.Column(
        'assigned_at', sa.DateTime(timezone=True),
        server_default=sa.text('now()'), nullable=False
    ))

    # 5. Index performance
    op.create_index('idx_devgrouplink_active',    'developer_group_link', ['developer_id', 'is_active'], unique=False)
    op.create_index('idx_devgrouplink_dates',     'developer_group_link', ['developer_id', 'start_date', 'end_date'], unique=False)
    op.create_index('idx_devgrouplink_developer', 'developer_group_link', ['developer_id'], unique=False)
    op.create_index('idx_devgrouplink_group',     'developer_group_link', ['group_id'], unique=False)

    # ── developer_site ────────────────────────────────────────────────────────

    # is_active — server_default=true pour les affectations existantes
    op.add_column('developer_site', sa.Column(
        'is_active', sa.Boolean(),
        server_default='true',
        nullable=False,
        comment='False = affectation cloturee (transfert ou depart)'
    ))
    op.add_column('developer_site', sa.Column(
        'start_date', sa.Date(), nullable=True,
        comment="Date de debut d'affectation au site"
    ))
    op.add_column('developer_site', sa.Column(
        'end_date', sa.Date(), nullable=True,
        comment='Date de fin (NULL = affectation en cours)'
    ))

    op.create_index('idx_dev_site_active', 'developer_site', ['developer_id', 'is_active'], unique=False)
    op.create_index('idx_dev_site_dates',  'developer_site', ['developer_id', 'start_date', 'end_date'], unique=False)


def downgrade() -> None:
    """Rollback complet."""
    op.drop_index('idx_dev_site_dates',  table_name='developer_site')
    op.drop_index('idx_dev_site_active', table_name='developer_site')
    op.drop_column('developer_site', 'end_date')
    op.drop_column('developer_site', 'start_date')
    op.drop_column('developer_site', 'is_active')

    op.drop_index('idx_devgrouplink_group',     table_name='developer_group_link')
    op.drop_index('idx_devgrouplink_developer', table_name='developer_group_link')
    op.drop_index('idx_devgrouplink_dates',     table_name='developer_group_link')
    op.drop_index('idx_devgrouplink_active',    table_name='developer_group_link')
    op.drop_column('developer_group_link', 'assigned_at')
    op.drop_column('developer_group_link', 'end_date')
    op.drop_column('developer_group_link', 'start_date')
    op.drop_column('developer_group_link', 'is_active')
    op.drop_column('developer_group_link', 'id')
    op.execute("DROP SEQUENCE IF EXISTS developer_group_link_id_seq")
