"""
repositories/developer_repository.py — AJOUT v5

"""

# ── VERSION COMPLÈTE DU FICHIER ───────────────────────────────────────────────

from datetime import datetime, timezone
from typing import Optional, List, Union

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
                joinedload(Developer.groups),
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
        period_id:        Optional[int] = None,
        active_only:      bool          = False,
    ) -> List[Developer]:
        q = db.query(Developer).options(
            joinedload(Developer.groups),
            joinedload(Developer.site_associations).joinedload(DeveloperSite.site),
            joinedload(Developer.project_associations).joinedload(DeveloperProject.project)
        )

        if tab == "validated":
            q = q.filter(
                Developer.is_validated.is_(True),
                Developer.is_bot.is_(False)
            )
        elif tab == "pending":
            q = q.filter(
                Developer.is_validated.is_(False),
                Developer.is_bot.is_(False),
            )
        elif tab == "bots":
            q = q.filter(Developer.is_bot.is_(True))
        elif tab == "extraction":
            #  NOUVEAU : On veut tous les humains (validés ET en attente) pour l'extraction
            q = q.filter(Developer.is_bot.is_(False))

        # FILTRAGE ACTIVITÉ (Optionnel)
        if active_only:
            q = q.filter(Developer.is_active.is_(True))

        # FILTRAGE PAR PÉRIODE 
        if period_id is not None:
            # On ne veut que les développeurs ayant une association pour cette période
            q = q.join(
                DeveloperProject,
                (DeveloperProject.developer_id == Developer.id) &
                (DeveloperProject.period_id    == period_id)
            )
            
            #  AJOUT SENIOR : Filtrage RH strict (Onboarding/Offboarding)
            from app.models.period import Period
            period = db.query(Period).filter(Period.id == period_id).first()
            if period:
                import calendar
                from datetime import date
                start_p = date(period.year, period.month, 1)
                last_d  = calendar.monthrange(period.year, period.month)[1]
                end_p   = date(period.year, period.month, last_d)
                
                # Exclure ceux qui n'ont pas encore commencé ou qui sont déjà partis
                from sqlalchemy import or_
                q = q.filter(
                    or_(Developer.onboarding_date.is_(None), Developer.onboarding_date <= end_p),
                    or_(Developer.offboarding_date.is_(None), Developer.offboarding_date >= start_p)
                )

        if project_id is not None:
            # Si period_id est présent, le join est déjà fait, on ajoute juste la clause project_id
            if period_id is not None:
                q = q.filter(DeveloperProject.project_id == project_id)
            else:
                q = q.join(
                    DeveloperProject,
                    (DeveloperProject.developer_id == Developer.id) &
                    (DeveloperProject.project_id   == project_id) &
                    (DeveloperProject.is_active.is_(True)),
                )
        elif gitlab_config_id is not None:
            from app.models.project import Project
            if period_id is not None:
                q = q.join(
                    Project,
                    (Project.id == DeveloperProject.project_id) &
                    (Project.gitlab_config_id == gitlab_config_id)
                )
            else:
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

        return q.distinct().order_by(Developer.name).all()

    def get_summary(
        self,
        db:               Session,
        project_id:       Optional[int] = None,
        site_id:          Optional[int] = None,
        gitlab_config_id: Optional[int] = None,
        period_id:        Optional[int] = None,
    ) -> dict:
        q_base = db.query(Developer)

        if period_id is not None:
            q_base = q_base.join(
                DeveloperProject,
                (DeveloperProject.developer_id == Developer.id) &
                (DeveloperProject.period_id    == period_id)
            )
            
            #  AJOUT SENIOR : Filtrage RH strict pour le Summary
            from app.models.period import Period
            period = db.query(Period).filter(Period.id == period_id).first()
            if period:
                import calendar
                from datetime import date
                start_p = date(period.year, period.month, 1)
                last_d  = calendar.monthrange(period.year, period.month)[1]
                end_p   = date(period.year, period.month, last_d)
                
                from sqlalchemy import or_
                q_base = q_base.filter(
                    or_(Developer.onboarding_date.is_(None), Developer.onboarding_date <= end_p),
                    or_(Developer.offboarding_date.is_(None), Developer.offboarding_date >= start_p)
                )

        if project_id is not None:
            if period_id is not None:
                q_base = q_base.filter(DeveloperProject.project_id == project_id)
            else:
                q_base = q_base.join(
                    DeveloperProject,
                    (DeveloperProject.developer_id == Developer.id) &
                    (DeveloperProject.project_id   == project_id) &
                    (DeveloperProject.is_active.is_(True)),
                )
        elif gitlab_config_id is not None:
            from app.models.project import Project
            if period_id is not None:
                q_base = q_base.join(
                    Project,
                    (Project.id == DeveloperProject.project_id) &
                    (Project.gitlab_config_id == gitlab_config_id)
                )
            else:
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
        validated = q_base.filter(Developer.is_validated.is_(True), Developer.is_bot.is_(False)).distinct().count()
        pending   = q_base.filter(Developer.is_validated.is_(False), Developer.is_bot.is_(False)).distinct().count()
        bots      = q_base.filter(Developer.is_bot.is_(True)).distinct().count()
        total     = q_base.distinct().count()
        return {"validated": validated, "pending": pending, "bots": bots, "total": total}


    def get_all(self, db: Session, active_only: bool = True) -> List[Developer]:
        q = db.query(Developer).options(joinedload(Developer.groups))
        if active_only:
            q = q.filter(
                Developer.is_validated.is_(True),
                Developer.is_bot.is_(False),
                Developer.is_active.is_(True),
            )
        return q.distinct().order_by(Developer.name).all()

        return q.all()

    def get_active_during_period(self, db: Session, start_date: datetime, end_date: datetime) -> List[Developer]:
        """
        [SENIOR] Identifie les développeurs éligibles pour une période donnée.
        Un développeur est éligible s'il est humain (is_bot=False) et que son
        contrat (onboarding/offboarding) couvre au moins une partie de la période.
        """
        from sqlalchemy import or_, and_
        
        q = db.query(Developer).filter(Developer.is_bot.is_(False))
        
        # Filtre sur les dates de présence si elles sont renseignées
        q = q.filter(
            or_(
                Developer.onboarding_date.is_(None),
                Developer.onboarding_date <= end_date
            ),
            or_(
                Developer.offboarding_date.is_(None),
                Developer.offboarding_date >= start_date
            )
        )
        
        return q.all()

    def get_activity_project_ids(self, db: Session, developer_ids: Union[int, List[int]]) -> List[int]:
        """
        [SENIOR] Découvre TOUS les projets où ces développeurs ont une activité enregistrée.
        Cherche dans :
        1. merge_request (author, reviewer, assignee)
        2. git_commit (author)
        """
        if isinstance(developer_ids, int):
            developer_ids = [developer_ids]

        if not developer_ids:
            return []

        from app.models.merge_request import MergeRequest
        from app.models.commit import Commit
        from sqlalchemy import union

        # 1. Projets via MRs (Author/Reviewer/Assignee)
        mrs_projects = db.query(MergeRequest.project_id).filter(
            (MergeRequest.developer_id.in_(developer_ids)) |
            (MergeRequest.reviewer_id.in_(developer_ids)) |
            (MergeRequest.assignee_id.in_(developer_ids))
        )

        # 2. Projets via Commits
        commits_projects = db.query(Commit.project_id).filter(
            Commit.developer_id.in_(developer_ids)
        )

        # Union pour l'exhaustivité
        all_ids = mrs_projects.union(commits_projects).distinct().all()
        return [r[0] for r in all_ids]


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
        return q.distinct().order_by(Developer.name).all()

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

    def create(self, db: Session, data: dict, group_ids: List[int] = None) -> Developer:
        # Extraire les groupes s'ils existent
        groups = []
        if group_ids:
            groups = db.query(DeveloperGroup).filter(DeveloperGroup.id.in_(group_ids)).all()
            
        # Créer le développeur
        developer = Developer(**data)
        if groups:
            developer.groups = groups
            
        db.add(developer)
        db.flush()
        return developer

    def sync_groups(self, db: Session, developer: Developer, group_ids: List[int]) -> None:
        """Synchronise la liste des groupes d'un développeur."""
        if group_ids is not None:
            groups = db.query(DeveloperGroup).filter(DeveloperGroup.id.in_(group_ids)).all()
            developer.groups = groups
            db.flush()


# =============================================================================
# DeveloperGroup Repository
# =============================================================================

class DeveloperGroupRepository(BaseRepository[DeveloperGroup]):

    def __init__(self):
        super().__init__(DeveloperGroup)

    def get_by_site_id(self, db: Session, site_id: int, active_only: bool = False) -> List[DeveloperGroup]:
        q = (
            db.query(DeveloperGroup)
            .options(joinedload(DeveloperGroup.site))
            .filter(DeveloperGroup.site_id == site_id)
        )
        if active_only:
            # ✅ SENIOR : On ne montre que les groupes ayant au moins un développeur actif/validé
            q = q.join(DeveloperGroup.developers).filter(
                Developer.is_active == True,
                Developer.is_validated == True,
                Developer.is_bot == False
            ).distinct()
            
        return q.order_by(DeveloperGroup.name).all()

    def get_by_id(self, db: Session, obj_id: int) -> Optional[DeveloperGroup]:
        return (
            db.query(DeveloperGroup)
            .options(joinedload(DeveloperGroup.site))
            .filter(DeveloperGroup.id == obj_id)
            .one_or_none()
        )

    def get_all_by_site(self, db: Session, site_id: int) -> List[DeveloperGroup]:
        return self.get_by_site_id(db, site_id)

    def get_by_manager(self, db: Session, manager_id: int) -> List[DeveloperGroup]:
        return (
            db.query(DeveloperGroup)
            .options(joinedload(DeveloperGroup.site))
            .filter(DeveloperGroup.manager_id == manager_id)
            .all()
        )

    def get_all_site_ids(self, db: Session) -> List[int]:
        rows = (
            db.query(DeveloperGroup.site_id)
            .distinct()
            .all()
        )
        return [r.site_id for r in rows if r.site_id]

    def get_all(self, db: Session, active_only: bool = False) -> List[DeveloperGroup]:
        q = (
            db.query(DeveloperGroup)
            .options(joinedload(DeveloperGroup.site))
        )
        if active_only:
            # ✅ SENIOR : On ne montre que les groupes ayant au moins un développeur actif/validé
            q = q.join(DeveloperGroup.developers).filter(
                Developer.is_active == True,
                Developer.is_validated == True,
                Developer.is_bot == False
            ).distinct()
            
        return q.order_by(DeveloperGroup.name).all()

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

    def create(self, db: Session, obj_in: dict) -> DeveloperGroup:
        """
        Surcharge Senior de la méthode create générique pour assurer l'intégrité.
        Si site_id est manquant (NULL), on le force sur le premier site disponible.
        """
        # On vérifie si site_id est fourni et non-nulle
        effective_site_id = obj_in.get("site_id")
        
        if effective_site_id is None:
            # Recherche du site par défaut pour éviter le crash (Enterprise patterns)
            from app.models.site import Site
            first_site = db.query(Site).order_by(Site.id.asc()).first()
            if first_site:
                obj_in["site_id"] = first_site.id
        
        return super().create(db, obj_in)

    def create_from_import(self, db: Session, name: str, site_id: Optional[int] = None) -> DeveloperGroup:
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

        if site_id is None:
            from app.models.site import Site
            first_site = db.query(Site).first()
            if first_site:
                site_id = first_site.id

        group = DeveloperGroup(
            name        = name.strip(),
            site_id     = site_id,
            manager_id  = None,
            description = (
                "Créé depuis l'import CSV développeurs — "
                "à compléter dans Administration → Développeurs → Groupes"
            ),
        )
        db.add(group)
        db.flush()
        return group