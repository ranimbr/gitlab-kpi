import asyncio
from sqlalchemy import create_engine
from app.services.extraction.extraction_service import ExtractionService
from sqlalchemy.orm import sessionmaker

async def test_tomasz_commits():
    engine = create_engine("postgresql://postgres:0000@localhost:5432/gitlab_kpi1")
    Session = sessionmaker(bind=engine)
    db = Session()
    
    from app.models.gitlab_config import GitLabConfig
    from app.models.period import Period
    from app.models.project import Project
    from app.models.developer import Developer
    
    config = db.query(GitLabConfig).filter(GitLabConfig.is_active == True).first()
    service = ExtractionService()
    
    # Tomasz Maczukin
    tomasz = db.query(Developer).filter(Developer.name == 'Tomasz Maczukin').first()
    # gitlab-runner
    project = db.query(Project).filter(Project.gitlab_project_id == 250833).first()
    # Mars 2026
    period = db.query(Period).filter(Period.year == 2026, Period.month == 3).first()
    
    # On va utiliser _extract_commits directement pour Tomasz uniquement
    from app.models.extraction_lot import ExtractionLot, ExtractionTypeEnum, ExtractionStatusEnum
    lot = ExtractionLot(
        extraction_type=ExtractionTypeEnum.MONTHLY,
        status=ExtractionStatusEnum.running,
        period_id=period.id,
        project_id=project.id
    )
    db.add(lot)
    db.flush()

    print(f"Extraction ciblée des commits de {tomasz.name}...")
    from app.services.gitlab.gitlab_client import GitLabClient
    client = GitLabClient(config)
    
    # On appelle la méthode interne avec l'ID de Tomasz uniquement
    await service._extract_commits(db, project, lot, client, developer_ids=[tomasz.id])
    
    # Verification
    from app.models.commit import Commit
    res = db.execute(text(f"SELECT count(*) FROM git_commit WHERE developer_id = {tomasz.id} AND extraction_lot_id = {lot.id}")).fetchone()
    print(f"Extraction terminée : {res[0]} commits trouvés pour Tomasz.")
    
    db.rollback() # On ne garde pas ce lot de test
    db.close()

if __name__ == "__main__":
    from sqlalchemy import text
    asyncio.run(test_tomasz_commits())
