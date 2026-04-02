"""
repositories/developer_repository.py — AJOUT v5

SEULE MODIFICATION : ajout de create_from_import() dans DeveloperGroupRepository.
    Crée un groupe minimal depuis l'import CSV.
    Identique à site_repository.create_from_import() dans son principe.

Tout le reste est identique à la version précédente.
"""

# ── À AJOUTER dans la classe DeveloperGroupRepository ────────────────────────
# Copiez ce bloc DANS la classe DeveloperGroupRepository existante,
# après la méthode get_all() :

"""
    def create_from_import(self, db: Session, name: str) -> "DeveloperGroup":
        \"\"\"
        ✅ NOUVEAU : Crée un groupe minimal depuis un import CSV.

        Règles métier :
          - name        → conservé tel quel (casse du CSV)
          - site_id     → None  (l'admin associera le groupe à un site manuellement)
          - description → message invitant l'admin à compléter
          - manager_id  → None

        Race condition : si deux lignes du CSV référencent le même groupe,
        la 2ème trouve le groupe déjà créé via get_by_name_ilike().

        Ne fait pas db.commit() — laissé à l'appelant (import_from_file).
        \"\"\"
        existing = self.get_by_name_ilike(db, name)
        if existing:
            return existing

        group = DeveloperGroup(
            name        = name.strip(),
            manager_id  = None,
            description = "Créé depuis l'import CSV développeurs — à compléter dans Administration → Groupes",
        )
        db.add(group)
        db.flush()
        return group

    def get_by_name_ilike(self, db: Session, name: str) -> Optional["DeveloperGroup"]:
        \"\"\"
        ✅ NOUVEAU : Lookup case-insensitive par nom.
        Utilisé par create_from_import() pour la race-condition check.
        \"\"\"
        return (
            db.query(DeveloperGroup)
            .filter(DeveloperGroup.name.ilike(name))
            .one_or_none()
        )

    def get_all(self, db: Session) -> List[DeveloperGroup]:
        return (
            db.query(DeveloperGroup)
            .options(joinedload(DeveloperGroup.sites))
            .order_by(DeveloperGroup.name)
            .all()
        )
"""

# ── VERSION COMPLÈTE DU FICHIER ───────────────────────────────────────────────

from datetime import datetime, timezone
from typing import Optional, List

from sqlalchemy import func
from sqlalchemy.orm import Session, joinedload

from app.models.developer import Developer
from app.models.developer_group import DeveloperGroup
from app.models.developer_project import DeveloperProject
from app.models.developer_site import DeveloperSite
from app.repositories.base import BaseRepository


class DeveloperRepository(BaseRepository[Developer]):

    def __init__(self):
        super().__init__(Developer)

    def get_by_id(self, db: Session, obj_id: int) -> Optional[Developer]:
        return (
            db.query(Developer)
            .options(
                joinedload(Developer.group),
                joinedload(Developer.site_associations),
                joinedload(Developer.project_associations),
            )
            .filter(Developer.id == obj_id)
            .one_or_none()
        )

    def get_by_tab(
        self,
        db:               Session,
        tab:              str           = "validated",
        project_id:       Optional[int] = None,
        site_id:          Optional[int] = None,
        gitlab_config_id: Optional[int] = None,
    ) -> List[Developer]:
        q = db.query(Developer).options(joinedload(Developer.group))

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
        elif tab == "extraction":
            # ✅ NOUVEAU : On veut tous les humains (validés ET en attente) pour l'extraction
            q = q.filter(Developer.is_bot.is_(False))

        if project_id is not None:
            q = q.join(
                DeveloperProject,
                (DeveloperProject.developer_id == Developer.id) &
                (DeveloperProject.project_id   == project_id) &
                (DeveloperProject.is_active.is_(True)),
            )
        elif gitlab_config_id is not None:
            # ✅ NOUVEAU : Filter by ALL projects belonging to a GitLab instance
            from app.models.project import Project
            q = q.join(
                DeveloperProject,
                (DeveloperProject.developer_id == Developer.id) &
                (DeveloperProject.is_active.is_(True)),
            ).join(
                Project,
                (Project.id == DeveloperProject.project_id) &
                (Project.gitlab_config_id == gitlab_config_id)
            )

        if site_id is not None:
            q = q.join(
                DeveloperSite,
                (DeveloperSite.developer_id == Developer.id) &
                (DeveloperSite.site_id      == site_id),
            )

        return q.order_by(Developer.name).all()

    def get_summary(
        self,
        db:               Session,
        project_id:       Optional[int] = None,
        site_id:          Optional[int] = None,
        gitlab_config_id: Optional[int] = None,
    ) -> dict:
        q_base = db.query(Developer)
        if project_id is not None:
            q_base = q_base.join(
                DeveloperProject,
                (DeveloperProject.developer_id == Developer.id) &
                (DeveloperProject.project_id   == project_id) &
                (DeveloperProject.is_active.is_(True)),
            )
        elif gitlab_config_id is not None:
            from app.models.project import Project
            q_base = q_base.join(
                DeveloperProject,
                (DeveloperProject.developer_id == Developer.id) &
                (DeveloperProject.is_active.is_(True)),
            ).join(
                Project,
                (Project.id == DeveloperProject.project_id) &
                (Project.gitlab_config_id == gitlab_config_id)
            )

        if site_id is not None:
            q_base = q_base.join(
                DeveloperSite,
                (DeveloperSite.developer_id == Developer.id) &
                (DeveloperSite.site_id      == site_id),
            )
        validated = q_base.filter(Developer.is_validated.is_(True), Developer.is_bot.is_(False), Developer.is_active.is_(True)).count()
        pending   = q_base.filter(Developer.is_validated.is_(False), Developer.is_bot.is_(False)).count()
        bots      = q_base.filter(Developer.is_bot.is_(True)).count()
        total     = q_base.count()
        return {"validated": validated, "pending": pending, "bots": bots, "total": total}

    def get_all(self, db: Session, active_only: bool = True) -> List[Developer]:
        q = db.query(Developer).options(joinedload(Developer.group))
        if active_only:
            q = q.filter(
                Developer.is_validated.is_(True),
                Developer.is_bot.is_(False),
                Developer.is_active.is_(True),
            )
        return q.order_by(Developer.name).all()

    def get_by_project(self, db: Session, project_id: int, active_only: bool = True) -> List[Developer]:
        q = (
            db.query(Developer)
            .options(joinedload(Developer.group))
            .join(
                DeveloperProject,
                (DeveloperProject.developer_id == Developer.id) &
                (DeveloperProject.project_id   == project_id) &
                (DeveloperProject.is_active.is_(True)),
            )
        )
        if active_only:
            q = q.filter(
                Developer.is_validated.is_(True),
                Developer.is_bot.is_(False),
                Developer.is_active.is_(True),
            )
        return q.order_by(Developer.name).all()

    def get_project_developers(self, db: Session, project_id: int, active_only: bool = True) -> List[Developer]:
        return self.get_by_project(db, project_id, active_only)

    def get_by_site(self, db: Session, site_id: int, active_only: bool = True) -> List[Developer]:
        q = (
            db.query(Developer)
            .options(joinedload(Developer.group))
            .join(
                DeveloperSite,
                (DeveloperSite.developer_id == Developer.id) &
                (DeveloperSite.site_id      == site_id),
            )
        )
        if active_only:
            q = q.filter(
                Developer.is_validated.is_(True),
                Developer.is_bot.is_(False),
                Developer.is_active.is_(True),
            )
        return q.order_by(Developer.name).all()

    def get_by_site_id(self, db: Session, site_id: int, project_id: int = None, active_only: bool = True) -> List[Developer]:
        return self.get_by_site(db, site_id, active_only)

    def count_by_site(self, db: Session, site_id: int, active_only: bool = True, primary_only: bool = False) -> int:
        q = (
            db.query(func.count(Developer.id))
            .join(DeveloperSite, (DeveloperSite.developer_id == Developer.id) & (DeveloperSite.site_id == site_id))
        )
        if primary_only:
            q = q.filter(DeveloperSite.is_primary.is_(True))
        if active_only:
            q = q.filter(Developer.is_validated.is_(True), Developer.is_bot.is_(False), Developer.is_active.is_(True))
        return q.scalar() or 0

    def count_by_site_id(self, db: Session, site_id: int, project_id: int = None, active_only: bool = True) -> int:
        return self.count_by_site(db, site_id, active_only)

    def count_by_project(self, db: Session, project_id: int, active_only: bool = True) -> int:
        q = (
            db.query(func.count(Developer.id))
            .join(DeveloperProject,
                (DeveloperProject.developer_id == Developer.id) &
                (DeveloperProject.project_id   == project_id) &
                (DeveloperProject.is_active.is_(True)))
        )
        if active_only:
            q = q.filter(Developer.is_validated.is_(True), Developer.is_bot.is_(False), Developer.is_active.is_(True))
        return q.scalar() or 0

    def get_by_gitlab_user_id(self, db: Session, gitlab_user_id: int) -> Optional[Developer]:
        return db.query(Developer).filter(Developer.gitlab_user_id == gitlab_user_id).one_or_none()

    def get_by_gitlab_username(self, db: Session, gitlab_username: str) -> Optional[Developer]:
        return db.query(Developer).filter(Developer.gitlab_username == gitlab_username).one_or_none()

    def get_by_username(self, db: Session, username: str) -> Optional[Developer]:
        return db.query(Developer).filter(Developer.name == username).one_or_none()

    def get_by_email(self, db: Session, email: str) -> Optional[Developer]:
        return db.query(Developer).filter(Developer.email.isnot(None), Developer.email == email).one_or_none()

    def get_inactive(self, db: Session, days: int = 14) -> List[Developer]:
        from datetime import timedelta
        cutoff = datetime.now(timezone.utc) - timedelta(days=days)
        return (
            db.query(Developer)
            .filter(
                Developer.is_active.is_(True),
                Developer.is_validated.is_(True),
                Developer.is_bot.is_(False),
                (Developer.last_active_at.is_(None)) | (Developer.last_active_at < cutoff),
            )
            .all()
        )

    def update_last_active(self, db: Session, developer_id: int) -> None:
        db.query(Developer).filter(Developer.id == developer_id).update(
            {"last_active_at": datetime.now(timezone.utc)},
            synchronize_session="fetch",
        )

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

    def get_by_site_id(self, db: Session, site_id: int) -> List[DeveloperGroup]:
        from app.models.site import Site
        return (
            db.query(DeveloperGroup)
            .options(joinedload(DeveloperGroup.sites))
            .filter(DeveloperGroup.sites.any(Site.id == site_id))
            .order_by(DeveloperGroup.name)
            .all()
        )

    def get_by_id(self, db: Session, obj_id: int) -> Optional[DeveloperGroup]:
        return (
            db.query(DeveloperGroup)
            .options(joinedload(DeveloperGroup.sites))
            .filter(DeveloperGroup.id == obj_id)
            .one_or_none()
        )

    def get_all_by_site(self, db: Session, site_id: int) -> List[DeveloperGroup]:
        return self.get_by_site_id(db, site_id)

    def get_by_manager(self, db: Session, manager_id: int) -> List[DeveloperGroup]:
        return (
            db.query(DeveloperGroup)
            .options(joinedload(DeveloperGroup.sites))
            .filter(DeveloperGroup.manager_id == manager_id)
            .all()
        )

    def get_all_site_ids(self, db: Session) -> List[int]:
        from app.models.developer_group import developer_group_site_table
        rows = (
            db.query(developer_group_site_table.c.site_id)
            .distinct()
            .all()
        )
        return [r.site_id for r in rows]

    def get_all(self, db: Session) -> List[DeveloperGroup]:
        return (
            db.query(DeveloperGroup)
            .options(joinedload(DeveloperGroup.sites))
            .order_by(DeveloperGroup.name)
            .all()
        )

    # ── ✅ NOUVEAU v5 ──────────────────────────────────────────────────────────

    def get_by_name_ilike(self, db: Session, name: str) -> Optional[DeveloperGroup]:
        """
        Lookup case-insensitive par nom.
        Utilisé par create_from_import() pour la race-condition check
        et par import_from_file() pour la résolution des noms du CSV.
        """
        return (
            db.query(DeveloperGroup)
            .filter(DeveloperGroup.name.ilike(name))
            .one_or_none()
        )

    def create_from_import(self, db: Session, name: str) -> DeveloperGroup:
        """
        ✅ NOUVEAU : Crée un groupe minimal depuis un import CSV.

        Règles métier :
          - name        → conservé tel quel (casse du CSV)
          - site_id     → None (l'admin associera le groupe manuellement)
          - manager_id  → None
          - description → message invitant l'admin à compléter

        Race condition gérée via get_by_name_ilike().
        Ne fait pas db.commit() — laissé à l'appelant.
        """
        existing = self.get_by_name_ilike(db, name)
        if existing:
            return existing

        group = DeveloperGroup(
            name        = name.strip(),
            manager_id  = None,
            description = (
                "Créé depuis l'import CSV développeurs — "
                "à compléter dans Administration → Développeurs → Groupes"
            ),
        )
        db.add(group)
        db.flush()
        return group