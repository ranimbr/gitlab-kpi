"""
init_senior_db.py (v2 - Senior Edition)

Script utilitaire pour injecter les modifications robustes dans la base de données :
1. Crée la table 'comment' avec gitlab_id en BIGINT.
2. Ajoute les colonnes 'total_comments' et 'total_reviews' à 'kpi_snapshot'.
"""

import sys
import os
sys.path.append(os.getcwd())

from sqlalchemy import text
from app.database.session import engine
from app.models.base import Base

# On importe tous les modèles pour que Base.metadata soit complet
import app.models

def init_db():
    print("--- INITIALISATION BASE DE DONNÉES SENIOR ---")
    
    # 1. Création initiale (si tables manquantes)
    print("Démarrage de la synchronisation metadata...")
    Base.metadata.create_all(bind=engine)
    print("OK : Metadata synchronisées.")

    # 2. Correction des types et colonnes manquantes
    with engine.connect() as conn:
        print("\n--- Phase d'ajustements manuels ---")
        
        # A. Correction BigInteger pour gitlab_id
        try:
            conn.execute(text("ALTER TABLE comment ALTER COLUMN gitlab_id TYPE BIGINT"))
            conn.commit()
            print("OK : Colonne 'gitlab_id' passée en BIGINT.")
        except Exception as e:
            # Fallback pour SQLite ou si déjà fait
            print(f"INFO (gitlab_id): {e}")

        # B. Ajout des colonnes KpiSnapshot
        new_cols = [
            ("total_comments", "INTEGER DEFAULT 0"),
            ("total_reviews", "INTEGER DEFAULT 0"),
        ]
        
        for col_name, col_type in new_cols:
            try:
                conn.execute(text(f"ALTER TABLE kpi_snapshot ADD COLUMN {col_name} {col_type}"))
                conn.commit()
                print(f"OK : Colonne '{col_name}' ajoutée.")
            except Exception as e:
                conn.rollback()  # Crucial : libère la transaction
                print(f"INFO ({col_name}): Déjà présente ou erreur mineure.")

        # C. Ajout de assignee_id dans MergeRequest
        try:
            conn.execute(text("ALTER TABLE merge_request ADD COLUMN assignee_id INTEGER REFERENCES developer(id) ON DELETE SET NULL"))
            conn.commit()
            print("OK : Colonne 'assignee_id' ajoutée à MergeRequest.")
        except Exception as e:
            conn.rollback()  # Crucial
            print(f"INFO (assignee_id): Déjà présente ou erreur mineure.")

    print("\n--- INITIALISATION TERMINÉE ---")

if __name__ == "__main__":
    init_db()
