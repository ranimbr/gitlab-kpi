
import asyncio
from app.services.gitlab.gitlab_client import GitLabClient
from app.core.security import decrypt_token
from app.models.gitlab_config import GitLabConfig
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker

# DB Connection
DATABASE_URL = "postgresql://postgres:0000@localhost:5432/gitlab_kpi1"
engine = create_engine(DATABASE_URL)
Session = sessionmaker(bind=engine)

async def check_gabriel():
    db = Session()
    try:
        config = db.query(GitLabConfig).filter(GitLabConfig.is_active == True).first()
        if not config:
            print("No active config found")
            return
            
        client = GitLabClient(config)
        
        # Test 1: Search Gabriel user
        print(f"Searching for 'Gabriel Mazetto'...")
        users = await client.search_users("Gabriel Mazetto")
        for u in users:
            print(f"Found User: {u.get('name')} | Username: {u.get('username')} | ID: {u.get('id')}")
            
        # Test 2: Fetch MRs for gmazzetto on project 250833 (gitlab-runner)
        project_id = 250833
        print(f"\nFetching MRs for 'gmazzetto' on project {project_id}...")
        
        # Try different filters
        for role in ["author_username", "reviewer_username", "assignee_username"]:
            params = {role: "gmazzetto", "updated_after": "2026-03-01T00:00:00Z"}
            mrs = await client.get_project_merge_requests(project_id, **params)
            print(f"Role {role}: Found {len(mrs)} MRs")
            for m in mrs[:2]:
                print(f"  MR !{m.get('iid')}: {m.get('title')} (Author: {m.get('author',{}).get('username')})")

        await client.close()
    finally:
        db.close()

if __name__ == "__main__":
    asyncio.run(check_gabriel())
