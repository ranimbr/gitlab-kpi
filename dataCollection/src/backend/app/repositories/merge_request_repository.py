"""
repositories/merge_request_repository.py

CORRECTIONS :
    1. Hérite de BaseRepository (cohérence)
    2. Ajout count_by_project() pour pagination
    3. Ajout bulk_create() pour ExtractionService
    4. Filtres site via Developer.site_id (FK) — inchangé, déjà correct
"""

from typing import List, Optional

from sqlalchemy import func
from sqlalchemy.orm import Session, joinedload

from app.models.developer import Developer
from app.models.merge_request import MergeRequest, MRStateEnum
from app.repositories.base import BaseRepository


class MergeRequestRepository(BaseRepository[MergeRequest]):

    def __init__(self):
        super().__init__(MergeRequest)

    # ─────────────────────────────────────────────────────────────────────────
    # READ
    # ─────────────────────────────────────────────────────────────────────────

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
        """Total MRs d'un projet — pour la pagination."""
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

    def get_by_lot(
        self,
        db:     Session,
        lot_id: int,
    ) -> List[MergeRequest]:
        """Toutes les MRs d'un lot d'extraction."""
        return (
            db.query(MergeRequest)
            .filter(MergeRequest.extraction_lot_id == lot_id)
            .all()
        )

    # ─────────────────────────────────────────────────────────────────────────
    # KPI HELPERS
    # ─────────────────────────────────────────────────────────────────────────

    def count_by_project_period(
        self,
        db:             Session,
        project_id:     int,
        start_date,
        end_date,
        site_id:        Optional[int] = None,
        only_non_draft: bool          = True,
    ) -> int:
        """
        Compte les MRs créées sur une période.
        Filtre via Developer.site_id si site_id fourni.
        """
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
            q = (
                q.join(Developer, MergeRequest.developer_id == Developer.id)
                .filter(
                    Developer.site_id      == site_id,
                    Developer.is_validated.is_(True),
                    Developer.is_bot.is_(False),
                )
            )
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
            q = (
                q.join(Developer, MergeRequest.developer_id == Developer.id)
                .filter(
                    Developer.site_id      == site_id,
                    Developer.is_validated.is_(True),
                    Developer.is_bot.is_(False),
                )
            )
        return q.scalar() or 0

    def count_approved_by_site(
        self,
        db:         Session,
        project_id: int,
        site_id:    Optional[int] = None,
        start_date  = None,
        end_date    = None,
    ) -> int:
        """KPI #3 (dénominateur) et #4 (dénominateur) — MRs approuvées."""
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
            q = (
                q.join(Developer, MergeRequest.developer_id == Developer.id)
                .filter(
                    Developer.site_id      == site_id,
                    Developer.is_validated.is_(True),
                    Developer.is_bot.is_(False),
                )
            )
        return q.scalar() or 0

    def get_approved_mrs_with_review_time(
        self,
        db:         Session,
        project_id: int,
        site_id:    Optional[int] = None,
        start_date  = None,
        end_date    = None,
    ) -> List[MergeRequest]:
        """
        KPI #7 — MRs approuvées avec review_time_hours renseigné.
        review_time_hours = (approved_at - created_at_gitlab) en heures.
        """
        q = (
            db.query(MergeRequest)
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
            q = (
                q.join(Developer, MergeRequest.developer_id == Developer.id)
                .filter(
                    Developer.site_id      == site_id,
                    Developer.is_validated.is_(True),
                    Developer.is_bot.is_(False),
                )
            )
        return q.all()

    def sum_review_time(
        self,
        db:         Session,
        project_id: int,
        site_id:    Optional[int] = None,
        start_date  = None,
        end_date    = None,
    ) -> float:
        """
        KPI #7 — somme directe de review_time_hours en DB (plus efficace que charger les objets).
        Retourne 0.0 si aucune MR approuvée.
        """
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
            q = (
                q.join(Developer, MergeRequest.developer_id == Developer.id)
                .filter(
                    Developer.site_id      == site_id,
                    Developer.is_validated.is_(True),
                    Developer.is_bot.is_(False),
                )
            )
        return q.scalar() or 0.0

    # ─────────────────────────────────────────────────────────────────────────
    # WRITE
    # ─────────────────────────────────────────────────────────────────────────

    def create(self, db: Session, data: dict) -> MergeRequest:
        mr = MergeRequest(**data)
        db.add(mr)
        db.flush()
        return mr

    def bulk_create(self, db: Session, data_list: List[dict]) -> List[MergeRequest]:
        """Insertion en masse — utilisé par ExtractionService."""
        mrs = [MergeRequest(**d) for d in data_list]
        db.add_all(mrs)
        db.flush()
        return mrs