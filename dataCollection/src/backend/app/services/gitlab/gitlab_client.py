"""GitLab API client used by extraction services."""
import asyncio
import logging
from typing import Any, Dict, List, Optional

import httpx

from app.models.gitlab_config import GitLabConfig

logger = logging.getLogger(__name__)

MAX_BRANCHES = 50


class GitLabAPIError(Exception):
    def __init__(self, message: str, status_code: Optional[int] = None):
        self.message = message
        self.status_code = status_code
        super().__init__(self.message)


class GitLabProjectNotFoundError(GitLabAPIError):
    """Raised when a project is not found (404) or inaccessible."""
    pass


class GitLabClient:
    """Thin async wrapper around GitLab REST API v4."""

    def __init__(self, config: GitLabConfig):
        # Avoid base URLs like .../api/v4/api/v4.
        domain = config.domain.rstrip("/")
        if not domain.endswith("/api/v4"):
            self.base_url = f"{domain}/api/v4"
        else:
            self.base_url = domain
            
        token        = self._decrypt_token(config.token)
        self.headers = {"PRIVATE-TOKEN": token}
        self.timeout = 60.0
        
        # ── [SENIOR] Métriques d'observabilité ──
        self.api_calls_count = 0
        self.retry_count     = 0

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
        fast_fail: bool = False,
    ) -> Any:
        """HTTP request with retries for network, 5xx and 429 responses."""
        url = f"{self.base_url}{endpoint}"
        self.api_calls_count += 1
        
        try:
            async with httpx.AsyncClient(timeout=self.timeout) as client:
                response = await client.request(
                    method=method, url=url,
                    headers=self.headers, params=params,
                )
        except (httpx.TimeoutException, httpx.ConnectError) as e:
            if _retry < 3:
                self.retry_count += 1
                wait = 2 ** _retry
                logger.warning(f"Network error on {url}, retry {_retry + 1}/3 in {wait}s: {e}")
                await asyncio.sleep(wait)
                return await self._request(method, endpoint, params, _retry + 1, fast_fail=fast_fail)
            raise GitLabAPIError(f"Network error after 3 retries on {url}: {e}") from e

        if response.status_code == 404:
            if "/projects/" in endpoint:
                raise GitLabProjectNotFoundError(f"Project or Resource not found on GitLab: {endpoint}", status_code=404)
            return None

        # Respect GitLab rate-limiting when Retry-After is provided.
        if response.status_code == 429:
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
                self.retry_count += 1
                return await self._request(method, endpoint, params, _retry + 1, fast_fail=fast_fail)
            raise GitLabAPIError(f"Rate limit persistent after 3 retries on {url}")

        if response.status_code >= 500:
            if _retry < 3:
                self.retry_count += 1
                wait = 2 ** _retry
                logger.warning(f"HTTP {response.status_code} on {url}, retry {_retry + 1}/3 in {wait}s")
                await asyncio.sleep(wait)
                return await self._request(method, endpoint, params, _retry + 1, fast_fail=fast_fail)
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

    async def get_project_events(
        self,
        project_id: int,
        action:     Optional[str] = None,
        after:      Optional[str] = None,
        before:     Optional[str] = None,
    ) -> List[Dict[str, Any]]:
        """Fetch project events to quickly discover active branches."""
        params: Dict[str, Any] = {}
        if action:
            params["action"] = action
        if after:
            params["after"] = after
        if before:
            params["before"] = before

        return await self._get_paginated(f"/projects/{project_id}/events", params=params, max_pages=2)

    # ──────────────────────────────────────────────────────────────────────────
    # BRANCHES
    # ──────────────────────────────────────────────────────────────────────────

    async def get_project_branches(self, project_id: int) -> List[Dict[str, Any]]:
        """Return active branches sorted by latest update."""
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
        ref_name:   Optional[str] = None,
        since:      Optional[str] = None,
        until:      Optional[str] = None,
        author:     Optional[str] = None,
        with_stats: bool = False,
    ) -> List[Dict[str, Any]]:
        """Fetch commits from one branch or from all branches."""
        params: Dict[str, Any] = {"with_stats": with_stats}
        
        # If no branch is given, ask GitLab for all branch histories.
        if not ref_name:
            params["all"] = True
        else:
            params["ref_name"] = ref_name
        
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
        except GitLabProjectNotFoundError:
            # Propagate up to indicate the source project is missing
            raise
        except GitLabAPIError as e:
            logger.error(f"Error fetching commits for project={project_id}: {e}")
            return []

    async def get_commit_detail(
        self,
        project_id: int,
        sha: str
    ) -> Optional[Dict[str, Any]]:
        """Fetch the details of a single commit, including stats."""
        try:
            return await self._request("GET", f"/projects/{project_id}/repository/commits/{sha}")
        except Exception as e:
            logger.error(f"Error fetching commit {sha} for project={project_id}: {e}")
            return None

    # ──────────────────────────────────────────────────────────────────────────
    # MERGE REQUESTS
    # ──────────────────────────────────────────────────────────────────────────

    async def get_project_merge_requests(
        self, 
        project_id:       int, 
        author_username:   Optional[str] = None,
        reviewer_username: Optional[str] = None,
        assignee_username: Optional[str] = None,
        author_id:         Optional[int] = None,
        reviewer_id:       Optional[int] = None,
        assignee_id:       Optional[int] = None,
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
        if author_id:
            params["author_id"] = author_id
        if reviewer_id:
            params["reviewer_id"] = reviewer_id
        if assignee_id:
            params["assignee_id"] = assignee_id
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

    async def get_merge_request_resource_state_events(
        self, project_id: int, mr_iid: int
    ) -> List[Dict[str, Any]]:
        """
        Fetch resource state events for an MR to get exact approval timestamps.
        This provides the precise approved_at date for review time calculation.
        """
        try:
            return await self._get_paginated(
                f"/projects/{project_id}/merge_requests/{mr_iid}/resource_state_events",
                params={"per_page": 100}
            )
        except GitLabAPIError as e:
            logger.warning(f"resource_state_events unavailable MR={mr_iid}: {e}")
            return []

    async def get_merge_request_notes(
        self, project_id: int, mr_iid: int
    ) -> List[Dict[str, Any]]:
        """Fetch all notes (comments) for an MR, triées par date croissante."""
        return await self._get_paginated(
            f"/projects/{project_id}/merge_requests/{mr_iid}/notes",
            params={"sort": "asc", "per_page": 100}
        )

    # ──────────────────────────────────────────────────────────────────────────
    # HEALTH CHECK
    # ──────────────────────────────────────────────────────────────────────────

    async def ping(self) -> bool:
        """Check that token is valid and API is reachable."""
        try:
            result = await self._request("GET", "/user")
            return bool(result and result.get("id"))
        except Exception as e:
            logger.warning(f"GitLab ping failed: {e}")
            return False

    # ──────────────────────────────────────────────────────────────────────────
    # MEMBRES & USERS
    # ──────────────────────────────────────────────────────────────────────────

    async def get_project_members(self, project_id: int) -> List[Dict[str, Any]]:
        return await self._get_paginated(f"/projects/{project_id}/members/all")

    async def get_user(self, user_id: int, fast_fail: bool = False) -> Optional[Dict[str, Any]]:
        return await self._request("GET", f"/users/{user_id}", fast_fail=fast_fail)

    async def get_user_by_username(self, username: str) -> Optional[Dict[str, Any]]:
        """Cherche un utilisateur par son username (login)."""
        users = await self._request("GET", "/users", params={"username": username})
        if users and isinstance(users, list) and len(users) > 0:
            return users[0]
        return None

    async def get_project_members_with_emails(
        self, 
        project_id: int, 
        target_user_ids: Optional[List[int]] = None
    ) -> Dict[int, Dict[str, Any]]:
        """Preload members and enrich them with user details."""
        # If target_user_ids is provided, avoid loading global member list.
        if target_user_ids:
            logger.info(f"Project {project_id} — Direct fetch for {len(target_user_ids)} target developers (skipping global member list).")
            members_to_fetch = [{"id": uid} for uid in target_user_ids]
        else:
            members_to_fetch = await self.get_project_members(project_id)
        
        members_map: Dict[int, Dict[str, Any]] = {}

        batch_size = 10
        for i in range(0, len(members_to_fetch), batch_size):
            batch   = members_to_fetch[i:i + batch_size]
            tasks   = [self.get_user(m["id"], fast_fail=True) for m in batch if m.get("id")]
            results = await asyncio.gather(*tasks, return_exceptions=True)

            for member, user_data in zip(batch, results):
                if isinstance(user_data, dict) and user_data.get("id"):
                    members_map[user_data["id"]] = user_data
                elif "id" in member:
                    members_map[member["id"]] = member

        logger.info(
            f"Project {project_id} — pre-loaded {len(members_map)} members with emails"
        )
        return members_map
