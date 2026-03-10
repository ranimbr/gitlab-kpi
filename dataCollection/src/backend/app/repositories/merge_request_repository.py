"""
merge_request_repository.py

[FIX] Renommé depuis mr_repository.py pour cohérence avec la convention
de nommage du projet (tous les autres fichiers utilisent le nom complet).
Mettre à jour les imports dans extraction_service.py :
    from app.repositories.merge_request_repository import MergeRequestRepository
"""
from typing import List, Optional

from sqlalchemy import func
from sqlalchemy.orm import Session, joinedload

from app.models.developer import Developer
from app.models.merge_request import MergeRequest


class MergeRequestRepository:

    # ─── Read ─────────────────────────────────────────────────────────────────

    def get_project_mrs_paginated(
        self,
        db:         Session,
        project_id: int,
        limit:      int = 50,
        offset:     int = 0,
    ) -> List[MergeRequest]:
        """
        Retourne les MRs paginées avec la relation Developer pré-chargée
        (évite N+1 queries côté frontend).
        """
        return (
            db.query(MergeRequest)
            .options(joinedload(MergeRequest.developer))
            .filter(MergeRequest.project_id == project_id)
            .order_by(MergeRequest.created_at_gitlab.desc())
            .limit(limit)
            .offset(offset)
            .all()
        )

    def get_by_gitlab_mr_id(
        self,
        db:           Session,
        gitlab_mr_id: int,
        project_id:   int,
    ) -> Optional[MergeRequest]:
        """Recherche par (gitlab_mr_id, project_id) — clé unique de déduplication."""
        return (
            db.query(MergeRequest)
            .filter(
                MergeRequest.gitlab_mr_id == gitlab_mr_id,
                MergeRequest.project_id   == project_id,
            )
            .first()
        )

    def get_by_id(self, db: Session, mr_id: int) -> Optional[MergeRequest]:
        return db.query(MergeRequest).filter(MergeRequest.id == mr_id).first()

    def create(self, db: Session, data: dict) -> MergeRequest:
        mr = MergeRequest(**data)
        db.add(mr)
        db.flush()
        return mr

    # ─── KPI helpers ──────────────────────────────────────────────────────────

    def count_by_project_period(
        self,
        db:         Session,
        project_id: int,
        start_date,
        end_date,
        site:       Optional[str] = None,
        only_non_draft: bool = True,
    ) -> int:
        """Compte les MRs créées sur une période, optionnellement filtrées par site."""
        q = (
            db.query(func.count(MergeRequest.id))
            .filter(
                MergeRequest.project_id          == project_id,
                MergeRequest.created_at_gitlab   >= start_date,
                MergeRequest.created_at_gitlab   <  end_date,
            )
        )
        if only_non_draft:
            q = q.filter(MergeRequest.is_draft.is_(False))

        if site:
            q = (
                q.join(Developer, MergeRequest.developer_id == Developer.id, isouter=True)
                .filter(Developer.site == site)
            )
        return q.scalar() or 0

    def count_merged_by_site(
        self,
        db:         Session,
        project_id: int,
        site:       Optional[str] = None,
    ) -> int:
        q = (
            db.query(func.count(MergeRequest.id))
            .join(Developer, MergeRequest.developer_id == Developer.id, isouter=True)
            .filter(
                MergeRequest.project_id == project_id,
                MergeRequest.merged_at.isnot(None),
            )
        )
        if site:
            q = q.filter(Developer.site == site)
        return q.scalar() or 0

    def count_approved_by_site(
        self,
        db:         Session,
        project_id: int,
        site:       Optional[str] = None,
    ) -> int:
        q = (
            db.query(func.count(MergeRequest.id))
            .join(Developer, MergeRequest.developer_id == Developer.id, isouter=True)
            .filter(
                MergeRequest.project_id == project_id,
                MergeRequest.approved   == True,          # noqa: E712
            )
        )
        if site:
            q = q.filter(Developer.site == site)
        return q.scalar() or 0
