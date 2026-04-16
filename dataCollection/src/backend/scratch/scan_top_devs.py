
import asyncio
import aiohttp
from datetime import datetime

GITLAB_TOKEN = "glpat-VBy_mP_ss82Yyxsx959-"
PROJECT_ID = 250833  # gitlab-runner

async def scan_expert(session, username, name):
    url = f"https://gitlab.com/api/v4/projects/{PROJECT_ID}/merge_requests"
    params = {
        "author_username": username,
        "updated_after": "2026-03-01T00:00:00Z",
        "updated_before": "2026-03-31T23:59:59Z",
        "state": "merged",
        "per_page": 100
    }
    headers = {"PRIVATE-TOKEN": GITLAB_TOKEN}
    
    async with session.get(url, params=params, headers=headers) as resp:
        mrs = await resp.json()
        mr_count = len(mrs) if isinstance(mrs, list) else 0
        
    # Commits (approximatif via search car l'API commit author est limitée)
    commit_url = f"https://gitlab.com/api/v4/projects/{PROJECT_ID}/repository/commits"
    c_params = {"since": "2026-03-01T00:00:00Z", "until": "2026-03-31T23:59:59Z", "per_page": 100}
    async with session.get(commit_url, params=c_params, headers=headers) as resp:
        commits = await resp.json()
        # On filtre par nom grossièrement
        my_commits = [c for c in commits if name.lower() in c.get("author_name", "").lower()]
        commit_count = len(my_commits)

    print(f"RESULTAT - {name} ({username}) : {mr_count} MRs Merged, ~{commit_count} Commits")

async def main():
    async with aiohttp.ClientSession() as session:
        # On teste Axel, Kamil et Tomasz
        tasks = [
            scan_expert(session, "ayufan", "Axel von Bertoldi"),
            scan_expert(session, "kamil", "Kamil Trzciński"),
            scan_expert(session, "tmaczukin", "Tomasz Maczukin")
        ]
        await asyncio.gather(*tasks)

if __name__ == "__main__":
    asyncio.run(main())
