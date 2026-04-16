import asyncio
import os
import sys

sys.path.append(os.path.dirname(os.path.abspath(__file__)))

from app.database.session import SessionLocal
from app.services.extraction.extraction_service import ExtractionService
from app.models.project import Project
from app.models.gitlab_config import GitLabConfig

async def force_extract():
    db = SessionLocal()
    try:
        kpi_projet = db.query(Project).filter(Project.name.like("%KPI-GitLab%")).first()
        config = db.query(GitLabConfig).first()
        
        if kpi_projet and config:
            print(f"Lancement de l'extraction API pour {kpi_projet.name}...")
            service = ExtractionService()
            
            # Utilisation de la méthode REALTIME pour forcer le téléchargement des commits depuis l'API
            await service.run_realtime_extraction(
                db=db,
                gitlab_project_id=kpi_projet.gitlab_project_id,
                gitlab_config=config,
                triggered_by_user=1 # Admin
            )
            print("Extraction API terminée avec succès ! 🚀")
            
        else:
            print("Erreur: Projet F-Droid ou Config GitLab non trouvés.")
    except Exception as e:
        print(f"Erreur durant l'extraction: {e}")
        import traceback
        traceback.print_exc()
    finally:
        db.close()

if __name__ == "__main__":
    asyncio.run(force_extract())
