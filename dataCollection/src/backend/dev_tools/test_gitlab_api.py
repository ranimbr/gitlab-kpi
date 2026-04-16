import httpx
import asyncio
import os
from dotenv import load_dotenv

# Charger les variables d'environnement
load_dotenv('c:/Users/ranim/Downloads/gitlab-kpi-dashboard-versionaprescorrection - Copie/dataCollection/src/backend/.env')

GITLAB_TOKEN = os.getenv('GITLAB_TOKEN')
BASE_URL = "https://gitlab.com/api/v4"
PROJECT_ID = 250833 # gitlab-runner

async def test_gitlab_api():
    headers = {"PRIVATE-TOKEN": GITLAB_TOKEN}
    
    # Test pour Mars 2026
    params = {
        "all": "true",
        "since": "2026-03-01T00:00:00Z",
        "until": "2026-03-31T23:59:59Z",
        "per_page": 100
    }
    
    url = f"{BASE_URL}/projects/{PROJECT_ID}/repository/commits"
    
    print(f"Testing URL: {url}")
    print(f"Params: {params}")
    
    async with httpx.AsyncClient() as client:
        try:
            response = await client.get(url, headers=headers, params=params)
            print(f"Status Code: {response.status_code}")
            
            if response.status_code == 200:
                commits = response.json()
                print(f"Total commits found for March 2026: {len(commits)}")
                if commits:
                    print("Sample commit authors:")
                    for c in commits[:5]:
                        print(f" - {c['author_name']} ({c['author_email']}) le {c['authored_date']}")
            else:
                print(f"Error Response: {response.text}")
                
        except Exception as e:
            print(f"An error occurred: {e}")

if __name__ == "__main__":
    asyncio.run(test_gitlab_api())
