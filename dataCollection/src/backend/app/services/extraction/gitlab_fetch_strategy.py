import logging
from typing import List, Optional, Set
from datetime import datetime
from app.services.gitlab.gitlab_client import GitLabClient

logger = logging.getLogger(__name__)

async def discover_target_branches(
    client:            GitLabClient,
    gitlab_project_id: int,
    since:             Optional[str] = None,
    until:             Optional[str] = None,
    logger:            Optional[logging.Logger] = None,
) -> Set[str]:
    """
    [DEPRECATED] Used to find relevant branches based on recent events.
    Now we prefer using all=True in fetch_unique_commits.
    """
    target_branches = set()
    try:
        events = await client.get_project_events(
            project_id=gitlab_project_id,
            action="pushed",
            after=since,
            before=until,
        )
        for e in events:
            if e.get("push_data") and e["push_data"].get("ref"):
                target_branches.add(e["push_data"]["ref"])
    except Exception as ex:
        if logger: logger.warning(f"Failed to discover branches from events: {ex}")

    if not target_branches:
        target_branches = {"main", "master"}
    return target_branches

async def fetch_unique_commits(
    client:            GitLabClient,
    gitlab_project_id: int,
    since:             Optional[str],
    until:             Optional[str],
) -> List[dict]:
    """
    [SENIOR] Récupère TOUS les commits du projet sur la période.
    On ne filtre pas par auteur au niveau API GitLab car c'est instable
    (pseudo vs email). On filtre en local pour une précision 100%.
    """
    logger.info(f"[DIAGNOSTIC API] Fetching ALL commits for project={gitlab_project_id} | {since} -> {until}")
    
    commits = await client.get_project_commits(
        project_id=gitlab_project_id,
        ref_name=None,          # triggers all=True
        since=since,
        until=until,
        with_stats=False,
    )
    
    logger.info(f"[DIAGNOSTIC API] Found {len(commits)} raw commits to analyze")
    return commits
