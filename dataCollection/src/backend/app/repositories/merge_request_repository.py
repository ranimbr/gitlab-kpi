"""
repositories/merge_request_repository.py

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
        lot_id:     Optional[int] = None,
        limit:      int = 50,
        offset:     int = 0,
    ) -> List[MergeRequest]:
        """
        ✅ CORRECTION SENIOR : Récupération paginée avec support des participants (Auteur/Reviewer/Assigné).
        """
        query = (
            db.query(MergeRequest)
            .outerjoin(Developer, MergeRequest.developer_id == Developer.id)
            .options(
                joinedload(MergeRequest.developer).joinedload(Developer.site_associations).joinedload(DeveloperSite.site),
                joinedload(MergeRequest.reviewer).joinedload(Developer.site_associations).joinedload(DeveloperSite.site),
                joinedload(MergeRequest.assignee).joinedload(Developer.site_associations).joinedload(DeveloperSite.site)
            )
            .filter(
                MergeRequest.project_id == project_id,
                # Logique Senior : Inclure si l'auteur est externe OU s'il est humain-validé
                (Developer.id == None) | (
                    (Developer.is_validated == True) &
                    (Developer.is_bot == False)
                )
            )
        )

        if lot_id is not None:
            query = query.filter(MergeRequest.extraction_lot_id == lot_id)

        return (
            query
            .order_by(MergeRequest.created_at_gitlab.desc())
            .limit(limit)
            .offset(offset)
            .all()
        )

    def get_by_period_paginated(
        self,
        db:         Session,
        period_id:  int,
        project_id: Optional[int] = None,
        limit:      int = 50,
        offset:     int = 0,
    ) -> List[MergeRequest]:
        """
        ✅ CORRECTION SENIOR : Récupération par période avec support inclusif des participants.
        """
        from app.models.developer import Developer
        from app.models.extraction_lot import ExtractionLot
        from sqlalchemy.orm import aliased
        from sqlalchemy import or_

        Rev = aliased(Developer)
        Ass = aliased(Developer)

        def is_valid_human(dev_alias):
            return (
                (dev_alias.id.isnot(None)) &
                (dev_alias.is_validated.is_(True)) &
                (dev_alias.is_bot.is_(False))
            )

        query = (
            db.query(MergeRequest)
            .outerjoin(Developer, MergeRequest.developer_id == Developer.id)
            .outerjoin(Rev,       MergeRequest.reviewer_id  == Rev.id)
            .outerjoin(Ass,       MergeRequest.assignee_id  == Ass.id)
            .join(ExtractionLot, MergeRequest.extraction_lot_id == ExtractionLot.id)
            .options(
                joinedload(MergeRequest.developer),
                joinedload(MergeRequest.reviewer),
                joinedload(MergeRequest.assignee)
            )
            .filter(
                ExtractionLot.period_id == period_id,
                or_(
                    Developer.id.is_(None), # Auteur externe
                    is_valid_human(Developer),
                    is_valid_human(Rev),
                    is_valid_human(Ass)
                )
            )
        )

        
        if project_id is not None:
            query = query.filter(MergeRequest.project_id == project_id)

        return (
            query
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
        ✅ CORRECTION SENIOR : Filtre inclusif (Auteur OU Reviewer OU Assigné).
        L'activité est comptabilisée si l'UN des acteurs appartient au site.
        """
        from sqlalchemy import or_, exists
        from app.models.developer_site import DeveloperSite
        
        # Sous-requête pour vérifier l'appartenance d'un dev au site et sa validité
        def dev_in_site_and_valid(dev_id_col):
            return exists().where(
                (Developer.id == dev_id_col) &
                (Developer.is_validated.is_(True)) &
                (Developer.is_bot.is_(False)) &
                exists().where(
                    (DeveloperSite.developer_id == Developer.id) &
                    (DeveloperSite.site_id      == site_id)
                )
            )

        return q.filter(
            or_(
                dev_in_site_and_valid(MergeRequest.developer_id),
                dev_in_site_and_valid(MergeRequest.reviewer_id),
                dev_in_site_and_valid(MergeRequest.assignee_id)
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
        ✅ CORRECTION SENIOR : KPI individuel — MRs où le dev est Auteur OU Reviewer.
        Auparavant, on oubliait l'activité de relecture !
        """
        from sqlalchemy import or_
        q = (
            db.query(func.count(MergeRequest.id))
            .filter(
                or_(
                    MergeRequest.developer_id == developer_id,
                    MergeRequest.reviewer_id  == developer_id
                ),
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
        ✅ CORRECTION SENIOR : KPI #7 individuel — Temps passé par CE dev à relire les autres.
        Auparavant, on calculait le temps que les autres passaient à le relire (developer_id).
        """
        q = (
            db.query(func.sum(MergeRequest.review_time_hours))
            .filter(
                MergeRequest.reviewer_id          == developer_id,  # C'est l'effort du reviewer qu'on mesure
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