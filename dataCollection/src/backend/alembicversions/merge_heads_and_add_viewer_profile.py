"""merge_heads_and_add_viewer_profile

Revision ID: merge_heads_add_viewer
Revises: add_project_manager_to_enum, add_viewer_profile
Create Date: 2026-06-14
"""
from alembic import op
import sqlalchemy as sa
from sqlalchemy import create_engine, text


# revision identifiers
revision = 'merge_heads_add_viewer'
down_revision = None  # This will be set by alembic when merging


def upgrade():
    # Ajouter le profil Viewer à toutes les bases de données
    databases = ['gitlab_kpi1', 'telnetdb']
    
    from app.core.config import Settings
    settings = Settings()
    
    for db_name in databases:
        try:
            db_url = f"postgresql://{settings.POSTGRES_USER}:{settings.POSTGRES_PASSWORD}@{settings.POSTGRES_HOST}:{settings.POSTGRES_PORT}/{db_name}"
            engine = create_engine(db_url)
            with engine.connect() as conn:
                try:
                    conn.execute(text("""
                        INSERT INTO profile (name, description, created_at, updated_at) VALUES
                        ('Viewer', 'Utilisateur en lecture seule avec accès flexible selon ses assignations (sites, équipes, projets)', NOW(), NOW())
                    """))
                    conn.commit()
                    print(f"✅ Profil Viewer ajouté dans {db_name}")
                except Exception as e:
                    if "duplicate key" in str(e).lower() or "already exists" in str(e).lower():
                        print(f"ℹ️  Profil Viewer existe déjà dans {db_name} - ignoré")
                    else:
                        print(f"Erreur pour {db_name}: {e}")
                        conn.rollback()
            engine.dispose()
        except Exception as e:
            print(f"Erreur de connexion à {db_name}: {e}")


def downgrade():
    # Supprimer le profil Viewer de toutes les bases
    databases = ['gitlab_kpi1', 'telnetdb']
    
    from app.core.config import Settings
    settings = Settings()
    
    for db_name in databases:
        try:
            db_url = f"postgresql://{settings.POSTGRES_USER}:{settings.POSTGRES_PASSWORD}@{settings.POSTGRES_HOST}:{settings.POSTGRES_PORT}/{db_name}"
            engine = create_engine(db_url)
            with engine.connect() as conn:
                try:
                    conn.execute(text("DELETE FROM profile WHERE name = 'Viewer'"))
                    conn.commit()
                    print(f"✅ Profil Viewer supprimé de {db_name}")
                except Exception as e:
                    print(f"Erreur suppression dans {db_name}: {e}")
                    conn.rollback()
            engine.dispose()
        except Exception as e:
            print(f"Erreur de connexion à {db_name}: {e}")
