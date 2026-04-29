
import sys
import os

# Ajouter le chemin pour trouver 'app'
sys.path.append(os.getcwd())

from app.database.session import SessionLocal
from app.models.commit import Commit
from app.models.merge_request import MergeRequest
from app.models.extraction_lot import ExtractionLot
from app.models.kpi_snapshot import KpiSnapshot
from app.models.developer import Developer
from app.models.developer_group import DeveloperGroup
from app.models.site import Site
from app.models.project import Project
from app.models.period import Period
from app.models.alert import Alert
from app.models.audit_log import AuditLog
# Correction des noms de classes (CamelCase)
from app.models.commit_merge_request import CommitMergeRequest
from app.models.developer_project import DeveloperProject
from app.models.developer_site import DeveloperSite

def clean_database():
    db = SessionLocal()
    try:
        print("🚀 Début du nettoyage de la base de données (Senior Clean Mode)...")
        
        # 1. Nettoyage des données de monitoring et logs
        db.query(Alert).delete()
        db.query(AuditLog).delete()
        print("✅ Alertes et Audit Logs supprimés.")

        # 2. Nettoyage des KPIs et résultats
        db.query(KpiSnapshot).delete()
        print("✅ Snapshots KPI supprimés.")

        # 3. Nettoyage des données GitLab (Commits/MRs)
        # Tables de jonction d'abord
        db.query(CommitMergeRequest).delete()
        db.query(Commit).delete()
        db.query(MergeRequest).delete()
        db.query(ExtractionLot).delete()
        print("✅ Commits, Merge Requests et Lots d'extraction supprimés.")

        # 4. Nettoyage de la structure organisationnelle
        db.query(DeveloperProject).delete()
        db.query(DeveloperSite).delete()
        db.query(DeveloperGroup).delete()
        db.query(Developer).delete()
        db.query(Site).delete()
        db.query(Project).delete()
        
        # Supprimer les périodes pour repartir sur un calendrier propre
        db.query(Period).delete()
        
        db.commit()
        print("\n✨ Base de données nettoyée avec succès !")
        print("ℹ️  Conservés : Comptes Utilisateurs et Configuration GitLab.")
        
    except Exception as e:
        db.rollback()
        print(f"❌ Erreur lors du nettoyage : {str(e)}")
    finally:
        db.close()

if __name__ == "__main__":
    confirm = input("⚠️ VOULEZ-VOUS VRAIMENT VIDER LA BASE (Sauf Users/Config) ? [y/N] : ")
    if confirm.lower() == 'y':
        clean_database()
    else:
        print("Annulé.")
