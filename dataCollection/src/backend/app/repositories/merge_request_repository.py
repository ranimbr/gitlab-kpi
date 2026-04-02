"""
repositories/merge_request_repository.py

CORRECTIONS MAJEURES (modèles mis à jour) :
─────────────────────────────────────────────
1. Tous les filtres site via Developer.site_id remplacés par DeveloperSite (M2M).

2. AJOUT filtre reviewer_id dans les requêtes pertinentes.

3. AJOUT get_unmatched() : MRs sans developer_id (à matcher par l'admin).

4. AJOUT get_by_reviewer() : MRs assignées à un relecteur.

5. AJOUT count_by_developer_period() : KPI individuel par développeur.

6. AJOUT sum_review_time_by_developer() : KPI #7 individuel par développeur.
"""
from typing import List, Optional

from sqlalchemy import func
from sqlalchemy.orm import Session, joinedload

from app.models.developer import Developer
from app.models.developer_site import DeveloperSite
from app.models.merge_request import MergeRequest, MRStateEnum
from app.repositories.base import BaseRepository


class MergeRequestRepository(BaseRepository[MergeRequest]):

    def __init__(self):
        super().__init__(MergeRequest)

    # ── READ ──────────────────────────────────────────────────────────────────

    def get_project_mrs_paginated(
        self,
        db:         Session,
        project_id: int,
        limit:      int = 50,
        offset:     int = 0,
    ) -> List[MergeRequest]:
        return (
            db.query(MergeRequest)
            .options(joinedload(MergeRequest.developer))
            .filter(MergeRequest.project_id == project_id)
            .order_by(MergeRequest.created_at_gitlab.desc())
            .limit(limit)
            .offset(offset)
            .all()
        )

    def count_by_project(self, db: Session, project_id: int) -> int:
        return (
            db.query(func.count(MergeRequest.id))
            .filter(MergeRequest.project_id == project_id)
            .scalar() or 0
        )

    def get_by_gitlab_mr_id(
        self,
        db:           Session,
        gitlab_mr_id: int,
        project_id:   int,
    ) -> Optional[MergeRequest]:
        return (
            db.query(MergeRequest)
            .filter(
                MergeRequest.gitlab_mr_id == gitlab_mr_id,
                MergeRequest.project_id   == project_id,
            )
            .first()
        )

    def get_by_lot(self, db: Session, lot_id: int) -> List[MergeRequest]:
        return (
            db.query(MergeRequest)
            .filter(MergeRequest.extraction_lot_id == lot_id)
            .all()
        )

    def get_unmatched(
        self,
        db:         Session,
        project_id: int,
        limit:      int = 100,
    ) -> List[MergeRequest]:
        """
        ✅ AJOUT : MRs sans developer_id — à matcher par l'admin.
        author_name permet l'identification de l'auteur.
        """
        return (
            db.query(MergeRequest)
            .filter(
                MergeRequest.project_id   == project_id,
                MergeRequest.developer_id.is_(None),
            )
            .order_by(MergeRequest.created_at_gitlab.desc())
            .limit(limit)
            .all()
        )

    def get_by_reviewer(
        self,
        db:          Session,
        reviewer_id: int,
        project_id:  Optional[int] = None,
        pending_only: bool = False,
    ) -> List[MergeRequest]:
        """
        ✅ AJOUT : MRs assignées à un relecteur.
        pending_only=True → MRs ouvertes pas encore approuvées (charge de review).
        """
        q = (
            db.query(MergeRequest)
            .filter(MergeRequest.reviewer_id == reviewer_id)
        )
        if project_id is not None:
            q = q.filter(MergeRequest.project_id == project_id)
        if pending_only:
            q = q.filter(
                MergeRequest.state == MRStateEnum.opened,
                MergeRequest.approved.is_(False),
            )
        return q.order_by(MergeRequest.created_at_gitlab.desc()).all()

    # ── KPI HELPERS ───────────────────────────────────────────────────────────

    def _apply_site_filter(self, q, site_id: int):
        """
        ✅ HELPER INTERNE : filtre via DeveloperSite (M2M).
        Remplace le filtre Developer.site_id == site_id (FK directe supprimée).
        """
        return (
            q.join(Developer, MergeRequest.developer_id == Developer.id)
            .join(
                DeveloperSite,
                (DeveloperSite.developer_id == Developer.id) &
                (DeveloperSite.site_id      == site_id),
            )
            .filter(
                Developer.is_validated.is_(True),
                Developer.is_bot.is_(False),
            )
        )

    def count_by_project_period(
        self,
        db:             Session,
        project_id:     int,
        start_date,
        end_date,
        site_id:        Optional[int] = None,
        only_non_draft: bool          = True,
    ) -> int:
        """KPI #1 — MRs créées non-draft sur une période."""
        q = (
            db.query(func.count(MergeRequest.id))
            .filter(
                MergeRequest.project_id        == project_id,
                MergeRequest.created_at_gitlab >= start_date,
                MergeRequest.created_at_gitlab <  end_date,
            )
        )
        if only_non_draft:
            q = q.filter(MergeRequest.is_draft.is_(False))
        if site_id is not None:
            q = self._apply_site_filter(q, site_id)
        return q.scalar() or 0

    def count_by_developer_period(
        self,
        db:           Session,
        developer_id: int,
        start_date,
        end_date,
        only_non_draft: bool = True,
    ) -> int:
        """
        ✅ AJOUT : KPI individuel — MRs créées par un développeur sur une période.
        """
        q = (
            db.query(func.count(MergeRequest.id))
            .filter(
                MergeRequest.developer_id      == developer_id,
                MergeRequest.created_at_gitlab >= start_date,
                MergeRequest.created_at_gitlab <  end_date,
            )
        )
        if only_non_draft:
            q = q.filter(MergeRequest.is_draft.is_(False))
        return q.scalar() or 0

    def count_merged_by_site(
        self,
        db:         Session,
        project_id: int,
        site_id:    Optional[int] = None,
        start_date  = None,
        end_date    = None,
    ) -> int:
        """KPI #4 — MRs mergées (numérateur)."""
        q = (
            db.query(func.count(MergeRequest.id))
            .filter(
                MergeRequest.project_id == project_id,
                MergeRequest.state      == MRStateEnum.merged,
                MergeRequest.is_draft.is_(False),
            )
        )
        if start_date:
            q = q.filter(MergeRequest.created_at_gitlab >= start_date)
        if end_date:
            q = q.filter(MergeRequest.created_at_gitlab < end_date)
        if site_id is not None:
            q = self._apply_site_filter(q, site_id)
        return q.scalar() or 0

    def count_approved_by_site(
        self,
        db:         Session,
        project_id: int,
        site_id:    Optional[int] = None,
        start_date  = None,
        end_date    = None,
    ) -> int:
        """KPI #3 et #4 — MRs approuvées."""
        q = (
            db.query(func.count(MergeRequest.id))
            .filter(
                MergeRequest.project_id == project_id,
                MergeRequest.approved.is_(True),
                MergeRequest.is_draft.is_(False),
            )
        )
        if start_date:
            q = q.filter(MergeRequest.created_at_gitlab >= start_date)
        if end_date:
            q = q.filter(MergeRequest.created_at_gitlab < end_date)
        if site_id is not None:
            q = self._apply_site_filter(q, site_id)
        return q.scalar() or 0

    def sum_review_time(
        self,
        db:         Session,
        project_id: int,
        site_id:    Optional[int] = None,
        start_date  = None,
        end_date    = None,
    ) -> float:
        """KPI #7 — somme de review_time_hours des MRs approuvées."""
        q = (
            db.query(func.sum(MergeRequest.review_time_hours))
            .filter(
                MergeRequest.project_id           == project_id,
                MergeRequest.approved.is_(True),
                MergeRequest.is_draft.is_(False),
                MergeRequest.review_time_hours.isnot(None),
            )
        )
        if start_date:
            q = q.filter(MergeRequest.created_at_gitlab >= start_date)
        if end_date:
            q = q.filter(MergeRequest.created_at_gitlab < end_date)
        if site_id is not None:
            q = self._apply_site_filter(q, site_id)
        return q.scalar() or 0.0

    def sum_review_time_by_developer(
        self,
        db:           Session,
        developer_id: int,
        start_date    = None,
        end_date      = None,
    ) -> float:
        """
        ✅ AJOUT : KPI #7 individuel — temps de review d'un développeur.
        """
        q = (
            db.query(func.sum(MergeRequest.review_time_hours))
            .filter(
                MergeRequest.developer_id         == developer_id,
                MergeRequest.approved.is_(True),
                MergeRequest.is_draft.is_(False),
                MergeRequest.review_time_hours.isnot(None),
            )
        )
        if start_date:
            q = q.filter(MergeRequest.created_at_gitlab >= start_date)
        if end_date:
            q = q.filter(MergeRequest.created_at_gitlab < end_date)
        return q.scalar() or 0.0

    def count_approved_by_developer(
        self,
        db:           Session,
        developer_id: int,
        start_date    = None,
        end_date      = None,
    ) -> int:
        """KPI #3 individuel — MRs approuvées d'un développeur."""
        q = (
            db.query(func.count(MergeRequest.id))
            .filter(
                MergeRequest.developer_id == developer_id,
                MergeRequest.approved.is_(True),
                MergeRequest.is_draft.is_(False),
            )
        )
        if start_date:
            q = q.filter(MergeRequest.created_at_gitlab >= start_date)
        if end_date:
            q = q.filter(MergeRequest.created_at_gitlab < end_date)
        return q.scalar() or 0

    def count_merged_by_developer(
        self,
        db:           Session,
        developer_id: int,
        start_date    = None,
        end_date      = None,
    ) -> int:
        """KPI #4 individuel — MRs mergées d'un développeur."""
        q = (
            db.query(func.count(MergeRequest.id))
            .filter(
                MergeRequest.developer_id == developer_id,
                MergeRequest.state        == MRStateEnum.merged,
                MergeRequest.is_draft.is_(False),
            )
        )
        if start_date:
            q = q.filter(MergeRequest.created_at_gitlab >= start_date)
        if end_date:
            q = q.filter(MergeRequest.created_at_gitlab < end_date)
        return q.scalar() or 0

    # ── WRITE ─────────────────────────────────────────────────────────────────

    def create(self, db: Session, data: dict) -> MergeRequest:
        mr = MergeRequest(**data)
        db.add(mr)
        db.flush()
        return mr

    def bulk_create(self, db: Session, data_list: List[dict]) -> List[MergeRequest]:
        mrs = [MergeRequest(**d) for d in data_list]
        db.add_all(mrs)
        db.flush()
        return mrs