"""add_viewer_role_to_userroleenum

Revision ID: add_viewer_role
Revises: add_role_id_to_app_user
Create Date: 2026-06-13
"""
from alembic import op
import sqlalchemy as sa
from sqlalchemy import create_engine, text


# revision identifiers
revision = 'add_viewer_role'
down_revision = 'add_role_id_to_app_user'


def upgrade():
    # Ajouter viewer à l'enum userroleenum dans la base de données actuelle
    try:
        op.execute("ALTER TYPE userroleenum ADD VALUE 'viewer'")
        print("✅ viewer ajouté à l'enum")
    except Exception as e:
        print(f"Info: {e}")
        # La valeur existe déjà ou erreur, on continue


def downgrade():
    # PostgreSQL ne permet pas de supprimer des valeurs d'enum facilement
    # On laisse tel quel pour la compatibilité
    pass
