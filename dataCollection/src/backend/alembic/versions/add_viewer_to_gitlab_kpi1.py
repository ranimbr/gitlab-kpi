"""add_viewer_to_gitlab_kpi1

Revision ID: add_viewer_gitlab_kpi1
Revises: add_viewer_role
Create Date: 2026-06-13
"""
from alembic import op
import sqlalchemy as sa
from sqlalchemy import create_engine, text


# revision identifiers
revision = 'add_viewer_gitlab_kpi1'
down_revision = 'add_viewer_role'


def upgrade():
    # Ajouter viewer à l'enum userroleenum dans gitlab_kpi1
    from app.core.config import Settings
    settings = Settings()
    
    try:
        tenant_url = f"postgresql://{settings.POSTGRES_USER}:{settings.POSTGRES_PASSWORD}@{settings.POSTGRES_HOST}:{settings.POSTGRES_PORT}/gitlab_kpi1"
        engine = create_engine(tenant_url)
        with engine.connect() as conn:
            try:
                conn.execute(text("ALTER TYPE userroleenum ADD VALUE 'viewer'"))
                conn.commit()
                print("✅ viewer ajouté à l'enum dans gitlab_kpi1")
            except Exception as e:
                print(f"Info pour gitlab_kpi1: {e}")
                conn.rollback()
        engine.dispose()
    except Exception as e:
        print(f"Erreur pour gitlab_kpi1: {e}")


def downgrade():
    # PostgreSQL ne permet pas de supprimer des valeurs d'enum facilement
    pass
