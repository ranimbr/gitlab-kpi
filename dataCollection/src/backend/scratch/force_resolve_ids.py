import asyncio
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from app.models.developer import Developer
from app.services.gitlab.gitlab_client import GitLabClient

async def force_resolve():
    engine = create_engine("postgresql://postgres:0000@localhost:5432/gitlab_kpi1")
    Session = sessionmaker(bind=engine)
    db = Session()
    
    from app.models.gitlab_config import GitLabConfig
    config = db.query(GitLabConfig).filter(GitLabConfig.is_active == True).first()
    if not config:
        print("Erreur : Aucune configuration GitLab active trouvée.")
        return

    # Le client prend l'objet config complet
    client = GitLabClient(config)
    developers = db.query(Developer).all()
    
    print(f"Analyse de {len(developers)} développeurs...")
    
    for dev in developers:
        if not dev.gitlab_user_id:
            print(f"Recherche ID pour {dev.gitlab_username}...")
            try:
                user_data = await client.get_user_by_username(dev.gitlab_username)
                if user_data:
                    dev.gitlab_user_id = user_data["id"]
                    print(f" -> Trouvé ! ID={dev.gitlab_user_id}")
                else:
                    print(f" -> Username non trouvé, tentative par nom : {dev.name}")
                    users = await client._request("GET", "/users", params={"search": dev.name})
                    if users and len(users) > 0:
                        dev.gitlab_user_id = users[0]["id"]
                        print(f" -> Trouvé par nom ! ID={dev.gitlab_user_id}")
                    else:
                        print(f" -> ÉCHEC TOTAL pour {dev.name}")
            except Exception as e:
                print(f" -> Erreur API pour {dev.gitlab_username}: {e}")
    
    db.commit()
    print("Synchronisation terminée.")
    db.close()

if __name__ == "__main__":
    asyncio.run(force_resolve())
