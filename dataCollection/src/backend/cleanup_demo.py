import os
import sys
from sqlalchemy import text

# Add current path for imports
sys.path.append(os.getcwd())

from app.database.session import SessionLocal
from app.models.commit import Commit
from app.models.merge_request import MergeRequest
from app.models.kpi_snapshot import KpiSnapshot
from app.models.developer import Developer
from app.models.extraction_lot import ExtractionLot
from app.models.alert import Alert
from app.models.project import Project
from app.models.site import Site
from app.models.developer_group import DeveloperGroup

def cleanup_full_senior():
    print("--- DEBUT DU NETTOYAGE TOTAL (PROJETS + EQUIPES + DATA) ---")
    db = SessionLocal()
    try:
        # 1. DATA (Snapshots, MRs, Commits, Alertes)
        print("Suppression des snapshots KPI...")
        db.query(KpiSnapshot).delete()
        
        print("Suppression des alertes...")
        db.query(Alert).delete()
        
        print("Suppression des Merge Requests...")
        db.query(MergeRequest).delete()
        
        print("Suppression des Commits...")
        db.query(Commit).delete()
        
        print("Suppression des lots d'extraction...")
        db.query(ExtractionLot).delete()
        
        # 2. RELATIONS M2M
        print("Suppression des liaisons Many-to-Many...")
        db.execute(text("DELETE FROM developer_group_link"))
        db.execute(text("DELETE FROM developer_project"))
        db.execute(text("DELETE FROM developer_site"))
        
        # 3. ENTITIES (Developers, Projects, Groups, Sites)
        print("Suppression des développeurs...")
        db.query(Developer).delete()
        
        print("Suppression des groupes/équipes...")
        db.query(DeveloperGroup).delete()
        
        print("Suppression des projets (pwhm, etc.)...")
        db.query(Project).delete()
        
        print("Suppression des sites...")
        db.query(Site).delete()

        # NOTE: On garde la GitLabConfig et les Periods
        
        db.commit()
        print("--- NETTOYAGE TERMINE AVEC SUCCES ---")
        print("Votre base de données est maintenant 100% vierge (hors configuration GitLab).")
    except Exception as e:
        db.rollback()
        print(f"ERREUR LORS DU NETTOYAGE : {e}")
    finally:
        db.close()

if __name__ == "__main__":
    cleanup_full_senior()
