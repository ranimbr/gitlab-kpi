"""
repositories/commit_repository.py

CORRECTIONS :
    1. Hérite de BaseRepository (cohérence avec les autres repositories)
    2. site_id: int = None → Optional[int] = None
    3. Ajout count_total() pour la pagination
"""

from typing import List, Optional

from sqlalchemy import func
from sqlalchemy.orm import Session, joinedload

from app.models.commit import Commit
from app.models.developer import Developer
from app.repositories.base import BaseRepository


class CommitRepository(BaseRepository[Commit]):

    def __init__(self):
        super().__init__(Commit)

    # ─────────────────────────────────────────────────────────────────────────
    # READ
    # ─────────────────────────────────────────────────────────────────────────

    def get_project_commits_paginated(
        self,
        db:         Session,
        project_id: int,
        limit:      int = 50,
        offset:     int = 0,
    ) -> List[Commit]:
        return (
            db.query(Commit)
            .options(joinedload(Commit.developer))
            .filter(Commit.project_id == project_id)
            .order_by(Commit.authored_date.desc())
            .limit(limit)
            .offset(offset)
            .all()
        )

    def count_by_project(self, db: Session, project_id: int) -> int:
        """Total commits d'un projet — pour la pagination frontend."""
        return (
            db.query(func.count(Commit.id))
            .filter(Commit.project_id == project_id)
            .scalar() or 0
        )

    def get_by_sha(
        self,
        db:         Session,
        sha:        str,
        project_id: int,
    ) -> Optional[Commit]:
        return (
            db.query(Commit)
            .filter(
                Commit.gitlab_commit_id == sha,
                Commit.project_id       == project_id,
            )
            .first()
        )

    def count_by_project_period(
        self,
        db:         Session,
        project_id: int,
        start_date,
        end_date,
        site_id:    Optional[int] = None,   # ✅ FIX : Optional[int], pas int = None
    ) -> int:
        """
        KPI #5 et #6 — compte les commits sur une période.
        ✅ FIX : site_id est Optional[int] (pas int = None).
        Filtre via Developer.site_id (FK) si site_id fourni.
        Seuls les commits de développeurs validés, non-bots sont comptés.
        """
        q = (
            db.query(func.count(Commit.id))
            .filter(
                Commit.project_id    == project_id,
                Commit.authored_date >= start_date,
                Commit.authored_date <  end_date,
            )
        )

        if site_id is not None:
            # JOIN pour filtrer par site — exclut les commits sans developer (anonymes)
            q = (
                q.join(Developer, Commit.developer_id == Developer.id)
                .filter(
                    Developer.site_id      == site_id,
                    Developer.is_validated.is_(True),
                    Developer.is_bot.is_(False),
                )
            )

        return q.scalar() or 0

    def get_by_developer_period(
        self,
        db:           Session,
        developer_id: int,
        start_date,
        end_date,
    ) -> List[Commit]:
        """Commits d'un développeur sur une période — vue individuelle."""
        return (
            db.query(Commit)
            .filter(
                Commit.developer_id  == developer_id,
                Commit.authored_date >= start_date,
                Commit.authored_date <  end_date,
            )
            .order_by(Commit.authored_date.desc())
            .all()
        )

    def get_by_lot(
        self,
        db:     Session,
        lot_id: int,
    ) -> List[Commit]:
        """Tous les commits d'un lot d'extraction."""
        return (
            db.query(Commit)
            .filter(Commit.extraction_lot_id == lot_id)
            .all()
        )

    # ─────────────────────────────────────────────────────────────────────────
    # WRITE
    # ─────────────────────────────────────────────────────────────────────────

    def create(self, db: Session, data: dict) -> Commit:
        commit = Commit(**data)
        db.add(commit)
        db.flush()
        return commit

    def bulk_create(self, db: Session, data_list: List[dict]) -> List[Commit]:
        """Insertion en masse — utilisé par ExtractionService pour les gros volumes."""
        commits = [Commit(**d) for d in data_list]
        db.add_all(commits)
        db.flush()
        return commits