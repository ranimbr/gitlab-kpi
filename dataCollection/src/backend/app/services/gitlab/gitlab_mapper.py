"""
services/gitlab/gitlab_mapper.py — inchangé fonctionnellement.
map_developer : site_id FK, company. map_merge_request : review_time_hours.
"""
from typing import Dict, Any, Optional
from datetime import datetime
import logging

logger = logging.getLogger(__name__)

class GitLabMapper:

    @staticmethod
    def map_project(data: Dict[str, Any]) -> Dict[str, Any]:
        return {
            "gitlab_project_id": data["id"],
            "name":              data["name"],
            "path":              data["path"],
            "namespace":         data.get("namespace", {}).get("name"),
            "description":       data.get("description"),
            "visibility":        data.get("visibility"),
            "default_branch":    data.get("default_branch"),
            "archived":          data.get("archived", False),
        }

    @staticmethod
    def map_developer(
        data: Dict[str, Any], project_id: int,
        group_id: Optional[int] = None, site_id: Optional[int] = None,
        company: Optional[str] = None,
    ) -> Dict[str, Any]:
        gitlab_user_id = data.get("id")
        if gitlab_user_id is None:
            logger.warning(f"map_developer: id=None — username='{data.get('username')}' project_id={project_id}")
        return {
            "gitlab_user_id": gitlab_user_id,
            "username":       data.get("username") or "unknown",
            "name":           data.get("name")     or None,
            "email":          data.get("email")    or None,
            "company":        company,
            "project_id":     project_id,
            "group_id":       group_id,
            "site_id":        site_id,
            "is_active":      True,
        }

    @staticmethod
    def map_commit(
        data: Dict[str, Any], project_id: int,
        developer_id: Optional[int] = None, extraction_lot_id: Optional[int] = None,
    ) -> Dict[str, Any]:
        def parse_dt(val: str) -> datetime:
            return datetime.fromisoformat(val.replace("Z", "+00:00"))
        authored_date  = parse_dt(data["authored_date"])
        committed_date = parse_dt(data["committed_date"])
        full_message   = data.get("message", "")
        title          = full_message.split("\n", 1)[0]
        stats          = data.get("stats") or {}
        return {
            "gitlab_commit_id":  data["id"],
            "title":             title,
            "message":           full_message,
            "authored_date":     authored_date,
            "committed_date":    committed_date,
            "additions":         stats.get("additions", 0),
            "deletions":         stats.get("deletions", 0),
            "total_changes":     stats.get("total",     0),
            "project_id":        project_id,
            "developer_id":      developer_id,
            "extraction_lot_id": extraction_lot_id,
        }

    @staticmethod
    def map_merge_request(
        data: Dict[str, Any], project_id: int,
        developer_id: Optional[int] = None, extraction_lot_id: Optional[int] = None,
        approvals_data: Optional[Dict[str, Any]] = None,
    ) -> Dict[str, Any]:
        def parse_dt(val: Optional[str]) -> Optional[datetime]:
            if not val:
                return None
            try:
                return datetime.fromisoformat(val.replace("Z", "+00:00"))
            except Exception:
                logger.warning(f"map_merge_request — invalid datetime: '{val}'")
                return None

        created_at = parse_dt(data.get("created_at"))
        merged_at  = parse_dt(data.get("merged_at"))
        closed_at  = parse_dt(data.get("closed_at"))
        title      = data.get("title") or ""

        is_draft = (
            data.get("work_in_progress", False) or data.get("draft", False)
            or title.upper().startswith("DRAFT:") or title.upper().startswith("WIP:")
        )

        approved    = False
        approved_at = None

        if approvals_data:
            approved_by = approvals_data.get("approved_by") or []
            if approved_by:
                approved   = True
                timestamps = []
                for approval in approved_by:
                    ts = approval.get("approved_at") or approvals_data.get("approved_at")
                    if ts:
                        parsed = parse_dt(ts)
                        if parsed:
                            timestamps.append(parsed)
                if timestamps:
                    approved_at = max(timestamps)
            if not approved_at and approvals_data.get("approved_at"):
                approved_at = parse_dt(approvals_data["approved_at"])
                approved    = approved_at is not None

        review_time_hours = None
        if approved_at and created_at:
            delta             = approved_at - created_at
            review_time_hours = round(delta.total_seconds() / 3600, 2)

        return {
            "gitlab_mr_id":      data["iid"],
            "title":             title,
            "description":       data.get("description"),
            "state":             data.get("state", "opened"),
            "is_draft":          is_draft,
            "created_at_gitlab": created_at,
            "merged_at":         merged_at,
            "closed_at":         closed_at,
            "approved_at":       approved_at,
            "approved":          approved,
            "review_time_hours": review_time_hours,
            "additions":         data.get("additions",     0),
            "deletions":         data.get("deletions",     0),
            "total_changes":     data.get("total_changes", 0),
            "project_id":        project_id,
            "developer_id":      developer_id,
            "extraction_lot_id": extraction_lot_id,
        }