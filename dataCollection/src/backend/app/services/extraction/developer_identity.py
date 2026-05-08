"""Developer identity normalization and matching helpers for extraction."""

import hashlib
import logging
from typing import Dict, Optional

from sqlalchemy.orm import Session

from app.models.developer import Developer
from app.repositories.developer_project_repository import DeveloperProjectRepository
from app.repositories.developer_repository import DeveloperRepository
from app.services.gitlab.gitlab_mapper import GitLabMapper

BOT_PATTERNS = [
    "bot",
    "merge",
    "ci",
    "auto",
    "robot",
    "pipeline",
    "automation",
    "deploy",
    "dependabot",
    "renovate",
    "github-actions",
    "gitlab-ci",
]


def normalize_email(email: Optional[str]) -> Optional[str]:
    if not email:
        return None
    return email.lower().strip()


def normalize_name(name: Optional[str]) -> Optional[str]:
    if not name:
        return None
    return " ".join(name.lower().strip().split())


def normalize_username(username: Optional[str]) -> Optional[str]:
    if not username:
        return None
    return username.lower().strip()


def is_bot(username: Optional[str], name: Optional[str]) -> bool:
    candidates = [(username or "").lower(), (name or "").lower()]
    return any(pattern in candidate for candidate in candidates for pattern in BOT_PATTERNS)


def synthetic_gitlab_id(email: Optional[str], name: Optional[str]) -> int:
    norm_email = normalize_email(email) or ""
    norm_name = normalize_name(name) or ""
    key = f"external:{norm_email}:{norm_name}"
    digest = hashlib.sha256(key.encode()).hexdigest()[:12]
    return -abs(int(digest, 16)) % (2**31)


def matches_target_devs(
    gitlab_id: Optional[int],
    name: Optional[str],
    email: Optional[str],
    target_devs_map: Dict[int, Developer],
) -> bool:
    if not target_devs_map:
        return True

    norm_name = normalize_name(name)
    norm_email = normalize_email(email)

    for dev in target_devs_map.values():
        if gitlab_id and dev.gitlab_user_id == gitlab_id:
            return True
        if norm_email and normalize_email(dev.email) == norm_email:
            return True
        if norm_name and normalize_name(dev.name) == norm_name:
            return True
        if dev.gitlab_username and norm_name == normalize_username(dev.gitlab_username):
            return True

    return False


def resolve_developer(
    *,
    db: Session,
    project_id: int,
    period_id: int,  # ✅ New mandatory param for temporal scoping
    developer_repo: DeveloperRepository,
    dev_project_repo: DeveloperProjectRepository,
    logger: logging.Logger,
    email: Optional[str] = None,
    name: Optional[str] = None,
    gitlab_id: Optional[int] = None,
    username: Optional[str] = None,
    forbid_creation: bool = False,
) -> Optional[Developer]:
    norm_email = normalize_email(email)
    norm_name = normalize_name(name)
    norm_username = normalize_username(username)

    if gitlab_id is not None and gitlab_id > 0:
        dev = developer_repo.get_by_gitlab_user_id(db, gitlab_id)
        if dev:
            # ✅ FIX SENIOR : On n'ajoute plus auto le projet. 
            # La mission DOIT venir du CSV (Strict Mission).
            # dev_project_repo.add(db, dev.id, project_id, period_id)
            if norm_email and not dev.email:
                developer_repo.update(db, dev, {"email": norm_email})
            return dev

    if norm_email:
        dev = developer_repo.get_by_email(db, norm_email)
        if dev:
            # dev_project_repo.add(db, dev.id, project_id, period_id) # ✅ DISABLED AUTO-MISSION
            if gitlab_id and gitlab_id > 0 and not dev.gitlab_user_id:
                developer_repo.update(db, dev, {"gitlab_user_id": gitlab_id})
            return dev

    if norm_username:
        dev = developer_repo.get_by_gitlab_username(db, norm_username)
        if dev:
            # dev_project_repo.add(db, dev.id, project_id, period_id) # ✅ DISABLED AUTO-MISSION
            updates = {}
            if norm_email and not dev.email:
                updates["email"] = norm_email
            if gitlab_id and gitlab_id > 0 and not dev.gitlab_user_id:
                updates["gitlab_user_id"] = gitlab_id
            if updates:
                developer_repo.update(db, dev, updates)
            return dev

    if norm_name:
        dev = developer_repo.get_by_username(db, norm_name)
        if dev is None:
            dev = developer_repo.get_by_username(db, name or "")
        if dev:
            # dev_project_repo.add(db, dev.id, project_id, period_id) # ✅ DISABLED AUTO-MISSION
            updates = {}
            if norm_email and not dev.email:
                updates["email"] = norm_email
            if gitlab_id and gitlab_id > 0 and not dev.gitlab_user_id:
                updates["gitlab_id"] = gitlab_id
            if norm_username and not dev.gitlab_username:
                updates["gitlab_username"] = norm_username
            if updates:
                developer_repo.update(db, dev, updates)
            return dev

    if gitlab_id is None or gitlab_id <= 0:
        generated_id = synthetic_gitlab_id(norm_email, norm_name)
        existing = developer_repo.get_by_gitlab_user_id(db, generated_id)
        if existing:
            # dev_project_repo.add(db, existing.id, project_id, period_id) # ✅ DISABLED AUTO-MISSION
            return existing
        gitlab_id = generated_id
        logger.warning(
            f"External contributor — name='{name}' email='{email}' "
            f"-> synthetic_id={generated_id}"
        )

    if forbid_creation:
        logger.debug(f"Skipping creation for unknown developer (strict mode) — email={email}")
        return None

    detected_bot = is_bot(norm_username, norm_name)
    if detected_bot:
        logger.info(f"Bot detected — username='{username}' name='{name}'")

    mapped = GitLabMapper.map_developer(
        data={
            "id": gitlab_id,
            "username": norm_username or norm_name or f"external_{abs(gitlab_id)}",
            "name": norm_name or name,
            "email": norm_email,
        },
    )
    mapped["is_validated"] = False
    mapped["is_bot"] = detected_bot
    mapped["source"] = "gitlab_extraction"
    mapped["auto_created"] = True
    if norm_username:
        mapped["gitlab_username"] = norm_username

    developer = developer_repo.create(db, mapped)
    db.flush()
    dev_project_repo.add(db, developer.id, project_id, period_id)
    db.flush()

    logger.info(
        f"Developer created — name='{developer.name}' "
        f"username='{developer.gitlab_username}' is_bot={developer.is_bot} project_id={project_id}"
    )
    return developer
