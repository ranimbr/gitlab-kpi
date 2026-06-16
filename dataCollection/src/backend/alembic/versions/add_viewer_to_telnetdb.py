"""add_viewer_to_telnetdb

Revision ID: add_viewer_telnetdb
Revises: add_viewer_gitlab_kpi1
Create Date: 2026-06-13
"""
from alembic import op
import sqlalchemy as sa
from sqlalchemy import create_engine, text


# revision identifiers
revision = 'add_viewer_telnetdb'
down_revision = 'add_viewer_gitlab_kpi1'


def upgrade():
    # Ajouter viewer à l'enum userroleenum dans telnetdb
    from app.core.config import Settings
    settings = Settings()
    
    try:
        tenant_url = f"postgresql://{settings.POSTGRES_USER}:{settings.POSTGRES_PASSWORD}@{settings.POSTGRES_HOST}:{settings.POSTGRES_PORT}/telnetdb"
        engine = create_engine(tenant_url)
        with engine.connect() as conn:
            try:
                conn.execute(text("ALTER TYPE userroleenum ADD VALUE 'viewer'"))
                conn.commit()
                print("✅ viewer ajouté à l'enum dans telnetdb")
            except Exception as e:
                print(f"Info pour telnetdb: {e}")
                conn.rollback()
        engine.dispose()
    except Exception as e:
        print(f"Erreur pour telnetdb: {e}")


def downgrade():
    # PostgreSQL ne permet pas de supprimer des valeurs d'enum facilement
    pass
