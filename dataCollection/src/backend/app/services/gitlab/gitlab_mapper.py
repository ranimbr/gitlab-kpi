"""
services/gitlab/gitlab_mapper.py

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
        data:    Dict[str, Any],
        # ✅ FIX : project_id et site_id supprimés — gérés via M2M
        group_id: Optional[int] = None,
        company:  Optional[str] = None,
    ) -> Dict[str, Any]:
        """
        Mappe les données GitLab vers le modèle Developer.

        ✅ FIX : plus de project_id ni site_id dans le dict.
        L'association Developer ↔ Project est créée séparément via
        DeveloperProjectRepository.add() dans ExtractionService.

        ✅ AJOUT : gitlab_username et avatar_url (nouveaux champs Developer).
        """
        gitlab_user_id = data.get("id")
        if gitlab_user_id is None:
            logger.warning(
                f"map_developer: id=None — username='{data.get('username')}'"
            )
        return {
            "gitlab_user_id":  gitlab_user_id,
            # ✅ AJOUT : gitlab_username (@handle) pour le matching commits/MRs
            "gitlab_username": data.get("username") or None,
            "name":            data.get("name")     or None,
            "email":           data.get("email")    or None,
            "company":         company,
            # ✅ AJOUT : photo de profil récupérée depuis GitLab
            "avatar_url":      data.get("avatar_url") or None,
            "group_id":        group_id,
            "is_active":       True,
        }

    @staticmethod
    def map_commit(
        data:              Dict[str, Any],
        project_id:        int,
        developer_id:      Optional[int] = None,
        extraction_lot_id: Optional[int] = None,
    ) -> Dict[str, Any]:
        """
        Mappe les données GitLab vers le modèle Commit.

        ✅ AJOUT :
            is_merge_commit : détecté via le message (pattern "Merge branch/request")
            branch_name     : depuis les metadata du commit si disponible
            author_name     : nom brut de l'auteur (fallback quand developer_id=NULL)
            author_email    : email brut de l'auteur (fallback)
        """
        def parse_dt(val: str) -> datetime:
            return datetime.fromisoformat(val.replace("Z", "+00:00"))

        authored_date  = parse_dt(data["authored_date"])
        committed_date = parse_dt(data["committed_date"])
        full_message   = data.get("message", "")
        title          = full_message.split("\n", 1)[0]
        stats          = data.get("stats") or {}

        # ✅ AJOUT : détection commit de merge automatique
        title_lower = title.lower()
        is_merge_commit = (
            title_lower.startswith("merge branch") or
            title_lower.startswith("merge request") or
            title_lower.startswith("merged branch") or
            "merge remote-tracking branch" in title_lower
        )

        return {
            "gitlab_commit_id":  data["id"],
            "title":             title,
            "message":           full_message,
            "authored_date":     authored_date,
            "committed_date":    committed_date,
            "additions":         stats.get("additions", 0),
            "deletions":         stats.get("deletions", 0),
            "total_changes":     stats.get("total",     0),
            # ✅ AJOUT
            "is_merge_commit":   is_merge_commit,
            "branch_name":       data.get("branch_name") or data.get("ref"),
            "author_name":       data.get("author_name")  or None,
            "author_email":      data.get("author_email") or None,
            "project_id":        project_id,
            "developer_id":      developer_id,
            "extraction_lot_id": extraction_lot_id,
        }

    @staticmethod
    def map_merge_request(
        data:              Dict[str, Any],
        project_id:        int,
        developer_id:      Optional[int] = None,
        extraction_lot_id: Optional[int] = None,
        approvals_data:    Optional[Dict[str, Any]] = None,
        # ✅ AJOUT : relecteur assigné
        reviewer_id:       Optional[int] = None,
    ) -> Dict[str, Any]:
        """
        Mappe les données GitLab vers le modèle MergeRequest.

        ✅ AJOUT :
            source_branch, target_branch : branches GitLab
            author_name : nom brut de l'auteur (fallback)
            reviewer_id : développeur relecteur assigné
        """
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
            data.get("work_in_progress", False) or data.get("draft", False) or
            title.upper().startswith("DRAFT:") or title.upper().startswith("WIP:")
        )

        approved = False
        approved_at = None

        if approvals_data:
            approved_by = approvals_data.get("approved_by") or []
            if approved_by:
                approved    = True
                timestamps  = []
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
            #  FIX : On ne peut pas avoir un temps de revue négatif (timezone/bot drift)
            review_time_hours = max(0.0, round(delta.total_seconds() / 3600, 2))

        #  AJOUT : auteur brut (fallback)
        author = data.get("author") or {}

        return {
            "gitlab_mr_id":      data["iid"],
            "title":             title,
            "description":       data.get("description"),
            "state":             data.get("state", "opened"),
            "is_draft":          is_draft,
            "created_at_gitlab": created_at,
            "updated_at_gitlab": parse_dt(data.get("updated_at")),
            "merged_at":         merged_at,
            "closed_at":         closed_at,
            "approved_at":       approved_at,
            "approved":          approved,
            "review_time_hours": review_time_hours,
            "cycle_time_hours":  data.get("cycle_time_hours"),
            "additions":         data.get("additions",     0),
            "deletions":         data.get("deletions",     0),
            "total_changes":     data.get("total_changes", 0),
            # ✅ AJOUT [SENIOR] : Métriques de profondeur et complexité
            "user_notes_count":  data.get("user_notes_count", 0),
            "commits_count":     data.get("commits_count") or 0,
            # ✅ AJOUT : branches
            "source_branch":     data.get("source_branch") or None,
            "target_branch":     data.get("target_branch") or None,
            # ✅ AJOUT : auteur brut
            "author_name":       author.get("name")     or data.get("author_name") or None,
            "project_id":        project_id,
            "developer_id":      developer_id,
            "reviewer_id":       reviewer_id,
            "extraction_lot_id": extraction_lot_id,
        }