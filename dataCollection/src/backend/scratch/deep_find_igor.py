import asyncio
from sqlalchemy import create_engine
from app.services.gitlab.gitlab_client import GitLabClient
from sqlalchemy.orm import sessionmaker

async def deep_search_igor():
    engine = create_engine("postgresql://postgres:0000@localhost:5432/gitlab_kpi1")
    Session = sessionmaker(bind=engine)
    db = Session()
    
    from app.models.gitlab_config import GitLabConfig
    config = db.query(GitLabConfig).filter(GitLabConfig.is_active == True).first()
    client = GitLabClient(config)
    
    # 1. Recherche floue sur le nom
    print("Recherche de 'Drabchuk' sur GitLab...")
    users = await client._request("GET", "/users", params={"search": "Drabchuk"})
    if users:
        for u in users:
            print(f"Trouvé User: {u.get('name')} | Username: {u.get('username')} | ID: {u.get('id')}")
    
    # 2. Scan des membres du projet Runner
    project_id = 250833
    print(f"\nScan des membres du projet {project_id}...")
    members = await client.get_project_members(project_id)
    igor_members = [m for m in members if "Igor" in m.get("name", "")]
    for m in igor_members:
        print(f"Membre Igor trouvé: {m.get('name')} | Username: {m.get('username')} | ID: {m.get('id')}")

    db.close()

if __name__ == "__main__":
    asyncio.run(deep_search_igor())
