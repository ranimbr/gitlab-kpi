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
    target_authors:    Optional[list] = None,
) -> List[dict]:
    """
    [FIX] Récupère les commits du projet sur la période.
    
    IMPORTANT: Le paramètre 'author' de l'API GitLab ne capture que les commits
    où l'auteur direct est spécifié. Les commits individuels créés par un développeur
    mais mergés par d'autres ne sont pas inclus.
    
    Nouvelle stratégie:
    - TOUJOURS utiliser all=True avec pagination complète
    - Le filtrage local se fait dans extraction_service.py via _matches_target_devs
      pour une précision 100% (matching par ID, email, et username)
    
    Le paramètre target_authors est ignoré ici car le filtrage se fait localement.
    """
    logger.info(f"[DIAGNOSTIC API] Fetching ALL commits for project={gitlab_project_id} | {since} -> {until}")
    logger.info(f"[DIAGNOSTIC API] Local filtering will be applied via _matches_target_devs")
    
    # Toujours utiliser all=True pour capturer tous les commits (incluant ceux mergés)
    commits = await client.get_project_commits(
        project_id=gitlab_project_id,
        ref_name=None,
        since=since,
        until=until,
        with_stats=True,
    )
    logger.info(f"[DIAGNOSTIC API] Found {len(commits)} raw commits to analyze locally")
    return commits
