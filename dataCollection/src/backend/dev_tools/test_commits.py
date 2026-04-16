import asyncio
from app.models.gitlab_config import GitLabConfig
from app.services.gitlab.gitlab_client import GitLabClient

async def test():
    cfg = GitLabConfig(gitlab_url='https://gitlab.com', gitlab_access_token='glpat-vF6Xy_kLsxzyD7kYhK_b')
    client = GitLabClient(cfg)
    commits = await client.get_project_commits(250833, since='2026-03-01T00:00:00Z', until='2026-03-31T23:59:59Z', author='Tomasz Maczukin')
    print(f'Found {len(commits)} commits for Tomasz in March.')

asyncio.run(test())
