"""Add avg_commits_per_mr to kpi_snapshot

Revision ID: e9fc0bec80db
Revises: f661bab35119
Create Date: 2026-06-23 22:35:35.133316

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
from sqlalchemy import create_engine, text

# revision identifiers, used by Alembic.
revision: str = 'e9fc0bec80db'
down_revision: Union[str, Sequence[str], None] = 'f661bab35119'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Upgrade schema."""
    from app.core.config import Settings
    settings = Settings()
    
    # Appliquer les modifications aux deux bases de données
    databases = ['gitlab_kpi1', 'telnetdb']
    
    for db_name in databases:
        try:
            db_url = f"postgresql://{settings.POSTGRES_USER}:{settings.POSTGRES_PASSWORD}@{settings.POSTGRES_HOST}:{settings.POSTGRES_PORT}/{db_name}"
            engine = create_engine(db_url)
            with engine.connect() as conn:
                try:
                    # Vérifier si la colonne existe déjà
                    result = conn.execute(text("""
                        SELECT column_name 
                        FROM information_schema.columns 
                        WHERE table_name = 'kpi_snapshot' AND column_name = 'avg_commits_per_mr'
                    """))
                    
                    if result.fetchone():
                        print(f"ℹ️  Colonne avg_commits_per_mr existe déjà dans {db_name}")
                    else:
                        # Ajouter la colonne avec default
                        conn.execute(text("""
                            ALTER TABLE kpi_snapshot 
                            ADD COLUMN avg_commits_per_mr FLOAT DEFAULT 0.0
                        """))
                        
                        # Mettre à jour les lignes existantes
                        conn.execute(text("""
                            UPDATE kpi_snapshot 
                            SET avg_commits_per_mr = 0.0 
                            WHERE avg_commits_per_mr IS NULL
                        """))
                        
                        # Rendre la colonne NOT NULL
                        conn.execute(text("""
                            ALTER TABLE kpi_snapshot 
                            ALTER COLUMN avg_commits_per_mr SET NOT NULL
                        """))
                        
                        conn.commit()
                        print(f"✅ Colonne avg_commits_per_mr ajoutée dans {db_name}")
                except Exception as e:
                    print(f"Erreur {db_name}: {e}")
                    conn.rollback()
            engine.dispose()
        except Exception as e:
            print(f"Erreur connexion {db_name}: {e}")


def downgrade() -> None:
    """Downgrade schema."""
    from app.core.config import Settings
    settings = Settings()
    
    # Appliquer le rollback aux deux bases de données
    databases = ['gitlab_kpi1', 'telnetdb']
    
    for db_name in databases:
        try:
            db_url = f"postgresql://{settings.POSTGRES_USER}:{settings.POSTGRES_PASSWORD}@{settings.POSTGRES_HOST}:{settings.POSTGRES_PORT}/{db_name}"
            engine = create_engine(db_url)
            with engine.connect() as conn:
                try:
                    # Vérifier si la colonne existe
                    result = conn.execute(text("""
                        SELECT column_name 
                        FROM information_schema.columns 
                        WHERE table_name = 'kpi_snapshot' AND column_name = 'avg_commits_per_mr'
                    """))
                    
                    if result.fetchone():
                        # Supprimer la colonne
                        conn.execute(text("ALTER TABLE kpi_snapshot DROP COLUMN avg_commits_per_mr"))
                        conn.commit()
                        print(f"✅ Colonne avg_commits_per_mr supprimée dans {db_name}")
                    else:
                        print(f"ℹ️  Colonne avg_commits_per_mr n'existe pas dans {db_name}")
                except Exception as e:
                    print(f"Erreur {db_name}: {e}")
                    conn.rollback()
            engine.dispose()
        except Exception as e:
            print(f"Erreur connexion {db_name}: {e}")
