
from sqlalchemy import create_engine, text
from sqlalchemy.orm import sessionmaker

DB_URL = "postgresql://postgres:0000@localhost:5432/gitlab_kpi1"

def cleanup_database():
    engine = create_engine(DB_URL)
    Session = sessionmaker(bind=engine)
    db = Session()
    
    # Ordre spécifique pour respecter les clés étrangères
    tables = [
        "kpi_snapshot",
        "commit_merge_request",
        "merge_request",
        "git_commit",
        "comment",
        "extraction_lot",
        "developer_project",
        "developer_site",
        "developer",
    ]
    
    print("--- DÉBUT DU NETTOYAGE PROFESSIONNEL ---")
    try:
        for table in tables:
            print(f"Vidage de la table : {table}...")
            # On utilise TRUNCATE CASCADE pour être certain de tout vider proprement
            db.execute(text(f"TRUNCATE TABLE {table} RESTART IDENTITY CASCADE"))
        
        db.commit()
        print("--- NETTOYAGE TERMINÉ AVEC SUCCÈS ---")
    except Exception as e:
        print(f"ERREUR LORS DU NETTOYAGE : {e}")
        db.rollback()
    finally:
        db.close()

if __name__ == "__main__":
    cleanup_database()
