from sqlalchemy.orm import Session
from typing import Optional, List

from app.models.developer import Developer
from app.models.developer_group import DeveloperGroup
from app.repositories.base import BaseRepository


class DeveloperRepository(BaseRepository[Developer]):

    def __init__(self):
        super().__init__(Developer)

    def get_by_gitlab_user_id(
        self,
        db: Session,
        gitlab_user_id: int,
        project_id: int
    ) -> Optional[Developer]:
        return (
            db.query(Developer)
            .filter(
                Developer.gitlab_user_id == gitlab_user_id,
                Developer.project_id == project_id
            )
            .one_or_none()
        )

    def get_by_username(
        self,
        db: Session,
        username: str,
        project_id: int
    ) -> Optional[Developer]:
        return (
            db.query(Developer)
            .filter(
                Developer.username == username,
                Developer.project_id == project_id
            )
            .one_or_none()
        )

    def get_by_email(
        self,
        db: Session,
        email: str,
        project_id: int
    ) -> Optional[Developer]:
        """
        email peut être NULL en base.
        On filtre donc explicitement les NULL pour éviter
        les comparaisons SQL invalides.
        """
        return (
            db.query(Developer)
            .filter(
                Developer.email.isnot(None),
                Developer.email == email,
                Developer.project_id == project_id
            )
            .one_or_none()
        )

    def get_project_developers(
        self,
        db: Session,
        project_id: int
    ) -> List[Developer]:
        return (
            db.query(Developer)
            .filter(Developer.project_id == project_id)
            .all()
        )

    def get_by_site(
        self,
        db: Session,
        site: str,
        project_id: int
    ) -> List[Developer]:
        """
        Retourne tous les développeurs d'un site pour un projet donné.
        Utilisé par KpiCalculator pour compter nb_developers par site.
        """
        return (
            db.query(Developer)
            .filter(
                Developer.site == site,
                Developer.project_id == project_id
            )
            .all()
        )

    def count_by_site(
        self,
        db: Session,
        site: str,
        project_id: int
    ) -> int:
        """
        KPI #1 et KPI #5 — dénominateur :
        nombre de développeurs par site.
        """
        from sqlalchemy import func

        return (
            db.query(func.count(Developer.id))
            .filter(
                Developer.site == site,
                Developer.project_id == project_id
            )
            .scalar() or 0
        )

    def count_by_project(
        self,
        db: Session,
        project_id: int
    ) -> int:
        from sqlalchemy import func

        return (
            db.query(func.count(Developer.id))
            .filter(Developer.project_id == project_id)
            .scalar() or 0
        )


class DeveloperGroupRepository(BaseRepository[DeveloperGroup]):

    def __init__(self):
        super().__init__(DeveloperGroup)

    def get_by_site(
        self,
        db: Session,
        site: str,
        project_id: int
    ) -> Optional[DeveloperGroup]:
        return (
            db.query(DeveloperGroup)
            .filter(
                DeveloperGroup.site == site,
                DeveloperGroup.project_id == project_id
            )
            .one_or_none()
        )

    def get_project_groups(
        self,
        db: Session,
        project_id: int
    ) -> List[DeveloperGroup]:
        return (
            db.query(DeveloperGroup)
            .filter(DeveloperGroup.project_id == project_id)
            .all()
        )

    def get_all_sites(
        self,
        db: Session,
        project_id: int
    ) -> List[str]:
        """
        Retourne la liste des sites distincts pour un projet.
        """
        rows = (
            db.query(DeveloperGroup.site)
            .filter(DeveloperGroup.project_id == project_id)
            .distinct()
            .all()
        )

        return [r.site for r in rows]