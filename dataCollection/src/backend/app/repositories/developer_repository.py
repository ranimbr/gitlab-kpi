"""
repositories/developer_repository.py

CORRECTIONS :
    1. DeveloperGroupRepository.get_by_site_id() :
       Retournait Optional[DeveloperGroup] avec one_or_none().
       Problème : plusieurs groupes peuvent exister pour un même (site, project).
       ✅ FIX : retourne List[DeveloperGroup] avec .all()

    2. DeveloperRepository.update() : utilise base.update() corrigé
       (accepte None pour mettre un champ à NULL)
"""

from typing import Optional, List

from sqlalchemy import func
from sqlalchemy.orm import Session, joinedload

from app.models.developer import Developer
from app.models.developer_group import DeveloperGroup
from app.repositories.base import BaseRepository


class DeveloperRepository(BaseRepository[Developer]):

    def __init__(self):
        super().__init__(Developer)

    # ─────────────────────────────────────────────────────────────────────────
    # READ
    # ─────────────────────────────────────────────────────────────────────────

    def get_by_id(self, db: Session, obj_id: int) -> Optional[Developer]:
        """Override pour eager-load group et site."""
        return (
            db.query(Developer)
            .options(joinedload(Developer.group), joinedload(Developer.site))
            .filter(Developer.id == obj_id)
            .one_or_none()
        )

    def get_by_tab(
        self,
        db:         Session,
        tab:        str           = "validated",
        project_id: Optional[int] = None,
        site_id:    Optional[int] = None,
    ) -> List[Developer]:
        """
        Filtre par onglet UI :
            validated → pour les KPIs (is_validated=True, is_bot=False, is_active=True)
            pending   → à valider par l'admin
            bots      → exclus des KPIs
            all       → tous
        """
        q = (
            db.query(Developer)
            .options(joinedload(Developer.group), joinedload(Developer.site))
        )

        if tab == "validated":
            q = q.filter(
                Developer.is_validated.is_(True),
                Developer.is_bot.is_(False),
                Developer.is_active.is_(True),
            )
        elif tab == "pending":
            q = q.filter(
                Developer.is_validated.is_(False),
                Developer.is_bot.is_(False),
            )
        elif tab == "bots":
            q = q.filter(Developer.is_bot.is_(True))
        # tab == "all" → pas de filtre

        if project_id is not None:
            q = q.filter(Developer.project_id == project_id)
        if site_id is not None:
            q = q.filter(Developer.site_id == site_id)

        return q.order_by(Developer.name).all()

    def get_summary(
        self,
        db:         Session,
        project_id: Optional[int] = None,
    ) -> dict:
        """Compteurs par onglet — badges de la page Développeurs."""
        q_base = db.query(Developer)
        if project_id:
            q_base = q_base.filter(Developer.project_id == project_id)

        validated = q_base.filter(
            Developer.is_validated.is_(True),
            Developer.is_bot.is_(False),
            Developer.is_active.is_(True),
        ).count()

        pending = q_base.filter(
            Developer.is_validated.is_(False),
            Developer.is_bot.is_(False),
        ).count()

        bots  = q_base.filter(Developer.is_bot.is_(True)).count()
        total = q_base.count()

        return {"validated": validated, "pending": pending, "bots": bots, "total": total}

    def get_all(self, db: Session, active_only: bool = True) -> List[Developer]:
        q = (
            db.query(Developer)
            .options(joinedload(Developer.group), joinedload(Developer.site))
        )
        if active_only:
            q = q.filter(
                Developer.is_validated.is_(True),
                Developer.is_bot.is_(False),
                Developer.is_active.is_(True),
            )
        return q.all()

    def get_project_developers(
        self,
        db:          Session,
        project_id:  int,
        active_only: bool = True,
    ) -> List[Developer]:
        q = (
            db.query(Developer)
            .options(joinedload(Developer.group), joinedload(Developer.site))
            .filter(Developer.project_id == project_id)
        )
        if active_only:
            q = q.filter(
                Developer.is_validated.is_(True),
                Developer.is_bot.is_(False),
                Developer.is_active.is_(True),
            )
        return q.all()

    def get_by_gitlab_user_id(
        self,
        db:             Session,
        gitlab_user_id: int,
        project_id:     int,
    ) -> Optional[Developer]:
        return (
            db.query(Developer)
            .filter(
                Developer.gitlab_user_id == gitlab_user_id,
                Developer.project_id     == project_id,
            )
            .one_or_none()
        )

    def get_by_username(
        self,
        db:         Session,
        username:   str,
        project_id: int,
    ) -> Optional[Developer]:
        return (
            db.query(Developer)
            .filter(
                Developer.username   == username,
                Developer.project_id == project_id,
            )
            .one_or_none()
        )

    def get_by_email(
        self,
        db:         Session,
        email:      str,
        project_id: int,
    ) -> Optional[Developer]:
        return (
            db.query(Developer)
            .filter(
                Developer.email.isnot(None),
                Developer.email      == email,
                Developer.project_id == project_id,
            )
            .one_or_none()
        )

    def get_by_site_id(
        self,
        db:          Session,
        site_id:     int,
        project_id:  int,
        active_only: bool = True,
    ) -> List[Developer]:
        q = (
            db.query(Developer)
            .options(joinedload(Developer.group), joinedload(Developer.site))
            .filter(
                Developer.site_id    == site_id,
                Developer.project_id == project_id,
            )
        )
        if active_only:
            q = q.filter(
                Developer.is_validated.is_(True),
                Developer.is_bot.is_(False),
                Developer.is_active.is_(True),
            )
        return q.all()

    def count_by_site_id(
        self,
        db:          Session,
        site_id:     int,
        project_id:  int,
        active_only: bool = True,
    ) -> int:
        """KPI #1 et #5 — nb_developers du site (dénominateur)."""
        q = (
            db.query(func.count(Developer.id))
            .filter(
                Developer.site_id    == site_id,
                Developer.project_id == project_id,
            )
        )
        if active_only:
            q = q.filter(
                Developer.is_validated.is_(True),
                Developer.is_bot.is_(False),
                Developer.is_active.is_(True),
            )
        return q.scalar() or 0

    def count_by_project(
        self,
        db:          Session,
        project_id:  int,
        active_only: bool = True,
    ) -> int:
        q = db.query(func.count(Developer.id)).filter(
            Developer.project_id == project_id
        )
        if active_only:
            q = q.filter(
                Developer.is_validated.is_(True),
                Developer.is_bot.is_(False),
                Developer.is_active.is_(True),
            )
        return q.scalar() or 0

    # ─────────────────────────────────────────────────────────────────────────
    # WRITE
    # ─────────────────────────────────────────────────────────────────────────

    def create(self, db: Session, data: dict) -> Developer:
        developer = Developer(**data)
        db.add(developer)
        db.flush()
        return developer


# =============================================================================
# DeveloperGroup Repository
# =============================================================================

class DeveloperGroupRepository(BaseRepository[DeveloperGroup]):

    def __init__(self):
        super().__init__(DeveloperGroup)

    def get_by_site_id(
        self,
        db:         Session,
        site_id:    int,
        project_id: int,
    ) -> List[DeveloperGroup]:
        """
        ✅ FIX : retourne List[DeveloperGroup] (plus Optional).
        Plusieurs groupes peuvent exister pour un même (site, project).
        L'ancien one_or_none() lançait une exception si > 1 résultat.
        """
        return (
            db.query(DeveloperGroup)
            .options(joinedload(DeveloperGroup.site))
            .filter(
                DeveloperGroup.site_id    == site_id,
                DeveloperGroup.project_id == project_id,
            )
            .all()
        )

    def get_first_by_site_id(
        self,
        db:         Session,
        site_id:    int,
        project_id: int,
    ) -> Optional[DeveloperGroup]:
        """
        Retourne le premier groupe d'un site (cas simple — 1 groupe par site).
        Utiliser get_by_site_id() si plusieurs groupes sont possibles.
        """
        return (
            db.query(DeveloperGroup)
            .filter(
                DeveloperGroup.site_id    == site_id,
                DeveloperGroup.project_id == project_id,
            )
            .first()
        )

    def get_project_groups(
        self,
        db:         Session,
        project_id: int,
    ) -> List[DeveloperGroup]:
        return (
            db.query(DeveloperGroup)
            .options(joinedload(DeveloperGroup.site))
            .filter(DeveloperGroup.project_id == project_id)
            .order_by(DeveloperGroup.name)
            .all()
        )

    def get_by_manager(
        self,
        db:         Session,
        manager_id: int,
    ) -> List[DeveloperGroup]:
        return (
            db.query(DeveloperGroup)
            .options(joinedload(DeveloperGroup.site))
            .filter(DeveloperGroup.manager_id == manager_id)
            .all()
        )

    def get_all_site_ids(
        self,
        db:         Session,
        project_id: int,
    ) -> List[int]:
        """Retourne les site_ids distincts d'un projet — pour itérer les KPIs par site."""
        rows = (
            db.query(DeveloperGroup.site_id)
            .filter(
                DeveloperGroup.project_id == project_id,
                DeveloperGroup.site_id.isnot(None),
            )
            .distinct()
            .all()
        )
        return [r.site_id for r in rows]