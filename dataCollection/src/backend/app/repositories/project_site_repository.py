"""
repositories/project_site_repository.py

"""
from typing import List, Optional

from sqlalchemy.orm import Session

from app.models.project_site import ProjectSite
from app.repositories.base import BaseRepository


class ProjectSiteRepository(BaseRepository[ProjectSite]):

    def __init__(self):
        super().__init__(ProjectSite)

    # ── READ ──────────────────────────────────────────────────────────────────

    def get_by_project(
        self,
        db:         Session,
        project_id: int,
    ) -> List[ProjectSite]:
        """Tous les sites associés à un projet."""
        return (
            db.query(ProjectSite)
            .filter(ProjectSite.project_id == project_id)
            .all()
        )

    def get_by_site(
        self,
        db:      Session,
        site_id: int,
    ) -> List[ProjectSite]:
        """Tous les projets associés à un site."""
        return (
            db.query(ProjectSite)
            .filter(ProjectSite.site_id == site_id)
            .all()
        )

    def get_association(
        self,
        db:         Session,
        project_id: int,
        site_id:    int,
    ) -> Optional[ProjectSite]:
        return (
            db.query(ProjectSite)
            .filter(
                ProjectSite.project_id == project_id,
                ProjectSite.site_id    == site_id,
            )
            .one_or_none()
        )

    def get_site_ids_for_project(
        self,
        db:         Session,
        project_id: int,
    ) -> List[int]:
        """IDs des sites d'un projet — pour les réponses API."""
        return [
            row.site_id
            for row in db.query(ProjectSite.site_id)
            .filter(ProjectSite.project_id == project_id)
            .all()
        ]

    def get_discovered_site_ids(
        self,
        db:         Session,
        project_id: int,
    ) -> List[int]:
        """
        [SENIOR AUTO-DISCOVERY]
        Récupère les IDs des sites basés sur les développeurs ACTIFS du projet.
        LOGIQUE : Project -> DeveloperProject -> Developer -> DeveloperSite -> Site
        """
        from app.models.developer_project import DeveloperProject
        from app.models.developer_site    import DeveloperSite
        
        return [
            row.site_id
            for row in db.query(DeveloperSite.site_id)
            .join(DeveloperProject, DeveloperProject.developer_id == DeveloperSite.developer_id)
            .filter(
                DeveloperProject.project_id == project_id,
                DeveloperProject.is_active.is_(True)
            )
            .distinct()
            .all()
        ]


    def get_project_ids_for_site(
        self,
        db:      Session,
        site_id: int,
    ) -> List[int]:
        """
        IDs des projets d'un site.
        KPI #6 : itérer sur les projets d'un site pour NB commits par projet.
        """
        return [
            row.project_id
            for row in db.query(ProjectSite.project_id)
            .filter(ProjectSite.site_id == site_id)
            .all()
        ]

    def exists(
        self,
        db:         Session,
        project_id: int,
        site_id:    int,
    ) -> bool:
        return (
            db.query(ProjectSite.project_id)
            .filter(
                ProjectSite.project_id == project_id,
                ProjectSite.site_id    == site_id,
            )
            .first() is not None
        )

    # ── WRITE ─────────────────────────────────────────────────────────────────

    def add(
        self,
        db:         Session,
        project_id: int,
        site_id:    int,
    ) -> ProjectSite:
        """Associe un projet à un site. Idempotent si déjà associé."""
        existing = self.get_association(db, project_id, site_id)
        if existing:
            return existing
        assoc = ProjectSite(project_id=project_id, site_id=site_id)
        db.add(assoc)
        db.flush()
        return assoc

    def remove(
        self,
        db:         Session,
        project_id: int,
        site_id:    int,
    ) -> bool:
        """Dissocie un projet d'un site."""
        assoc = self.get_association(db, project_id, site_id)
        if not assoc:
            return False
        db.delete(assoc)
        db.flush()
        return True

    def sync(
        self,
        db:         Session,
        project_id: int,
        site_ids:   List[int],
    ) -> List[ProjectSite]:
        """
        Synchronise la liste des sites d'un projet.
        - Ajoute les nouvelles associations
        - Supprime celles qui ne sont plus dans la liste
        Retourne la liste finale des associations.
        """
        current  = self.get_by_project(db, project_id)
        current_ids = {a.site_id for a in current}
        desired_ids = set(site_ids)

        # Supprimer les sites retirés
        for assoc in current:
            if assoc.site_id not in desired_ids:
                db.delete(assoc)

        # Ajouter les nouveaux
        for sid in desired_ids - current_ids:
            db.add(ProjectSite(project_id=project_id, site_id=sid))

        db.flush()
        return self.get_by_project(db, project_id)