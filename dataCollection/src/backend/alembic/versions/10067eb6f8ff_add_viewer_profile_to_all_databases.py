"""Add viewer profile to all databases

Revision ID: 10067eb6f8ff
Revises: 62bb524c2d60
Create Date: 2026-06-14 01:16:28.782027

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
from sqlalchemy import create_engine, text


# revision identifiers, used by Alembic.
revision: str = '10067eb6f8ff'
down_revision: Union[str, Sequence[str], None] = '62bb524c2d60'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Upgrade schema."""
    from app.core.config import Settings
    settings = Settings()
    
    # 1. D'abord, insérer le profil Viewer dans auth_db et récupérer son ID
    auth_db_url = f"postgresql://{settings.POSTGRES_USER}:{settings.POSTGRES_PASSWORD}@{settings.POSTGRES_HOST}:{settings.POSTGRES_PORT}/auth_db"
    engine = create_engine(auth_db_url)
    with engine.connect() as conn:
        try:
            # Vérifier si le profil existe déjà dans auth_db
            result = conn.execute(text("SELECT id FROM profile WHERE name = 'Viewer'"))
            existing = result.fetchone()
            
            if existing:
                viewer_id = existing[0]
                print(f"ℹ️  Profil Viewer existe déjà dans auth_db avec ID {viewer_id}")
            else:
                # Insérer et récupérer l'ID généré
                conn.execute(text("""
                    INSERT INTO profile (name, description, created_at, updated_at) VALUES
                    ('Viewer', 'Utilisateur en lecture seule avec accès flexible selon ses assignations (sites, équipes, projets)', NOW(), NOW())
                    RETURNING id
                """))
                viewer_id = conn.execute(text("SELECT id FROM profile WHERE name = 'Viewer'")).fetchone()[0]
                conn.commit()
                print(f"✅ Profil Viewer ajouté dans auth_db avec ID {viewer_id}")
        except Exception as e:
            print(f"Erreur auth_db: {e}")
            conn.rollback()
    engine.dispose()
    
    # 2. Ensuite, insérer dans les bases tenant avec le MÊME ID
    tenant_databases = ['gitlab_kpi1', 'telnetdb']
    
    for db_name in tenant_databases:
        try:
            db_url = f"postgresql://{settings.POSTGRES_USER}:{settings.POSTGRES_PASSWORD}@{settings.POSTGRES_HOST}:{settings.POSTGRES_PORT}/{db_name}"
            engine = create_engine(db_url)
            with engine.connect() as conn:
                try:
                    # Vérifier si le profil existe déjà
                    result = conn.execute(text("SELECT id FROM profile WHERE name = 'Viewer'"))
                    existing = result.fetchone()
                    
                    if existing:
                        # Mettre à jour l'ID pour correspondre à auth_db
                        if existing[0] != viewer_id:
                            conn.execute(text(f"UPDATE profile SET id = {viewer_id} WHERE name = 'Viewer'"))
                            conn.commit()
                            print(f"✅ Profil Viewer ID mis à jour dans {db_name} de {existing[0]} à {viewer_id}")
                        else:
                            print(f"ℹ️  Profil Viewer ID déjà correct dans {db_name} ({viewer_id})")
                    else:
                        # Insérer avec l'ID explicite d'auth_db
                        conn.execute(text(f"""
                            INSERT INTO profile (id, name, description, created_at, updated_at) VALUES
                            ({viewer_id}, 'Viewer', 'Utilisateur en lecture seule avec accès flexible selon ses assignations (sites, équipes, projets)', NOW(), NOW())
                        """))
                        conn.commit()
                        print(f"✅ Profil Viewer ajouté dans {db_name} avec ID {viewer_id}")
                except Exception as e:
                    print(f"Erreur pour {db_name}: {e}")
                    conn.rollback()
            engine.dispose()
        except Exception as e:
            print(f"Erreur de connexion à {db_name}: {e}")


def downgrade() -> None:
    """Downgrade schema."""
    from app.core.config import Settings
    settings = Settings()
    
    # Supprimer le profil Viewer de toutes les bases
    databases = ['auth_db', 'gitlab_kpi1', 'telnetdb']
    
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
