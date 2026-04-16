import sys
from pathlib import Path

file_path = Path(r'c:\Users\ranim\Downloads\gitlab-kpi-dashboard-versionaprescorrection - Copie\dataCollection\src\backend\app\services\gitlab\gitlab_client.py')
content = file_path.read_text(encoding='utf-8')

# 1. Update _request signature
if 'fast_fail: bool = False' not in content:
    content = content.replace(
        'Optional[Dict[str, Any]] = None,\n        _retry:   int = 0,\n    ) -> Any:',
        'Optional[Dict[str, Any]] = None,\n        _retry:   int = 0,\n        fast_fail: bool = False,\n    ) -> Any:'
    )

# 2. Update _request 429 logic
# Find the 429 block and replace it
old_429_block = """        if response.status_code == 429:
            retry_after = int(response.headers.get("Retry-After", 60))
            logger.warning(
                f"GitLab rate limit (429) on {url}. "
                f"Waiting {retry_after}s before retry {_retry + 1}/3..."
            )
            await asyncio.sleep(retry_after)
            if _retry < 3:
                return await self._request(method, endpoint, params, _retry + 1)
            raise GitLabAPIError(f"Rate limit persistent after 3 retries on {url}")"""

new_429_block = """        if response.status_code == 429:
            if fast_fail:
                logger.warning(f"Fast Fail triggered for {url} (Rate Limit 429). Skipping wait.")
                raise GitLabAPIError("Rate limit hit (fast fail)", status_code=429)

            retry_after = int(response.headers.get("Retry-After", 60))
            logger.warning(
                f"GitLab rate limit (429) on {url}. "
                f"Waiting {retry_after}s before retry {_retry + 1}/3..."
            )
            await asyncio.sleep(retry_after)
            if _retry < 3:
                return await self._request(method, endpoint, params, _retry + 1, fast_fail=fast_fail)
            raise GitLabAPIError(f"Rate limit persistent after 3 retries on {url}")"""

if old_429_block in content:
    content = content.replace(old_429_block, new_429_block)

# 3. Update internal _request calls for retries (Timeout and 500 errors)
content = content.replace(
    'return await self._request(method, endpoint, params, _retry + 1)',
    'return await self._request(method, endpoint, params, _retry + 1, fast_fail=fast_fail)'
)

# 4. Update get_user signature and call
old_get_user = 'async def get_user(self, user_id: int) -> Optional[Dict[str, Any]]:\n        return await self._request("GET", f"/users/{user_id}")'
new_get_user = 'async def get_user(self, user_id: int, fast_fail: bool = False) -> Optional[Dict[str, Any]]:\n        return await self._request("GET", f"/users/{user_id}", fast_fail=fast_fail)'
if old_get_user in content:
    content = content.replace(old_get_user, new_get_user)

# 5. Update get_project_members_with_emails to use fast_fail
old_tasks = 'tasks   = [self.get_user(m["id"]) for m in batch if m.get("id")]'
new_tasks = 'tasks   = [self.get_user(m["id"], fast_fail=True) for m in batch if m.get("id")]'
if old_tasks in content:
    content = content.replace(old_tasks, new_tasks)

file_path.write_text(content, encoding='utf-8')
print("SUCCESS: gitlab_client.py patched for Fast Fail.")
