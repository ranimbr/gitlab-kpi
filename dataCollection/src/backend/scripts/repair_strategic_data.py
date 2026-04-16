
import os
import sys

# Ajouter le chemin src/backend au PYTHONPATH
sys.path.append(os.path.join(os.getcwd(), "src", "backend"))

from app.database.session import SessionLocal
from app.models.project import Project
from app.models.project_site import ProjectSite
from app.models.developer_project import DeveloperProject
from app.models.developer_site import DeveloperSite
from app.models.period import Period
from app.services.kpi.kpi_aggregator import KpiAggregator
from sqlalchemy import text

def repair():
    db = SessionLocal()
    aggregator = KpiAggregator(db)
    
    print("START: [SENIOR] Reparation des structures strategiques...")
    
    try:
        # 1. Recuperation des periodes
        periods = db.query(Period).filter(Period.year == 2026, Period.month.in_([3, 4])).all()
        if not periods:
            print("ERROR: Periodes 2026/03 ou 2026/04 introuvables.")
            return

        # 2. Reparation des Mappings Project-Site
        # On regarde qui travaille sur quoi et on deduit le site du projet
        print("LOG: Analyse des affectations Equipes -> Projets...")
        suggested_links = db.query(Project.id, DeveloperSite.site_id)\
            .join(DeveloperProject, Project.id == DeveloperProject.project_id)\
            .join(DeveloperSite, DeveloperProject.developer_id == DeveloperSite.developer_id)\
            .distinct().all()
        
        links_created = 0
        for pid, sid in suggested_links:
            exists = db.query(ProjectSite).filter_by(project_id=pid, site_id=sid).first()
            if not exists:
                db.add(ProjectSite(project_id=pid, site_id=sid))
                links_created += 1
        
        db.commit()
        print(f"OK: {links_created} liens Project-Site restaures.")

        # 3. Calcul des Snapshots pour tous les projets actifs
        active_projects = db.query(Project).filter(Project.is_active == True).all()
        print(f"LOG: Calcul des indicateurs pour {len(active_projects)} projets sur {len(periods)} Mo...")
        
        snapshots_count = 0
        for project in active_projects:
            for period in periods:
                print(f"   -> Processing {project.name} for {period.year}/{period.month:02d}...")
                try:
                    # generate_monthly_snapshots s'occupe de l'ID site, global et dev
                    aggregator.generate_monthly_snapshots(
                        project_id=project.id,
                        year=period.year,
                        month=period.month
                    )
                    snapshots_count += 1
                except Exception as e:
                    print(f"      WARN: Erreur sur {project.name}: {e}")
        
        db.commit()
        print(f"OK: {snapshots_count} cycles d'aggregation termines.")
        
        print("---------------------------------------------------------")
        print("SUCCESS: Donnees strategiques restaurees.")
        print("Veuillez rafraichir la page 'Analyse Strategique'.")
        print("---------------------------------------------------------")
        
    except Exception as e:
        print(f"CRITICAL ERROR: {e}")
        db.rollback()
    finally:
        db.close()

if __name__ == "__main__":
    repair()
