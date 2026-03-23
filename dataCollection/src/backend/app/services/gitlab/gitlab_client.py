"""
services/gitlab/gitlab_client.py — inchangé fonctionnellement.
"""
import httpx
import logging
from typing import Any, Dict, List, Optional
from app.models.gitlab_config import GitLabConfig

logger = logging.getLogger(__name__)

class GitLabAPIError(Exception):
    pass

class GitLabClient:
    def __init__(self, config: GitLabConfig):
        self.base_url = config.domain.rstrip("/") + "/api/v4"
        token = self._decrypt_token(config.token)
        self.headers = {"PRIVATE-TOKEN": token}
        self.timeout = 30.0

    @staticmethod
    def _decrypt_token(token: str) -> str:
        try:
            from app.core.security import decrypt_token
            return decrypt_token(token)
        except Exception:
            logger.warning("decrypt_token unavailable — using raw token")
            return token

    async def _request(self, method: str, endpoint: str, params: Optional[Dict[str, Any]] = None) -> Any:
        url = f"{self.base_url}{endpoint}"
        async with httpx.AsyncClient(timeout=self.timeout) as client:
            response = await client.request(method=method, url=url, headers=self.headers, params=params)
        if response.status_code == 404:
            return None
        if response.status_code >= 400:
            raise GitLabAPIError(f"GitLab API error {response.status_code} on {url}: {response.text[:200]}")
        return response.json()

    async def _get_paginated(self, endpoint: str, params: Optional[Dict[str, Any]] = None) -> List[Dict[str, Any]]:
        page = 1; per_page = 100; results: List[Dict[str, Any]] = []
        while True:
            current_params = params.copy() if params else {}
            current_params.update({"page": page, "per_page": per_page})
            data = await self._request("GET", endpoint, current_params)
            if not data:
                break
            results.extend(data)
            if len(data) < per_page:
                break
            page += 1
        return results

    async def get_project(self, project_id: int) -> Optional[Dict[str, Any]]:
        return await self._request("GET", f"/projects/{project_id}")

    async def get_project_commits(self, project_id: int, since: Optional[str] = None, until: Optional[str] = None) -> List[Dict[str, Any]]:
        params: Dict[str, Any] = {"with_stats": True}
        if since: params["since"] = since
        if until: params["until"] = until
        return await self._get_paginated(f"/projects/{project_id}/repository/commits", params=params)

    async def get_project_merge_requests(self, project_id: int) -> List[Dict[str, Any]]:
        return await self._get_paginated(f"/projects/{project_id}/merge_requests", params={"state": "all", "with_labels_details": False})

    async def get_project_members(self, project_id: int) -> List[Dict[str, Any]]:
        return await self._get_paginated(f"/projects/{project_id}/members/all")

    async def get_merge_request_approvals(self, project_id: int, mr_iid: int) -> Optional[Dict[str, Any]]:
        try:
            return await self._request("GET", f"/projects/{project_id}/merge_requests/{mr_iid}/approvals")
        except GitLabAPIError as e:
            logger.warning(f"Approvals unavailable MR={mr_iid}: {e}")
            return None

    async def get_merge_request_approval_state(self, project_id: int, mr_iid: int) -> Optional[Dict[str, Any]]:
        try:
            return await self._request("GET", f"/projects/{project_id}/merge_requests/{mr_iid}/approval_state")
        except GitLabAPIError as e:
            logger.warning(f"approval_state unavailable MR={mr_iid}: {e}")
            return None