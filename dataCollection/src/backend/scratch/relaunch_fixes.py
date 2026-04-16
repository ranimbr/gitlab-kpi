import asyncio
from sqlalchemy import create_engine, text
from app.services.extraction.extraction_service import ExtractionService
from sqlalchemy.orm import sessionmaker

async def relaunch_extraction():
    engine = create_engine("postgresql://postgres:0000@localhost:5432/gitlab_kpi1")
    Session = sessionmaker(bind=engine)
    db = Session()
    
    from app.models.gitlab_config import GitLabConfig
    from app.models.period import Period
    from app.models.project import Project
    from app.models.developer import Developer
    
    config = db.query(GitLabConfig).filter(GitLabConfig.is_active == True).first()
    service = ExtractionService()
    
    # Projets cibles
    project_ids = [250833, 250836] # Runner et Shell
    period = db.query(Period).filter(Period.year == 2026, Period.month == 3).first()
    
    if not period:
        print("Période Mars 2026 non trouvée.")
        return

    print(f"Relaance de l'extraction pour Mars 2026 (ID period={period.id})")
    
    for gitlab_pid in project_ids:
        project = db.query(Project).filter(Project.gitlab_project_id == gitlab_pid).first()
        if not project: continue
        
        print(f"\nNettoyage du projet: {project.name}")
        # On supprime les anciens lots de Mars pour ce projet pour repartir à zéro
        db.execute(text(f"DELETE FROM extraction_lot WHERE project_id = {project.id} AND period_id = {period.id}"))
        db.commit()
        
        print(f"Lancement de l'extraction mensuelle pour {project.name}...")
        try:
            lot = await service.run_monthly_extraction(
                db=db,
                project_id=project.id,
                period_id=period.id,
                gitlab_config=config,
                is_backfill=False
            )
            print(f"Extraction terminée avec succès. Lot ID: {lot.id}, Status: {lot.status}")
        except Exception as e:
            print(f"Erreur lors de l'extraction de {project.name}: {e}")

    db.close()

if __name__ == "__main__":
    asyncio.run(relaunch_extraction())
