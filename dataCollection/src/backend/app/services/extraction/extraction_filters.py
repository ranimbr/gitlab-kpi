"""Shared temporal and author-filter helpers for extraction workflows."""

import calendar
from datetime import datetime, timezone
from typing import Dict, List, Optional, Tuple

from app.models.developer import Developer
from app.models.period import Period
from app.services.extraction.developer_identity import normalize_email, normalize_name, normalize_username


def build_period_window(period: Optional[Period]) -> Tuple[Optional[str], Optional[str], Optional[datetime], Optional[datetime]]:
    """Return API date bounds and strict datetime bounds for a period."""
    if not period:
        return None, None, None, None

    year, month = period.year, period.month
    since = f"{year}-{month:02d}-01T00:00:00Z"
    last_day = calendar.monthrange(year, month)[1]
    until = f"{year}-{month:02d}-{last_day:02d}T23:59:59Z"
    start = datetime(year, month, 1, tzinfo=timezone.utc)
    end = datetime(year, month, last_day, 23, 59, 59, 999999, tzinfo=timezone.utc)
    return since, until, start, end


def is_in_period(dt_str: Optional[str], start: Optional[datetime], end: Optional[datetime]) -> bool:
    """Return True when datetime string is inside strict bounds."""
    if not start or not end or not dt_str:
        return True
    try:
        dt = datetime.fromisoformat(dt_str.replace("Z", "+00:00"))
        return start <= dt <= end
    except Exception:
        return True


def find_matched_target_dev(
    target_devs_map: Dict[int, Developer],
    gitlab_id: Optional[int],
    author_email: Optional[str],
    author_username: Optional[str],
) -> Optional[Developer]:
    """Fast-path match against preloaded target developers."""
    for target_dev in target_devs_map.values():
        if (gitlab_id and gitlab_id == target_dev.gitlab_user_id) or (
            normalize_email(author_email) == normalize_email(target_dev.email)
        ) or (normalize_username(author_username) == normalize_username(target_dev.gitlab_username)):
            return target_dev
    return None


def mr_matches_target_devs(mr_data: dict, target_devs_map: Dict[int, Developer]) -> bool:
    """Check if MR author/reviewer/assignee belongs to targeted developers."""
    if not target_devs_map:
        return True

    author = mr_data.get("author") or {}
    author_uname = normalize_username(author.get("username"))

    for target_dev in target_devs_map.values():
        target_uname = normalize_username(target_dev.gitlab_username)

        if (target_dev.gitlab_user_id and author.get("id") == target_dev.gitlab_user_id) or (
            author_uname and author_uname == target_uname
        ):
            return True

        for reviewer in (mr_data.get("reviewers") or []):
            if normalize_username(reviewer.get("username")) == target_uname:
                return True

        for assignee in (mr_data.get("assignees") or [mr_data.get("assignee")]):
            if assignee and normalize_username(assignee.get("username")) == target_uname:
                return True

    return False


def build_target_vectors(author_data: dict, target_devs_map: Dict[int, Developer], scoped: bool) -> Tuple[List[int], List[str], List[str], List[str]]:
    """Build identity vectors used to filter MR commits and notes."""
    target_ids, target_names, target_emails, target_unames = [], [], [], []

    if scoped and target_devs_map:
        for dev in target_devs_map.values():
            if dev.gitlab_user_id:
                target_ids.append(dev.gitlab_user_id)
            if dev.name:
                target_names.append(dev.name)
            if dev.email:
                target_emails.append(dev.email)
            if dev.gitlab_username:
                target_unames.append(dev.gitlab_username)
    else:
        if author_data.get("id"):
            target_ids.append(author_data.get("id"))
        if author_data.get("name"):
            target_names.append(author_data.get("name"))
        if author_data.get("email"):
            target_emails.append(author_data.get("email"))
        if author_data.get("username"):
            target_unames.append(author_data.get("username"))

    return target_ids, target_names, target_emails, target_unames


def is_target_author_commit(commit_data: dict, target_names: List[str], target_emails: List[str]) -> bool:
    """Match commit author against allowed names/emails."""
    if not any([target_names, target_emails]):
        return True
    commit_name = normalize_name(commit_data.get("author_name"))
    commit_email = normalize_email(commit_data.get("author_email"))
    return (commit_name in target_names) or (commit_email in target_emails)


def is_target_author_note(note_data: dict, target_ids: List[int], target_unames: List[str]) -> bool:
    """Match note author against allowed ids/usernames."""
    if not any([target_ids, target_unames]):
        return True
    note_author = note_data.get("author", {})
    return (note_author.get("id") in target_ids) or (
        normalize_username(note_author.get("username")) in target_unames
    )
