"""add_source_filename_to_extraction_lot

Revision ID: f3a9c1e2b7d8
Revises: c4ba0ad89dc2
Create Date: 2026-06-04 01:00:00.000000

Adds source_filename column to extraction_lot to track the original
name of uploaded JSON/ZIP files during manual imports.
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
from sqlalchemy import inspect


# revision identifiers, used by Alembic.
revision: str = 'f3a9c1e2b7d8'
down_revision: Union[str, Sequence[str], None] = 'c4ba0ad89dc2'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def _column_exists(table_name: str, column_name: str) -> bool:
    """Check if a column already exists (safety for manual script idempotency)."""
    bind = op.get_bind()
    insp = inspect(bind)
    columns = [col['name'] for col in insp.get_columns(table_name)]
    return column_name in columns


def upgrade() -> None:
    """Ajoute la colonne source_filename à extraction_lot.

    Cette colonne stocke le nom du fichier JSON ou ZIP uploadé lors d'un
    import manuel via l'onglet Import JSON du tableau de bord.
    La vérification d'existence est idempotente : si la colonne a déjà
    été ajoutée via un script manuel (add_source_filename_column.py),
    cette migration ne plantera pas.
    """
    if not _column_exists('extraction_lot', 'source_filename'):
        op.add_column(
            'extraction_lot',
            sa.Column(
                'source_filename',
                sa.String(length=255),
                nullable=True,
                comment='Nom original du fichier JSON/ZIP importé manuellement'
            )
        )


def downgrade() -> None:
    """Supprime la colonne source_filename de extraction_lot."""
    if _column_exists('extraction_lot', 'source_filename'):
        op.drop_column('extraction_lot', 'source_filename')
