
import os
import sys

# Ajouter le chemin src/backend au PYTHONPATH
sys.path.append(os.path.join(os.getcwd(), "src", "backend"))

from app.database.session import SessionLocal
from sqlalchemy import text

def factory_reset():
    db = SessionLocal()
    print("START: [SENIOR] Factory Reset de la base de donnees (PostgreSQL)...")
    
    # Liste exacte des tables métier à vider (basée sur l'inspecteur DB)
    tables_to_wipe = [
        "kpi_snapshot",
        "merge_request",
        "git_commit",
        "commit_merge_request",
        "comment",
        "alert",
        "extraction_lot",
        "audit_log",
        "developer_import_log",
        "developer_project",
        "developer_site",
        "project_site",
        "developer_group_site",
        "period_filter",
        "developer",
        "project",
        "site",
        "developer_group",
        "period",
        "kpi_definition",
        "kpi_threshold",
        "dashboard"
    ]
    
    try:
        # Vérification finale de l'existence de chaque table avant de générer la requête
        existing_tables = []
        for table in tables_to_wipe:
            res = db.execute(text(f"SELECT EXISTS (SELECT FROM information_schema.tables WHERE table_name = '{table}');")).scalar()
            if res:
                existing_tables.append(table)
            else:
                print(f"WARN: Table '{table}' non trouvee, ignorée.")

        if not existing_tables:
            print("INFO: Aucune table a vider.")
            return

        tables_str = ", ".join(existing_tables)
        print(f"LOG: Nettoyage de {len(existing_tables)} tables métier...")
        
        # [SENIOR] On utilise RESTART IDENTITY pour remettre les compteurs d'IDs à 1
        query = f"TRUNCATE TABLE {tables_str} RESTART IDENTITY CASCADE;"
        db.execute(text(query))
        
        db.commit()
        print("---------------------------------------------------------")
        print("SUCCESS: Base de donnees remise a zero (Metier uniquement).")
        print("INFO: Config GitLab et Utilisateurs PRESERVES.")
        print("---------------------------------------------------------")
        
    except Exception as e:
        print(f"CRITICAL ERROR: {e}")
        db.rollback()
    finally:
        db.close()

if __name__ == "__main__":
    confirm = input("TAPEZ 'OUI' POUR CONFIRMER LA SUPPRESSION TOTALE: ")
    if confirm.upper() == "OUI":
        factory_reset()
    else:
        print("ABORT: Operation annulee.")
