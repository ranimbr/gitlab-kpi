import asyncio
from sqlalchemy import create_engine
from app.services.gitlab.gitlab_client import GitLabClient
from sqlalchemy.orm import sessionmaker

async def search_igor():
    engine = create_engine("postgresql://postgres:0000@localhost:5432/gitlab_kpi1")
    Session = sessionmaker(bind=engine)
    db = Session()
    
    from app.models.gitlab_config import GitLabConfig
    config = db.query(GitLabConfig).filter(GitLabConfig.is_active == True).first()
    client = GitLabClient(config)
    
    # Recherche par nom exact via l'endpoint générique
    print("Recherche de 'Igor Drabchuk' sur GitLab...")
    try:
        users = await client._request("GET", "/users", params={"search": "Igor Drabchuk"})
        if users:
            for u in users:
                print(f"Trouvé : {u.get('name')} | Username: {u.get('username')} | ID: {u.get('id')}")
        else:
            print("Aucun utilisateur trouvé pour 'Igor Drabchuk'.")
    except Exception as e:
        print(f"Erreur lors de la recherche : {e}")

    db.close()

if __name__ == "__main__":
    asyncio.run(search_igor())
