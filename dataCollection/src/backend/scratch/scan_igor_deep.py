import asyncio
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from app.services.gitlab.gitlab_client import GitLabClient
from app.models.gitlab_config import GitLabConfig

async def scan_igor():
    engine = create_engine("postgresql://postgres:0000@localhost:5432/gitlab_kpi1")
    Session = sessionmaker(bind=engine)
    db = Session()
    
    config = db.query(GitLabConfig).filter(GitLabConfig.is_active == True).first()
    client = GitLabClient(config)
    
    start_date = "2026-03-01T00:00:00Z"
    end_date = "2026-03-31T23:59:59Z"
    
    print("\n--- RECHERCHE APPROFONDIE POUR IGOR (MARS 2026) ---")
    
    projets = [250833, 250836] # Runner, Shell
    
    for pid in projets:
        pname = "Runner" if pid == 250833 else "Shell"
        # Recherche par username
        mrs_u = await client.get_project_merge_requests(pid, author_username="igordrabchuk", created_after=start_date, created_before=end_date)
        # Recherche par Email dans les commits
        commits_e = await client.get_project_commits(pid, author="igor@gitlab.com", since=start_date, until=end_date)
        # Recherche par Nom dans les commits
        commits_n = await client.get_project_commits(pid, author="Igor Drabchuk", since=start_date, until=end_date)
        
        print(f"Projet {pname} ({pid}):")
        print(f"  -> MRs (igordrabchuk): {len(mrs_u)}")
        print(f"  -> Commits (igor@gitlab.com): {len(commits_e)}")
        print(f"  -> Commits (Igor Drabchuk): {len(commits_n)}")
    
    db.close()

if __name__ == "__main__":
    asyncio.run(scan_igor())
