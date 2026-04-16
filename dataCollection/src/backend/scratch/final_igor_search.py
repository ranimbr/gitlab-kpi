import asyncio
from sqlalchemy import create_engine
from app.services.gitlab.gitlab_client import GitLabClient
from sqlalchemy.orm import sessionmaker

async def deep_igor_search():
    engine = create_engine("postgresql://postgres:0000@localhost:5432/gitlab_kpi1")
    Session = sessionmaker(bind=engine)
    db = Session()
    
    from app.models.gitlab_config import GitLabConfig
    config = db.query(GitLabConfig).filter(GitLabConfig.is_active == True).first()
    client = GitLabClient(config)
    
    # 1. Recherche par Email (igor@gitlab.com)
    print("Recherche de l'ID pour l'email 'igor@gitlab.com'...")
    # GitLab n'autorise la recherche par email que si le domaine est public ou si les droits sont suffisants
    users = await client._request("GET", "/users", params={"external_uid": "igor@gitlab.com"}) # Test UID
    if not users:
        users = await client._request("GET", "/users", params={"username": "igor"})
    
    # 2. Recherche Drabchuk sur le projet 250836 (gitlab-shell)
    project_id = 250836
    print(f"\nRecherche de 'Drabchuk' sur projet {project_id}...")
    members = await client._request("GET", f"/projects/{project_id}/members/all", params={"query": "Drabchuk"})
    
    if members:
        for m in members:
            print(f"Match trouvé dans Shell : {m.get('name')} | Username: {m.get('username')} | ID: {m.get('id')}")
    else:
        print("Aucun 'Drabchuk' trouvé dans Shell non plus.")

    db.close()

if __name__ == "__main__":
    asyncio.run(deep_igor_search())
