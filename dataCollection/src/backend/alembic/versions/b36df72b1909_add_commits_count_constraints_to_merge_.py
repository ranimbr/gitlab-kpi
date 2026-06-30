"""add_commits_count_constraints_to_merge_request

Revision ID: b36df72b1909
Revises: e9fc0bec80db
Create Date: 2026-06-23 22:55:45.694108

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = 'b36df72b1909'
down_revision: Union[str, Sequence[str], None] = 'e9fc0bec80db'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Upgrade schema."""
    from sqlalchemy import create_engine, text
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
                    # Vérifier si les contraintes existent déjà
                    result = conn.execute(text("""
                        SELECT constraint_name 
                        FROM information_schema.table_constraints 
                        WHERE table_name = 'merge_request' 
                        AND constraint_name IN ('chk_mr_commits_count_positive', 'chk_mr_commits_count_required')
                    """))
                    
                    existing_constraints = [row[0] for row in result.fetchall()]
                    
                    # Ajouter la contrainte commits_count >= 0
                    if 'chk_mr_commits_count_positive' not in existing_constraints:
                        conn.execute(text("""
                            ALTER TABLE merge_request 
                            ADD CONSTRAINT chk_mr_commits_count_positive 
                            CHECK (commits_count IS NULL OR commits_count >= 0)
                        """))
                        print(f"✅ Constraint chk_mr_commits_count_positive ajoutée dans {db_name}")
                    else:
                        print(f"ℹ️  Constraint chk_mr_commits_count_positive existe déjà dans {db_name}")
                    
                    # Ajouter la contrainte commits_count requis pour non-draft
                    if 'chk_mr_commits_count_required' not in existing_constraints:
                        # D'abord, mettre à jour les MRs non-draft avec commits_count NULL à 0
                        conn.execute(text("""
                            UPDATE merge_request 
                            SET commits_count = 0 
                            WHERE is_draft = FALSE AND commits_count IS NULL
                        """))
                        print(f"✅ MRs non-draft mises à jour (commits_count = 0) dans {db_name}")
                        
                        conn.execute(text("""
                            ALTER TABLE merge_request 
                            ADD CONSTRAINT chk_mr_commits_count_required 
                            CHECK ((is_draft = TRUE) OR (commits_count IS NOT NULL))
                        """))
                        print(f"✅ Constraint chk_mr_commits_count_required ajoutée dans {db_name}")
                    else:
                        print(f"ℹ️  Constraint chk_mr_commits_count_required existe déjà dans {db_name}")
                    
                    conn.commit()
                except Exception as e:
                    print(f"Erreur {db_name}: {e}")
                    conn.rollback()
            engine.dispose()
        except Exception as e:
            print(f"Erreur connexion {db_name}: {e}")


def downgrade() -> None:
    """Downgrade schema."""
    from sqlalchemy import create_engine, text
    from app.core.config import Settings
    settings = Settings()
    
    databases = ['gitlab_kpi1', 'telnetdb']
    
    for db_name in databases:
        try:
            db_url = f"postgresql://{settings.POSTGRES_USER}:{settings.POSTGRES_PASSWORD}@{settings.POSTGRES_HOST}:{settings.POSTGRES_PORT}/{db_name}"
            engine = create_engine(db_url)
            with engine.connect() as conn:
                try:
                    # Supprimer les contraintes
                    for constraint in ['chk_mr_commits_count_required', 'chk_mr_commits_count_positive']:
                        result = conn.execute(text("""
                            SELECT constraint_name 
                            FROM information_schema.table_constraints 
                            WHERE table_name = 'merge_request' AND constraint_name = :constraint
                        """), {"constraint": constraint})
                        
                        if result.fetchone():
                            conn.execute(text(f"ALTER TABLE merge_request DROP CONSTRAINT {constraint}"))
                            print(f"✅ Constraint {constraint} supprimée dans {db_name}")
                    
                    conn.commit()
                except Exception as e:
                    print(f"Erreur {db_name}: {e}")
                    conn.rollback()
            engine.dispose()
        except Exception as e:
            print(f"Erreur connexion {db_name}: {e}")
