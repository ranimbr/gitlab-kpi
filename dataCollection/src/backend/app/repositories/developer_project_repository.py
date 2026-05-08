"""
repositories/developer_project_repository.py

"""
from datetime import datetime, timezone
from typing import List, Optional

from sqlalchemy.orm import Session, joinedload

from app.models.developer_project import DeveloperProject
from app.repositories.base import BaseRepository


class DeveloperProjectRepository(BaseRepository[DeveloperProject]):

    def __init__(self):
        super().__init__(DeveloperProject)

    # ── READ ──────────────────────────────────────────────────────────────────

    def get_by_developer(
        self,
        db:           Session,
        developer_id: int,
        period_id:    Optional[int] = None,
        active_only:  bool = True,
    ) -> List[DeveloperProject]:
        """Toutes les associations projet d'un développeur pour une période."""
        q = db.query(DeveloperProject).filter(
            DeveloperProject.developer_id == developer_id
        )
        if period_id:
            q = q.filter(DeveloperProject.period_id == period_id)
        if active_only:
            q = q.filter(DeveloperProject.is_active.is_(True))
        return q.all()

    def get_by_project(
        self,
        db:          Session,
        project_id:  int,
        period_id:   Optional[int] = None,
        active_only: bool = True,
    ) -> List[DeveloperProject]:
        """Toutes les associations développeur d'un projet pour une période."""
        q = db.query(DeveloperProject).filter(
            DeveloperProject.project_id == project_id
        )
        if period_id:
            q = q.filter(DeveloperProject.period_id == period_id)
        if active_only:
            q = q.filter(DeveloperProject.is_active.is_(True))
        return q.all()

    def get_association(
        self,
        db:           Session,
        developer_id: int,
        project_id:   int,
        period_id:    int,
    ) -> Optional[DeveloperProject]:
        """Retourne l'association spécifique (ou None)."""
        return (
            db.query(DeveloperProject)
            .filter(
                DeveloperProject.developer_id == developer_id,
                DeveloperProject.project_id   == project_id,
                DeveloperProject.period_id    == period_id,
            )
            .one_or_none()
        )

    def exists(
        self,
        db:           Session,
        developer_id: int,
        project_id:   int,
        period_id:    int,
        active_only:  bool = False,
    ) -> bool:
        q = db.query(DeveloperProject.developer_id).filter(
            DeveloperProject.developer_id == developer_id,
            DeveloperProject.project_id   == project_id,
            DeveloperProject.period_id    == period_id,
        )
        if active_only:
            q = q.filter(DeveloperProject.is_active.is_(True))
        return q.first() is not None

    # ── WRITE ─────────────────────────────────────────────────────────────────

    def add(
        self,
        db:           Session,
        developer_id: int,
        project_id:   int,
        period_id:    int,
    ) -> DeveloperProject:
        """
        Ajoute un développeur à un projet pour une période.
        """
        existing = self.get_association(db, developer_id, project_id, period_id)
        if existing:
            if not existing.is_active:
                existing.is_active = True
                existing.joined_at = datetime.now(timezone.utc)
                db.flush()
            return existing

        assoc = DeveloperProject(
            developer_id = developer_id,
            project_id   = project_id,
            period_id    = period_id,
            is_active    = True,
        )
        db.add(assoc)
        db.flush()
        return assoc

    def sync_for_period(
        self,
        db:           Session,
        developer_id: int,
        project_ids:  List[int],
        period_id:    int,
    ) -> List[DeveloperProject]:
        """
        [SENIOR SYNC] Mirroring strict par période.
        Remplace la liste des missions d'un dev pour un mois donné.
        """
        # 1. On récupère l'état actuel pour CE dev et CETTE période
        current = self.get_by_developer(db, developer_id, period_id=period_id, active_only=False)
        current_map = {a.project_id: a for a in current}

        desired_ids = set(project_ids)
        current_active = {pid for pid, a in current_map.items() if a.is_active}

        # 2. Activer / Créer les nouvelles
        for pid in desired_ids:
            if pid in current_map:
                current_map[pid].is_active = True
            else:
                db.add(DeveloperProject(
                    developer_id=developer_id, 
                    project_id=pid, 
                    period_id=period_id,
                    is_active=True
                ))

        # 3. Désactiver les missions qui ne sont plus dans le CSV pour ce mois
        for pid in current_active - desired_ids:
            current_map[pid].is_active = False

        db.flush()
        return self.get_by_developer(db, developer_id, period_id=period_id, active_only=True)