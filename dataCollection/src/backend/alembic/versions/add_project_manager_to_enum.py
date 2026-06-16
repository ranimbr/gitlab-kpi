"""add_project_manager_to_userroleenum

Revision ID: add_project_manager_to_enum
Revises: remove_project_ids_column
Create Date: 2026-06-10
"""
from alembic import op
import sqlalchemy as sa
from sqlalchemy import create_engine, text


# revision identifiers
revision = 'add_project_manager_to_enum'
down_revision = 'remove_project_ids_column'


def upgrade():
    # Ajouter project_manager à l'enum userroleenum dans auth_db
    try:
        op.execute("ALTER TYPE userroleenum ADD VALUE 'project_manager'")
    except Exception:
        pass
    
    # Ajouter project_manager à l'enum dans toutes les bases tenant
    # Liste des bases tenant connues
    tenant_databases = ['gitlab_kpi1', 'telnetdb', 'kpi_dashboard']
    
    from app.core.config import Settings
    settings = Settings()
    
    for db_name in tenant_databases:
        try:
            tenant_url = f"postgresql://{settings.POSTGRES_USER}:{settings.POSTGRES_PASSWORD}@{settings.POSTGRES_HOST}:{settings.POSTGRES_PORT}/{db_name}"
            engine = create_engine(tenant_url)
            with engine.connect() as conn:
                try:
                    conn.execute(text("ALTER TYPE userroleenum ADD VALUE 'project_manager'"))
                    conn.commit()
                    print(f"✅ project_manager ajouté à l'enum dans {db_name}")
                except Exception as e:
                    # La valeur existe déjà ou erreur, on continue
                    print(f"Info pour {db_name}: {e}")
                    conn.rollback()
            engine.dispose()
        except Exception as e:
            print(f"Erreur pour {db_name}: {e}")


def downgrade():
    # PostgreSQL ne permet pas de supprimer des valeurs d'enum facilement
    # On laisse tel quel pour la compatibilité
    pass
