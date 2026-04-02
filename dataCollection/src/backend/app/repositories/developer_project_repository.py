"""
repositories/developer_project_repository.py

Gestion de la table de jonction Many-to-Many : Developer ↔ Project.

RAISON D'EXISTENCE :
    Remplace les filtres sur Developer.project_id (FK directe supprimée).
    Un développeur peut appartenir à plusieurs projets → table DeveloperProject.

Méthodes principales :
    add()            → ajouter un développeur à un projet
    remove()         → désactiver l'association (is_active=False, pas de DELETE)
    get_by_developer → tous les projets d'un développeur
    get_by_project   → tous les développeurs d'un projet
    exists()         → vérifier si l'association existe déjà
    sync()           → remplacer entièrement la liste des projets d'un développeur
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
        active_only:  bool = True,
    ) -> List[DeveloperProject]:
        """Toutes les associations projet d'un développeur."""
        q = db.query(DeveloperProject).filter(
            DeveloperProject.developer_id == developer_id
        )
        if active_only:
            q = q.filter(DeveloperProject.is_active.is_(True))
        return q.all()

    def get_by_project(
        self,
        db:          Session,
        project_id:  int,
        active_only: bool = True,
    ) -> List[DeveloperProject]:
        """Toutes les associations développeur d'un projet."""
        q = db.query(DeveloperProject).filter(
            DeveloperProject.project_id == project_id
        )
        if active_only:
            q = q.filter(DeveloperProject.is_active.is_(True))
        return q.all()

    def get_association(
        self,
        db:           Session,
        developer_id: int,
        project_id:   int,
    ) -> Optional[DeveloperProject]:
        """Retourne l'association spécifique (ou None)."""
        return (
            db.query(DeveloperProject)
            .filter(
                DeveloperProject.developer_id == developer_id,
                DeveloperProject.project_id   == project_id,
            )
            .one_or_none()
        )

    def exists(
        self,
        db:           Session,
        developer_id: int,
        project_id:   int,
        active_only:  bool = False,
    ) -> bool:
        q = db.query(DeveloperProject.developer_id).filter(
            DeveloperProject.developer_id == developer_id,
            DeveloperProject.project_id   == project_id,
        )
        if active_only:
            q = q.filter(DeveloperProject.is_active.is_(True))
        return q.first() is not None

    def get_project_ids_for_developer(
        self,
        db:           Session,
        developer_id: int,
        active_only:  bool = True,
    ) -> List[int]:
        """IDs de tous les projets d'un développeur — pour les filtres KPI."""
        q = db.query(DeveloperProject.project_id).filter(
            DeveloperProject.developer_id == developer_id
        )
        if active_only:
            q = q.filter(DeveloperProject.is_active.is_(True))
        return [row.project_id for row in q.all()]

    def get_developer_ids_for_project(
        self,
        db:          Session,
        project_id:  int,
        active_only: bool = True,
    ) -> List[int]:
        """IDs de tous les développeurs d'un projet — pour les filtres KPI."""
        q = db.query(DeveloperProject.developer_id).filter(
            DeveloperProject.project_id == project_id
        )
        if active_only:
            q = q.filter(DeveloperProject.is_active.is_(True))
        return [row.developer_id for row in q.all()]

    def count_active_developers(
        self,
        db:         Session,
        project_id: int,
    ) -> int:
        """Nombre de développeurs actifs dans un projet."""
        return (
            db.query(DeveloperProject)
            .filter(
                DeveloperProject.project_id == project_id,
                DeveloperProject.is_active.is_(True),
            )
            .count()
        )

    # ── WRITE ─────────────────────────────────────────────────────────────────

    def add(
        self,
        db:           Session,
        developer_id: int,
        project_id:   int,
    ) -> DeveloperProject:
        """
        Ajoute un développeur à un projet.
        Si l'association existe mais est inactive → la réactive.
        Si elle existe et est active → retourne l'existante.
        """
        existing = self.get_association(db, developer_id, project_id)
        if existing:
            if not existing.is_active:
                existing.is_active = True
                existing.joined_at = datetime.now(timezone.utc)
                db.flush()
            return existing

        assoc = DeveloperProject(
            developer_id = developer_id,
            project_id   = project_id,
            is_active    = True,
        )
        db.add(assoc)
        db.flush()
        return assoc

    def remove(
        self,
        db:           Session,
        developer_id: int,
        project_id:   int,
    ) -> bool:
        """
        Désactive l'association (is_active=False) sans supprimer le row.
        Conserve l'historique pour les KPIs des périodes passées.
        """
        assoc = self.get_association(db, developer_id, project_id)
        if not assoc:
            return False
        assoc.is_active = False
        db.flush()
        return True

    def sync(
        self,
        db:           Session,
        developer_id: int,
        project_ids:  List[int],
    ) -> List[DeveloperProject]:
        """
        Synchronise la liste des projets d'un développeur.
        - Ajoute les nouveaux
        - Désactive ceux qui ne sont plus dans la liste
        - Ne supprime rien (historique préservé)
        Retourne la liste finale des associations actives.
        """
        current = self.get_by_developer(db, developer_id, active_only=False)
        current_map = {a.project_id: a for a in current}

        desired_ids = set(project_ids)
        current_active = {pid for pid, a in current_map.items() if a.is_active}

        # Activer les nouvelles associations
        for pid in desired_ids - current_active:
            if pid in current_map:
                current_map[pid].is_active = True
            else:
                db.add(DeveloperProject(developer_id=developer_id, project_id=pid))

        # Désactiver celles qui ne sont plus souhaitées
        for pid in current_active - desired_ids:
            current_map[pid].is_active = False

        db.flush()
        return self.get_by_developer(db, developer_id, active_only=True)