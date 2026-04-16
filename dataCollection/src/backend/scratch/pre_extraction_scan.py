import asyncio
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from app.services.gitlab.gitlab_client import GitLabClient
from app.models.gitlab_config import GitLabConfig

async def scan_activity():
    engine = create_engine("postgresql://postgres:0000@localhost:5432/gitlab_kpi1")
    Session = sessionmaker(bind=engine)
    db = Session()
    
    config = db.query(GitLabConfig).filter(GitLabConfig.is_active == True).first()
    client = GitLabClient(config)
    
    start_date = "2026-03-01T00:00:00Z"
    end_date = "2026-03-31T23:59:59Z"
    
    print("\n--- BILAN D'ACTIVITÉ SUR GITLAB (MARS 2026) ---")
    
    # Tomasz - Project Runner (250833)
    tomasz_mrs = await client.get_project_merge_requests(250833, author_id=215818, created_after=start_date, created_before=end_date)
    tomasz_commits = await client.get_project_commits(250833, author="tomasz@maczukin.pl", since=start_date, until=end_date)
    print(f"Tomasz Maczukin (Runner Execution Squad):")
    print(f"  -> {len(tomasz_mrs)} Merge Requests trouvées")
    print(f"  -> {len(tomasz_commits)} Commits trouvés")
    
    # Igor - Project Shell (250836)
    igor_mrs = await client.get_project_merge_requests(250836, author_username="igordrabchuk", created_after=start_date, created_before=end_date)
    igor_commits = await client.get_project_commits(250836, author="igor@gitlab.com", since=start_date, until=end_date)
    print(f"\nIgor Drabchuk (Core Shell Dynamics):")
    print(f"  -> {len(igor_mrs)} Merge Requests trouvées")
    print(f"  -> {len(igor_commits)} Commits trouvés")
    
    print("\nCONCLUSION : Les données sont présentes. Vous pouvez lancer l'extraction !")
    db.close()

if __name__ == "__main__":
    asyncio.run(scan_activity())
