"""
repositories/commit_repository.py

CORRECTIONS MAJEURES (modèles mis à jour) :
─────────────────────────────────────────────
1. count_by_project_period() : filtre site via DeveloperSite (M2M)
   au lieu de Developer.site_id (FK directe supprimée).

2. AJOUT filtre is_merge_commit=False dans les requêtes KPI #5 et #6.
   Les commits de merge automatiques (is_merge_commit=True) sont exclus
   car ils ne représentent pas du travail de développement réel.

3. AJOUT get_unmatched() : commits sans developer_id.
   Retournés par GET /commits/unmatched pour que l'admin puisse matcher
   manuellement les commits aux Developer (nouveaux champs author_name/email).

4. AJOUT get_last_commit_date() : date du dernier commit d'un projet
   (utilisé pour mettre à jour Project.last_commit_date après extraction).

5. AJOUT count_by_developer_period() : KPI individuel par développeur.

6. AJOUT get_daily_activity() : activité jour par jour — heatmap GitHub-style.
"""
from datetime import datetime
from typing import List, Optional

from sqlalchemy import func
from sqlalchemy.orm import Session, joinedload

from app.models.commit import Commit
from app.models.developer import Developer
from app.models.developer_site import DeveloperSite
from app.repositories.base import BaseRepository


class CommitRepository(BaseRepository[Commit]):

    def __init__(self):
        super().__init__(Commit)

    # ── READ ──────────────────────────────────────────────────────────────────

    def get_project_commits_paginated(
        self,
        db:         Session,
        project_id: int,
        limit:      int = 50,
        offset:     int = 0,
        lot_id:     Optional[int] = None,
        exclude_merge_commits: bool = True,
    ) -> List[Commit]:
        query = (
            db.query(Commit)
            .options(joinedload(Commit.developer))
            .filter(Commit.project_id == project_id)
        )
        if exclude_merge_commits:
            query = query.filter(Commit.is_merge_commit.is_(False))
            
        if lot_id is not None:
            query = query.filter(Commit.extraction_lot_id == lot_id)

        return (
            query
            .order_by(Commit.authored_date.desc())
            .limit(limit)
            .offset(offset)
            .all()
        )


    def count_by_project(self, db: Session, project_id: int) -> int:
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
        db:                    Session,
        project_id:            int,
        start_date,
        end_date,
        site_id:               Optional[int] = None,
        exclude_merge_commits: bool          = True,
    ) -> int:
        """
        KPI #5 et #6 — commits sur une période.

        FIX site_id : filtre via DeveloperSite (M2M)
        au lieu de Developer.site_id (FK directe supprimée).

        AJOUT exclude_merge_commits : True par défaut pour KPI #5.
        Les commits de merge automatiques faussent le Commit Rate.
        """
        q = (
            db.query(func.count(Commit.id))
            .filter(
                Commit.project_id    == project_id,
                Commit.authored_date >= start_date,
                Commit.authored_date <  end_date,
            )
        )
        if exclude_merge_commits:
            q = q.filter(Commit.is_merge_commit.is_(False))

        if site_id is not None:
            q = (
                q.join(Developer, Commit.developer_id == Developer.id)
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
        return q.scalar() or 0

    def count_by_developer_period(
        self,
        db:                    Session,
        developer_id:          int,
        start_date,
        end_date,
        exclude_merge_commits: bool = True,
    ) -> int:
        """
        KPI individuel — commits d'un développeur sur une période.
        Utilisé pour les snapshots individuels (developer_id renseigné).
        """
        q = (
            db.query(func.count(Commit.id))
            .filter(
                Commit.developer_id  == developer_id,
                Commit.authored_date >= start_date,
                Commit.authored_date <  end_date,
            )
        )
        if exclude_merge_commits:
            q = q.filter(Commit.is_merge_commit.is_(False))
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

    def get_last_commit_date(
        self,
        db:         Session,
        project_id: int,
    ) -> Optional[datetime]:
        """
        Date du dernier commit d'un projet.
        Appelé par ExtractionService pour mettre à jour Project.last_commit_date.
        """
        result = (
            db.query(func.max(Commit.authored_date))
            .filter(Commit.project_id == project_id)
            .scalar()
        )
        return result

    def get_unmatched(
        self,
        db:         Session,
        project_id: int,
        limit:      int = 100,
    ) -> List[Commit]:
        """
        Commits sans developer_id — à matcher par l'admin.
        Retournés par GET /commits/unmatched.
        author_name et author_email permettent le matching manuel.
        """
        return (
            db.query(Commit)
            .filter(
                Commit.project_id   == project_id,
                Commit.developer_id.is_(None),
            )
            .order_by(Commit.authored_date.desc())
            .limit(limit)
            .all()
        )

    def get_by_lot(
        self,
        db:     Session,
        lot_id: int,
    ) -> List[Commit]:
        return (
            db.query(Commit)
            .filter(Commit.extraction_lot_id == lot_id)
            .all()
        )

    def get_daily_activity(
        self,
        db:           Session,
        developer_id: int,
        start_date:   datetime,
        end_date:     datetime,
    ) -> List[dict]:
        """
        Heatmap GitHub-style — commits par jour pour un développeur.
        Retourné par GET /analytics/developer/{id}/heatmap.

        Retourne une liste de { "date": "2025-03-15", "count": 4 }
        uniquement pour les jours où le développeur a commité
        (les jours sans activité sont absents — le frontend complète les zéros).
        """
        rows = (
            db.query(
                func.date(Commit.authored_date).label("day"),
                func.count(Commit.id).label("count"),
            )
            .filter(
                Commit.developer_id        == developer_id,
                Commit.authored_date       >= start_date,
                Commit.authored_date       <  end_date,
                Commit.is_merge_commit.is_(False),
            )
            .group_by(func.date(Commit.authored_date))
            .order_by(func.date(Commit.authored_date))
            .all()
        )
        return [{"date": str(row.day), "count": row.count} for row in rows]

    # ── WRITE ─────────────────────────────────────────────────────────────────

    def create(self, db: Session, data: dict) -> Commit:
        commit = Commit(**data)
        db.add(commit)
        db.flush()
        return commit

    def bulk_create(self, db: Session, data_list: List[dict]) -> List[Commit]:
        commits = [Commit(**d) for d in data_list]
        db.add_all(commits)
        db.flush()
        return commits