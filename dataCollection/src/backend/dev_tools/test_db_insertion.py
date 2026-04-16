import os
from datetime import datetime
from dotenv import load_dotenv
from sqlalchemy.orm import sessionmaker

import sys
BASE_DIR = os.path.dirname(os.path.abspath(__file__))
sys.path.append(BASE_DIR)

from app.database.session import engine as app_engine
from app.models.commit import Commit
from app.models.project import Project

load_dotenv(os.path.join(BASE_DIR, '.env'))

def test_real_insertion():
    SessionLocal = sessionmaker(bind=app_engine)
    db = SessionLocal()
    
    try:
        # 1. Vérifier si Tomasz et Projet 29 existent
        print("Vérification projet 29...")
        project = db.query(Project).filter(Project.id == 29).first()
        if not project:
            print("ERREUR: Projet 29 introuvable")
            return

        # 2. Créer un commit de test
        test_sha = "TEST_SHA_" + datetime.now().strftime("%Y%m%d%H%M%S")
        print(f"Tentative d'insertion du commit {test_sha}...")
        
        new_commit = Commit(
            gitlab_commit_id=test_sha,
            title="TEST COMMIT ANTIGRAVITY",
            message="Testing persistence",
            authored_date=datetime.now(),
            committed_date=datetime.now(),
            additions=10,
            deletions=5,
            total_changes=15, # Respecte chk_commit_total_changes
            is_merge_commit=False,
            project_id=29,
            developer_id=425, # Tomasz
            extraction_lot_id=None
        )
        
        db.add(new_commit)
        db.commit()
        print("Commit inséré et committé avec succès !")
        
        # 3. Vérifier s'il est là
        db.refresh(new_commit)
        print(f"Vérification après refresh: Commit ID = {new_commit.id}")
        
        # 4. Compte total
        total = db.query(Commit).count()
        print(f"Nombre total de commits en base maintenant: {total}")
        
    except Exception as e:
        print(f"ERREUR d'insertion: {e}")
        db.rollback()
    finally:
        db.close()

if __name__ == "__main__":
    test_real_insertion()
