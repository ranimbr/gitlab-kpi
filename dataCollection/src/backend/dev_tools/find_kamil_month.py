import asyncio
import httpx
from app.database.session import SessionLocal
from app.models.gitlab_config import GitLabConfig
from app.core.security import decrypt_token

async def find_activity():
    db = SessionLocal()
    config = db.query(GitLabConfig).first()
    token = decrypt_token(config.token)
    base_url = config.domain.rstrip("/") + "/api/v4"
    headers = {"PRIVATE-TOKEN": token}
    project_id = 250833
    
    async with httpx.AsyncClient(timeout=30.0) as client:
        print(f"Recherche du dernier commit de Kamil (ayufan)...")
        r = await client.get(f"{base_url}/projects/{project_id}/repository/commits", 
                             headers=headers, params={"author": "ayufan", "per_page": 1})
        commits = r.json()
        if commits:
            last_date = commits[0].get('authored_date')
            print(f"✅ Trouvé ! Dernier commit le : {last_date}")
            print(f"👉 Suggérez à l'utilisateur d'extraire le mois : {last_date[:7].replace('-', '/')}")
        else:
            print("❌ Aucune activité trouvée pour 'ayufan' sur ce projet.")

asyncio.run(find_activity())
