import asyncio
import os
import sys

sys.path.append(os.path.dirname(os.path.abspath(__file__)))

from app.database.session import SessionLocal
from app.services.gitlab.gitlab_client import GitLabClient
from app.models.gitlab_config import GitLabConfig

async def probe():
    db = SessionLocal()
    try:
        config = db.query(GitLabConfig).first()
        if not config:
            print("Erreur: Config GitLab introuvable.")
            return

        client = GitLabClient(config)
        print("--- Analyse de votre projet (ID: 79382310) ---")
        
        # On va chercher les derniers commits du projet
        commits = await client.get_project_commits(79382310)
        
        print("\n=== DÉVELOPPEURS DÉTECTÉS DANS LE PROJET ===")
        for key, info in authors.items():
            print(f"Name : {info['name']} | Email : {info['email']}")
            
    except Exception as e:
        print(f"Erreur HTTP ou API : {e}")
    finally:
        db.close()

if __name__ == "__main__":
    asyncio.run(probe())
