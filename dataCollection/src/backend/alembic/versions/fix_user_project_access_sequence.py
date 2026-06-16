"""fix user_project_access sequence

Revision ID: fix_user_project_access_sequence
Revises: f3a9c1e2b7d8
Create Date: 2026-06-12
"""
from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision = 'fix_user_project_access_sequence'
down_revision = 'f3a9c1e2b7d8'


def upgrade():
    # Créer une séquence pour user_project_access si elle n'existe pas
    op.execute("CREATE SEQUENCE IF NOT EXISTS user_project_access_id_seq")
    
    # Définir la valeur par défaut de la colonne id
    op.execute("ALTER TABLE user_project_access ALTER COLUMN id SET DEFAULT nextval('user_project_access_id_seq')")
    
    # Définir la séquence comme propriétaire de la colonne
    op.execute("ALTER SEQUENCE user_project_access_id_seq OWNED BY user_project_access.id")


def downgrade():
    # Supprimer la valeur par défaut
    op.execute("ALTER TABLE user_project_access ALTER COLUMN id DROP DEFAULT")
    
    # Supprimer la séquence
    op.execute("DROP SEQUENCE IF EXISTS user_project_access_id_seq")
