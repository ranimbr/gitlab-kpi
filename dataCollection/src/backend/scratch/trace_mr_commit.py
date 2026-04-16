import asyncio
from sqlalchemy import create_engine
from app.services.gitlab.gitlab_client import GitLabClient
from sqlalchemy.orm import sessionmaker

async def trace_mr_commit():
    engine = create_engine("postgresql://postgres:0000@localhost:5432/gitlab_kpi1")
    Session = sessionmaker(bind=engine)
    db = Session()
    
    from app.models.gitlab_config import GitLabConfig
    config = db.query(GitLabConfig).filter(GitLabConfig.is_active == True).first()
    client = GitLabClient(config)
    
    project_id = 250833
    mr_iid = 6511 # La MR de Tomasz vue dans le screenshot
    
    print(f"Analyse des commits de la MR !{mr_iid}...")
    commits = await client.get_merge_request_commits(project_id, mr_iid)
    
    with open("scratch/commit_metadata.txt", "w", encoding="utf-8") as f:
        if commits:
            for c in commits:
                f.write(f"Commit: {c.get('id')}\n")
                f.write(f"Author Name:  {c.get('author_name')}\n")
                f.write(f"Author Email: {c.get('author_email')}\n")
        else:
            f.write("Aucun commit trouvé.")

    db.close()
    print("Données enregistrées dans scratch/commit_metadata.txt")

if __name__ == "__main__":
    asyncio.run(trace_mr_commit())
