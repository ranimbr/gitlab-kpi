import asyncio
from sqlalchemy import create_engine
from app.services.gitlab.gitlab_client import GitLabClient
from sqlalchemy.orm import sessionmaker

async def flash_search_igor():
    engine = create_engine("postgresql://postgres:0000@localhost:5432/gitlab_kpi1")
    Session = sessionmaker(bind=engine)
    db = Session()
    
    from app.models.gitlab_config import GitLabConfig
    config = db.query(GitLabConfig).filter(GitLabConfig.is_active == True).first()
    client = GitLabClient(config)
    
    project_id = 250833
    print(f"Recherche de 'Drabchuk' parmi les membres du projet {project_id}...")
    
    # Utilisation du paramètre search/query sur l'endpoint des membres
    members = await client._request("GET", f"/projects/{project_id}/members/all", params={"query": "Drabchuk"})
    
    if members:
        for m in members:
            print(f"Match trouvé : {m.get('name')} | Username: {m.get('username')} | ID: {m.get('id')}")
    else:
        print("Aucun 'Drabchuk' trouvé dans ce projet.")
        # Test avec Igor
        members_igor = await client._request("GET", f"/projects/{project_id}/members/all", params={"query": "Igor"})
        print(f"\nTrouvé {len(members_igor)} 'Igor' dans le projet.")
        # On va lister les 5 premiers pour voir s'il y a un Drabchuk
        for m in members_igor[:5]:
             print(f" - {m.get('name')} ({m.get('username')})")

    db.close()

if __name__ == "__main__":
    asyncio.run(flash_search_igor())
