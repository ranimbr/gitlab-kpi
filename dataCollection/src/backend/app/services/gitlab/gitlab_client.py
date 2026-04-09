"""
services/gitlab/gitlab_client.py

[FIX] __init__ : config.encrypted_token → config.token
      (le champ dans GitLabConfig s'appelle 'token', pas 'encrypted_token')
"""
import asyncio
import logging
from typing import Any, Dict, List, Optional, Set

import httpx

from app.models.gitlab_config import GitLabConfig

logger = logging.getLogger(__name__)

MAX_BRANCHES = 50


class GitLabAPIError(Exception):
    pass


class GitLabClient:

    def __init__(self, config: GitLabConfig):
        self.base_url = config.domain.rstrip("/") + "/api/v4"
        # ✅ FIX : config.token (et non config.encrypted_token qui n'existe pas)
        token        = self._decrypt_token(config.token)
        self.headers = {"PRIVATE-TOKEN": token}
        self.timeout = 60.0

    # ──────────────────────────────────────────────────────────────────────────
    # HELPERS PRIVÉS
    # ──────────────────────────────────────────────────────────────────────────

    @staticmethod
    def _decrypt_token(token: str) -> str:
        """
        Tente de déchiffrer le token (AES via security.py).
        Si decrypt_token n'est pas disponible ou échoue → utilise le token brut.
        Cela permet de faire tourner l'appli même si le chiffrement n'est pas
        encore configuré (dev local).
        """
        try:
            from app.core.security import decrypt_token
            return decrypt_token(token)
        except Exception:
            logger.warning("decrypt_token unavailable — using raw token")
            return token

    async def _request(
        self,
        method:   str,
        endpoint: str,
        params:   Optional[Dict[str, Any]] = None,
        _retry:   int = 0,
    ) -> Any:
        """Requête HTTP avec retry automatique sur 5xx (max 3 tentatives)."""
        url = f"{self.base_url}{endpoint}"
        try:
            async with httpx.AsyncClient(timeout=self.timeout) as client:
                response = await client.request(
                    method=method, url=url,
                    headers=self.headers, params=params,
                )
        except (httpx.TimeoutException, httpx.ConnectError) as e:
            if _retry < 3:
                wait = 2 ** _retry
                logger.warning(f"Network error on {url}, retry {_retry + 1}/3 in {wait}s: {e}")
                await asyncio.sleep(wait)
                return await self._request(method, endpoint, params, _retry + 1)
            raise GitLabAPIError(f"Network error after 3 retries on {url}: {e}") from e

        if response.status_code == 404:
            return None

        if response.status_code >= 500:
            if _retry < 3:
                wait = 2 ** _retry
                logger.warning(f"HTTP {response.status_code} on {url}, retry {_retry + 1}/3 in {wait}s")
                await asyncio.sleep(wait)
                return await self._request(method, endpoint, params, _retry + 1)
            raise GitLabAPIError(
                f"GitLab API error {response.status_code} on {url} after 3 retries"
            )

        if response.status_code >= 400:
            raise GitLabAPIError(
                f"GitLab API error {response.status_code} on {url}: {response.text[:200]}"
            )

        return response.json()

    async def _get_paginated(
        self,
        endpoint:  str,
        params:    Optional[Dict[str, Any]] = None,
        max_pages: Optional[int] = None,
    ) -> List[Dict[str, Any]]:
        """Pagination automatique — charge toutes les pages."""
        page     = 1
        per_page = 100
        results: List[Dict[str, Any]] = []

        while True:
            current_params = (params or {}).copy()
            current_params.update({"page": page, "per_page": per_page})

            data = await self._request("GET", endpoint, current_params)
            if not data:
                break

            results.extend(data)

            if len(data) < per_page:
                break
            if max_pages and page >= max_pages:
                logger.warning(f"Reached max_pages={max_pages} on {endpoint} — truncating")
                break

            page += 1

        return results

    # ──────────────────────────────────────────────────────────────────────────
    # PROJETS
    # ──────────────────────────────────────────────────────────────────────────

    async def get_project(self, project_id: int) -> Optional[Dict[str, Any]]:
        return await self._request("GET", f"/projects/{project_id}")

    # ──────────────────────────────────────────────────────────────────────────
    # BRANCHES
    # ──────────────────────────────────────────────────────────────────────────

    async def get_project_branches(self, project_id: int) -> List[Dict[str, Any]]:
        """[FIX-BRANCHES] Toutes les branches actives, triées par date desc."""
        branches = await self._get_paginated(
            f"/projects/{project_id}/repository/branches",
            params={"sort": "updated_desc"},
            max_pages=1,
        )
        if len(branches) > MAX_BRANCHES:
            logger.info(
                f"Project {project_id} has {len(branches)} branches — "
                f"limiting to {MAX_BRANCHES} most recently updated"
            )
            branches = branches[:MAX_BRANCHES]

        logger.info(f"Project {project_id} — {len(branches)} branches to extract")
        return branches

    # ──────────────────────────────────────────────────────────────────────────
    # COMMITS — TOUTES BRANCHES
    # ──────────────────────────────────────────────────────────────────────────

    async def get_project_commits(
        self,
        project_id: int,
        since:      Optional[str] = None,
        until:      Optional[str] = None,
        author:     Optional[str] = None,
    ) -> List[Dict[str, Any]]:
        """
        [FIX-PERF] Commits de TOUTES les branches, requêtés nativement.
        Passage d'une boucle N-requêtes par branche à 1 requête unique avec 'all=True'.
        """
        params: Dict[str, Any] = {"with_stats": True, "all": True}
        
        if author:
            params["author"] = author
        if since:
            params["since"] = since
        if until:
            params["until"] = until
            
        logger.info(f"Project {project_id} — Fetching commits with params: {params}")
        
        try:
            commits = await self._get_paginated(
                f"/projects/{project_id}/repository/commits", params=params
            )
            logger.info(f"Project {project_id} — Extracted {len(commits)} commits natively.")
            return commits
        except GitLabAPIError as e:
            logger.error(f"Error fetching commits for project={project_id}: {e}")
            return []

    # ──────────────────────────────────────────────────────────────────────────
    # MERGE REQUESTS
    # ──────────────────────────────────────────────────────────────────────────

    async def get_project_merge_requests(
        self, 
        project_id:       int, 
        author_username:   Optional[str] = None,
        reviewer_username: Optional[str] = None,
        assignee_username: Optional[str] = None,
        created_after:     Optional[str] = None,
        created_before:    Optional[str] = None,
        updated_after:     Optional[str] = None,
        updated_before:    Optional[str] = None,
    ) -> List[Dict[str, Any]]:
        # ... logic ...
        params: Dict[str, Any] = {"state": "all", "per_page": 100}
        if author_username:
            params["author_username"] = author_username
        if reviewer_username:
            params["reviewer_username"] = reviewer_username
        if assignee_username:
            params["assignee_username"] = assignee_username
        if created_after:
            params["created_after"] = created_after
        if created_before:
            params["created_before"] = created_before
        if updated_after:
            params["updated_after"] = updated_after
        if updated_before:
            params["updated_before"] = updated_before

        return await self._get_paginated(
            f"/projects/{project_id}/merge_requests",
            params=params,
        )

    async def get_merge_request_detail(
        self, project_id: int, mr_iid: int
    ) -> Optional[Dict[str, Any]]:
        """Fetch full details of a single MR (includes commits_count, user_notes_count)."""
        return await self._request(
            "GET",
            f"/projects/{project_id}/merge_requests/{mr_iid}"
        )

    async def get_merge_request_commits(
        self, project_id: int, mr_iid: int
    ) -> List[Dict[str, Any]]:
        """Fetch the list of commits for an MR (to get accurate count)."""
        return await self._get_paginated(
            f"/projects/{project_id}/merge_requests/{mr_iid}/commits",
            params={"per_page": 100}
        )

    async def get_merge_request_notes(
        self, project_id: int, mr_iid: int
    ) -> List[Dict[str, Any]]:
        """Fetch all notes (comments) for an MR."""
        return await self._get_paginated(
            f"/projects/{project_id}/merge_requests/{mr_iid}/notes",
            params={"per_page": 100}
        )

    async def get_merge_request_approvals(
        self, project_id: int, mr_iid: int
    ) -> Optional[Dict[str, Any]]:
        try:
            return await self._request(
                "GET",
                f"/projects/{project_id}/merge_requests/{mr_iid}/approvals",
            )
        except GitLabAPIError as e:
            logger.warning(f"Approvals unavailable MR={mr_iid}: {e}")
            return None

    async def get_merge_request_approval_state(
        self, project_id: int, mr_iid: int
    ) -> Optional[Dict[str, Any]]:
        try:
            return await self._request(
                "GET",
                f"/projects/{project_id}/merge_requests/{mr_iid}/approval_state",
            )
        except GitLabAPIError as e:
            logger.warning(f"approval_state unavailable MR={mr_iid}: {e}")
            return None

    async def get_merge_request_notes(
        self, project_id: int, mr_iid: int
    ) -> List[Dict[str, Any]]:
        return await self._get_paginated(
            f"/projects/{project_id}/merge_requests/{mr_iid}/notes",
            params={"sort": "asc", "per_page": 100}
        )

    # ──────────────────────────────────────────────────────────────────────────
    # MEMBRES & USERS — [FIX-DEDUP]
    # ──────────────────────────────────────────────────────────────────────────

    async def get_project_members(self, project_id: int) -> List[Dict[str, Any]]:
        return await self._get_paginated(f"/projects/{project_id}/members/all")

    async def get_user(self, user_id: int) -> Optional[Dict[str, Any]]:
        return await self._request("GET", f"/users/{user_id}")

    async def get_user_by_username(self, username: str) -> Optional[Dict[str, Any]]:
        """Cherche un utilisateur par son username (login)."""
        users = await self._request("GET", "/users", params={"username": username})
        if users and isinstance(users, list) and len(users) > 0:
            return users[0]
        return None

    async def get_project_members_with_emails(
        self, project_id: int
    ) -> Dict[int, Dict[str, Any]]:
        """
        [FIX-DEDUP] Pré-charge tous les membres avec leurs emails officiels.
        Retourne { gitlab_user_id: user_data } pour résolution O(1).
        """
        members     = await self.get_project_members(project_id)
        members_map: Dict[int, Dict[str, Any]] = {}

        batch_size = 10
        for i in range(0, len(members), batch_size):
            batch   = members[i:i + batch_size]
            tasks   = [self.get_user(m["id"]) for m in batch if m.get("id")]
            results = await asyncio.gather(*tasks, return_exceptions=True)

            for member, user_data in zip(batch, results):
                if isinstance(user_data, dict) and user_data.get("id"):
                    members_map[user_data["id"]] = user_data
                else:
                    members_map[member["id"]] = member

        logger.info(
            f"Project {project_id} — pre-loaded {len(members_map)} members with emails"
        )
        return members_map
