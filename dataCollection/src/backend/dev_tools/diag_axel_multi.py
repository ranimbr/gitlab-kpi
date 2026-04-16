import asyncio
import httpx
from app.database.session import SessionLocal
from app.models.gitlab_config import GitLabConfig
from app.core.security import decrypt_token

async def axel_deep_diag():
    db = SessionLocal()
    config = db.query(GitLabConfig).first()
    token = decrypt_token(config.token)
    base_url = config.domain.rstrip("/") + "/api/v4"
    headers = {"PRIVATE-TOKEN": token}
    project_id = 250833
    
    async with httpx.AsyncClient(timeout=30.0) as client:
        # TEST 1 : Par Nom Complet
        print("--- Test 1 : Filtre par Nom 'Axel von Bertoldi' ---")
        r1 = await client.get(f"{base_url}/projects/{project_id}/repository/commits", 
                             headers=headers, params={"author": "Axel von Bertoldi", "since": "2026-04-01T00:00:00Z"})
        print(f"Trouvés : {len(r1.json())}")

        # TEST 2 : Par Email
        print("\n--- Test 2 : Filtre par Email 'avonbertoldi@gitlab.com' ---")
        r2 = await client.get(f"{base_url}/projects/{project_id}/repository/commits", 
                             headers=headers, params={"author": "avonbertoldi@gitlab.com", "since": "2026-04-01T00:00:00Z"})
        print(f"Trouvés : {len(r2.json())}")

        # TEST 3 : Par Username
        print("\n--- Test 3 : Filtre par Username 'avonbertoldi' ---")
        r3 = await client.get(f"{base_url}/projects/{project_id}/repository/commits", 
                             headers=headers, params={"author": "avonbertoldi", "since": "2026-04-01T00:00:00Z"})
        print(f"Trouvés : {len(r3.json())}")

asyncio.run(axel_deep_diag())
