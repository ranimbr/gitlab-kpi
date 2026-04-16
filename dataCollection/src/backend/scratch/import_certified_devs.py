import asyncio
import os
import csv
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from app.services.admin.developer_service import DeveloperService

async def main():
    # Configuration
    DB_URL = "postgresql://postgres:0000@localhost:5432/gitlab_kpi1"
    CSV_PATH = "../../test_developpeurs_verifies.csv"
    
    if not os.path.exists(CSV_PATH):
        print(f"Erreur: Fichier {CSV_PATH} introuvable.")
        return

    engine = create_engine(DB_URL)
    Session = sessionmaker(bind=engine)
    db = Session()
    
    service = DeveloperService()
    
    print(f"Début de l'importation de {CSV_PATH}...")
    try:
        with open(CSV_PATH, 'rb') as f:
            content = f.read()
            result = service.import_from_file(db, content, "test_developpeurs_verifies.csv", create_missing_groups=True, create_missing_sites=True)
            print(f"IMPORT RÉUSSI : {result}")
            db.commit()
    except Exception as e:
        print(f"ERREUR LORS DE L'IMPORT : {e}")
        db.rollback()
    finally:
        db.close()

if __name__ == "__main__":
    asyncio.run(main())
