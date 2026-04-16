import asyncio
import httpx
from app.database.session import SessionLocal
from app.models.gitlab_config import GitLabConfig
from app.core.security import decrypt_token

async def quick_diag():
    db = SessionLocal()
    config = db.query(GitLabConfig).first()
    token = decrypt_token(config.token) if config.token else ""
    base_url = config.domain.rstrip("/") + "/api/v4"
    headers = {"PRIVATE-TOKEN": token}
    project_id = 250833
    
    async with httpx.AsyncClient(timeout=30.0) as client:
        # 1. On prend les 20 derniers commits globaux (sans filtrer par author)
        print(f"--- 20 derniers commits de gitlab-runner ---")
        r = await client.get(f"{base_url}/projects/{project_id}/repository/commits", 
                             headers=headers, params={"per_page": 20})
        commits = r.json()
        for c in commits:
            print(f"- {c.get('authored_date')} | {c.get('author_name')} <{c.get('author_email')}> @{c.get('author_username') or '?'}")

        # 2. On vérifie spécifiquement ayufan en Avril 2026
        print(f"\n--- Recherche directe de ayufan en Avril 2026 ---")
        params = {
            "author": "ayufan",
            "since": "2026-04-01T00:00:00Z",
            "until": "2026-04-30T23:59:59Z",
            "per_page": 10
        }
        r2 = await client.get(f"{base_url}/projects/{project_id}/repository/commits", 
                              headers=headers, params=params)
        k_commits = r2.json()
        print(f"Trouvés : {len(k_commits)} commits.")
        for ck in k_commits:
             print(f"  + {ck.get('id')[:8]} | {ck.get('title')}")

asyncio.run(quick_diag())
