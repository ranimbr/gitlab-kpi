"""
repositories/developer_repository.py — AJOUT v5

"""

# ── VERSION COMPLÈTE DU FICHIER ───────────────────────────────────────────────

from datetime import datetime, timezone, date, timedelta
import calendar
import logging
from typing import Optional, List, Union

logger = logging.getLogger(__name__)


from sqlalchemy import func, or_, and_
from sqlalchemy.orm import Session, joinedload, selectinload

from app.models.developer import Developer
from app.models.developer_group import DeveloperGroup, DeveloperGroupLink
from app.models.developer_project import DeveloperProject
from app.models.developer_site import DeveloperSite
from app.models.period import Period
from app.models.project import Project
from app.repositories.base import BaseRepository
from app.utils.mission_utils import get_rg02_threshold  # RG-02 Source de Vérité Unique


class DeveloperRepository(BaseRepository[Developer]):

    def __init__(self):
        super().__init__(Developer)

    def get_by_id(self, db: Session, obj_id: int) -> Optional[Developer]:
        return (
            db.query(Developer)
            .options(
                selectinload(Developer.group_links).joinedload(DeveloperGroupLink.group),
                selectinload(Developer.site_associations).joinedload(DeveloperSite.site),
                selectinload(Developer.project_associations).joinedload(DeveloperProject.project),
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
        group_id:         Optional[int] = None,
        gitlab_config_id: Optional[int] = None,
        period_id:        Optional[int] = None,
        active_only:      bool          = False,
        skip:             int           = 0,
        limit:            Optional[int] = None,
    ) -> tuple[List[Developer], int]:
        q = db.query(Developer).options(
            selectinload(Developer.group_links).joinedload(DeveloperGroupLink.group),
            selectinload(Developer.site_associations).joinedload(DeveloperSite.site),
            selectinload(Developer.project_associations).joinedload(DeveloperProject.project),
        )

        start_p, end_p = None, None

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
            # [SENIOR HARDENING] Only show validated humans for extraction selection
            # NOTE : On ne filtre PAS par is_active ici car on veut pouvoir extraire 
            # les données historiques des anciens (OFFBOARDED).
            q = q.filter(
                Developer.is_validated.is_(True),
                Developer.is_bot.is_(False),
                # Developer.is_active.is_(True)  <-- RETIRÉ POUR HISTORIQUE
            )
            
            # ✅ SENIOR : Si on n'a pas de période, on filtre sur AUJOURD'HUI
            if period_id is None:
                today = date.today()
                q = q.filter(
                    or_(Developer.onboarding_date.is_(None), Developer.onboarding_date <= today),
                    or_(Developer.offboarding_date.is_(None), Developer.offboarding_date >= today)
                )

        # ═══════════════════════════════════════════════════════════════════════
        # FILTRAGE PAR PÉRIODE — Architecture Entreprise
        # ═══════════════════════════════════════════════════════════════════════
        if period_id is not None:
            period = db.query(Period).filter(Period.id == period_id).first()
            if period:
                start_p = date(period.year, period.month, 1)
                last_d  = calendar.monthrange(period.year, period.month)[1]
                end_p   = date(period.year, period.month, last_d)

                # ✅ [ENTERPRISE] : Toujours filtrer par cycle de vie RH si une période est spécifiée
                q = q.filter(
                    or_(Developer.onboarding_date.is_(None), Developer.onboarding_date <= end_p),
                    or_(Developer.offboarding_date.is_(None), Developer.offboarding_date >= start_p),
                )
                
                # ✅ [FIX] Pour TOUS les tabs, vérifier que Site + Groupe sont actifs pendant la période
                # pour exclure correctement les développeurs sans affectation temporelle
                # Join DeveloperSite temporel (SCD Type 2)
                q = q.join(
                    DeveloperSite,
                    (DeveloperSite.developer_id == Developer.id)
                )
                # Join DeveloperGroupLink temporel (SCD Type 2)
                q = q.join(
                    DeveloperGroupLink,
                    (DeveloperGroupLink.developer_id == Developer.id)
                )
                # Filtrage temporel strict pour Site et Groupe
                q = q.filter(
                    or_(DeveloperSite.start_date.is_(None), DeveloperSite.start_date < end_p),
                    or_(DeveloperSite.end_date.is_(None),   DeveloperSite.end_date >= start_p),
                    or_(DeveloperGroupLink.start_date.is_(None), DeveloperGroupLink.start_date < end_p),
                    or_(DeveloperGroupLink.end_date.is_(None),   DeveloperGroupLink.end_date >= start_p),
                )
            else:
                start_p, end_p = None, None

        # FILTRAGE ACTIVITÉ (Optionnel) - Basé sur le Cycle de Vie RH
        if active_only:
            # Un dev est 'Actif' s'il est validé, non suspendu (is_active) 
            # ET présent durant la fenêtre temporelle cible (Aujourd'hui ou Période)
            target_start = start_p if start_p else date.today()
            target_end   = end_p   if end_p   else date.today()
            
            q = q.filter(
                Developer.is_validated.is_(True),
                or_(Developer.onboarding_date.is_(None), Developer.onboarding_date <= target_end),
                or_(Developer.offboarding_date.is_(None), Developer.offboarding_date >= target_start),
            )
            # Ne filtrer par is_active que si on n'est pas sur une requête historique (period_id is None)
            if period_id is None:
                q = q.filter(Developer.is_active.is_(True))

        if project_id is not None:
            # [SENIOR CENTRALIZATION] Use certified mission logic when both project_id and period_id are provided
            # This ensures consistency with extraction logic and admin_scheduler
            if period_id is not None and start_p is not None:
                from app.utils.mission_utils import get_certified_developers_for_mission
                certified_ids = set(get_certified_developers_for_mission(
                    db=db,
                    project_id=project_id,
                    period_id=period_id,
                    start_date=start_p,
                    end_date=end_p
                ))
                # Filter to only certified developers
                if certified_ids:
                    q = q.filter(Developer.id.in_(certified_ids))
                else:
                    # No certified developers for this mission - return empty
                    q = q.filter(Developer.id == -1)  # Force empty result
            else:
                # [FIX] : Toujours joindre DeveloperProject pour le filtre projet
                # NOTE : On NE filtre PAS sur is_active car les associations importées ont is_active=False
                # Le cycle de vie est géré par onboarding_date/offboarding_date du développeur
                
                dp_filter = (DeveloperProject.developer_id == Developer.id) & (DeveloperProject.project_id == project_id)
                
                if period_id is not None and start_p is not None:
                    # [STRICT TEMPORAL ISOLATION] - SCD Type 2 parity with mission_utils.py
                    dp_filter = dp_filter & (
                        or_(DeveloperProject.start_date.is_(None), DeveloperProject.start_date <= end_p)
                    ) & (
                        or_(DeveloperProject.end_date.is_(None), DeveloperProject.end_date >= start_p)
                    )
                
                q = q.join(DeveloperProject, dp_filter)
        elif gitlab_config_id is not None:
            q = q.outerjoin(
                DeveloperProject,
                (DeveloperProject.developer_id == Developer.id)
            )
            from app.models.project import Project
            q = q.join(
                Project,
                (Project.id == DeveloperProject.project_id) &
                (Project.gitlab_config_id == gitlab_config_id)
            )

        if site_id is not None:
            #  SENIOR : Filtrage temporel intelligent du site (SCD Type 2)
            # On réutilise les dates calculées plus haut (start_p, end_p) si period_id est fourni
            q = q.join(
                DeveloperSite,
                (DeveloperSite.developer_id == Developer.id) &
                (DeveloperSite.site_id      == site_id)
            )
            
            if period_id is not None and start_p is not None:
                q = q.filter(
                    (DeveloperSite.is_active.is_(True) | (DeveloperSite.end_date >= start_p)),
                    (DeveloperSite.start_date <= end_p) # Fixed: compare with end of period
                )

        if group_id is not None:
            #  SENIOR : Filtrage temporel intelligent du groupe (SCD Type 2)
            # Note: DeveloperGroupLink already imported at module level - no local import needed
            q = q.join(
                DeveloperGroupLink,
                (DeveloperGroupLink.developer_id == Developer.id) &
                (DeveloperGroupLink.group_id     == group_id)
            )
            if period_id is not None and start_p is not None:
                q = q.filter(
                    (DeveloperGroupLink.is_active.is_(True) | (DeveloperGroupLink.end_date >= start_p)),
                    (DeveloperGroupLink.start_date <= end_p) # Fixed: compare with end of period
                )

        #  [SENIOR HARDENING] OPTIMISATION : Chargement exhaustif
        # Dans les vues Admin/Extraction, on veut voir TOUTES les associations de projets
        # (même inactives) pour permettre la sélection historique et éviter les "trous" visuels.
        q = q.options(
            selectinload(Developer.group_links).joinedload(DeveloperGroupLink.group),
            selectinload(Developer.site_associations).joinedload(DeveloperSite.site),
            selectinload(Developer.project_associations).joinedload(DeveloperProject.project)
        )

        # 1. Total Count (Avant pagination)
        total = q.distinct().count()

        # 2. Pagination & Sorting
        q = q.distinct().order_by(Developer.name)
        if limit is not None:
            q = q.offset(skip).limit(limit)

        # 3. Finalization : Attach period context for dynamic properties (SCD Type 2)
        results = q.all()
        if start_p:
            for dev in results:
                setattr(dev, "_context_period_date", start_p)

        return results, total

    def get_summary(
        self,
        db:               Session,
        project_id:       Optional[int] = None,
        site_id:          Optional[int] = None,
        group_id:         Optional[int] = None,
        gitlab_config_id: Optional[int] = None,
        period_id:        Optional[int] = None,
    ) -> dict:
        q_base = db.query(Developer)
        start_p, end_p = None, None

        if period_id is not None:
            # Imports déplacés au sommet
            
            period = db.query(Period).filter(Period.id == period_id).first()
            if period:
                # Imports déplacés au sommet
                start_p = date(period.year, period.month, 1)
                last_d  = calendar.monthrange(period.year, period.month)[1]
                end_p   = date(period.year, period.month, last_d)
                
                # Join intelligent pour le summary
                q_base = q_base.outerjoin(
                    DeveloperProject,
                    (DeveloperProject.developer_id == Developer.id)
                ).filter(
                    (DeveloperProject.id.is_(None)) | (
                        (DeveloperProject.period_id == period_id) |
                        (
                            (DeveloperProject.period_id.is_(None)) &
                            (or_(DeveloperProject.start_date.is_(None), DeveloperProject.start_date <= end_p)) &
                            (or_(DeveloperProject.end_date.is_(None), DeveloperProject.end_date >= start_p))
                        )
                    )
                )

                # Filtrage RH strict
                q_base = q_base.filter(
                    or_(Developer.onboarding_date.is_(None), Developer.onboarding_date <= end_p),
                    or_(Developer.offboarding_date.is_(None), Developer.offboarding_date >= start_p)
                )
            else:
                q_base = q_base.outerjoin(DeveloperProject, DeveloperProject.developer_id == Developer.id).filter(DeveloperProject.period_id == period_id)

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
            if period_id is None:
                q_base = q_base.outerjoin(DeveloperProject, DeveloperProject.developer_id == Developer.id)
            
            q_base = q_base.join(
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

        if group_id is not None:
            q_base = q_base.join(
                DeveloperGroupLink,
                (DeveloperGroupLink.developer_id == Developer.id) &
                (DeveloperGroupLink.group_id     == group_id)
            )
            if period_id is not None and start_p is not None:
                q_base = q_base.filter(
                    (DeveloperGroupLink.is_active.is_(True) | (DeveloperGroupLink.end_date >= start_p)),
                    (DeveloperGroupLink.start_date <= end_p)
                )

        validated = q_base.filter(Developer.is_validated.is_(True), Developer.is_bot.is_(False)).distinct().count()
        pending   = q_base.filter(Developer.is_validated.is_(False), Developer.is_bot.is_(False)).distinct().count()
        bots      = q_base.filter(Developer.is_bot.is_(True)).distinct().count()
        total     = q_base.distinct().count()
        return {"validated": validated, "pending": pending, "bots": bots, "total": total}


    def get_all(self, db: Session, active_only: bool = True) -> List[Developer]:
        q = db.query(Developer).options(
            selectinload(Developer.group_links).joinedload(DeveloperGroupLink.group),
            selectinload(Developer.site_associations).joinedload(DeveloperSite.site),
            selectinload(Developer.project_associations).joinedload(DeveloperProject.project),
        )
        if active_only:
            q = q.filter(
                Developer.is_validated.is_(True),
                Developer.is_bot.is_(False),
                Developer.is_active.is_(True),
            )
        return q.distinct().order_by(Developer.name).all()

    def get_active_during_period(self, db: Session, start_date: datetime, end_date: datetime) -> List[Developer]:
        """
        [SENIOR] Identifie les développeurs éligibles pour une période donnée.
        Un développeur est éligible s'il est humain (is_bot=False), que son
        contrat (onboarding/offboarding) couvre au moins une partie de la période,
        ET qu'il a des segments de site actifs pendant cette période (SCD Type 2).
        
        Cela permet d'exclure les développeurs suspendus temporairement.
        """
        from sqlalchemy import or_, and_, exists
        
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
        
        # ✅ [FIX SUSPENSION] Vérifier si le dev a des segments de site actifs pendant la période
        # Un dev suspendu n'aura pas de segment site actif pour la période de suspension
        q = q.filter(
            exists().where(
                and_(
                    DeveloperSite.developer_id == Developer.id,
                    DeveloperSite.start_date <= end_date,
                    or_(DeveloperSite.end_date.is_(None), DeveloperSite.end_date >= start_date)
                )
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
            .options(
                selectinload(Developer.group_links).joinedload(DeveloperGroupLink.group),
                selectinload(Developer.site_associations).joinedload(DeveloperSite.site),
                selectinload(Developer.project_associations).joinedload(DeveloperProject.project)
            )
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
            .options(
                selectinload(Developer.group_links).joinedload(DeveloperGroupLink.group),
                selectinload(Developer.site_associations).joinedload(DeveloperSite.site),
                selectinload(Developer.project_associations).joinedload(DeveloperProject.project)
            )
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

    def count_active_for_period(
        self, db: Session, project_id: Optional[int], period_id: int,
        site_id: Optional[int] = None, group_id: Optional[int] = None
    ) -> int:
        """
        [SENIOR] Dynamic Headcount Virtualization Engine.
        Calculates the unique number of developers active during a specific period
        for a given project, site, or group, using SCD Type 2 assignment history.
        RG-02 ALIGNED: Uses threshold_date (15th) for offboarding, consistent with kpi_calculator.
        """
        # 1. Résolution de la période et date de référence (Point-in-Time)
        period = db.query(Period).filter(Period.id == period_id).first()
        if not period:
            return 0

        today = date.today()
        # Bornes de la période
        start_p = date(period.year, period.month, 1)
        last_d  = calendar.monthrange(period.year, period.month)[1]
        end_p   = date(period.year, period.month, last_d)

        # [RG-02 FIX] ref_date pour onboarding / site / groupe (Point-in-Time)
        # - Mois en cours → aujourd'hui
        # - Mois passé   → dernier jour du mois
        if period.year == today.year and period.month == today.month:
            ref_date = today
        else:
            ref_date = end_p

        # [RG-02 ALIGNEMENT] threshold_date via get_rg02_threshold() — Source de Vérité Unique
        # Définie dans app/utils/mission_utils.py. Modifier le seuil LÀ-BAS uniquement.
        threshold_date = get_rg02_threshold(period.year, period.month)

        # 2. Filtrage de base : non-robot, validé et présent pendant la période
        # ✅ [FIX ENTERPRISE] On se base uniquement sur les dates d'onboarding/offboarding (SCD Type 2)
        q = db.query(Developer.id).filter(
            Developer.is_bot.is_(False),
            Developer.is_validated.is_(True),
            # Onboarding : arrivé avant ou pendant la période
            (or_(Developer.onboarding_date.is_(None), Developer.onboarding_date <= ref_date)),
            # Offboarding : [RG-02] parti après le 15 du mois (pas le dernier jour)
            (or_(Developer.offboarding_date.is_(None), Developer.offboarding_date >= threshold_date))
        )

        # 3. Filtrage Mission Projet (DeveloperProject)
        if project_id:
            q = q.join(
                DeveloperProject,
                (DeveloperProject.developer_id == Developer.id) &
                (DeveloperProject.project_id == project_id)
            ).filter(
                (DeveloperProject.period_id == period_id) |
                (
                    (DeveloperProject.period_id.is_(None)) &
                    (or_(DeveloperProject.start_date.is_(None), DeveloperProject.start_date <= ref_date)) &
                    # [RG-02] La mission doit couvrir au moins jusqu'au 15 du mois
                    (or_(DeveloperProject.end_date.is_(None), DeveloperProject.end_date >= threshold_date))
                )
            )

        # 4. Filtrage Site (SCD Type 2)
        if site_id:
            q = q.join(
                DeveloperSite,
                (DeveloperSite.developer_id == Developer.id) &
                (DeveloperSite.site_id == site_id)
            ).filter(
                (or_(DeveloperSite.start_date.is_(None), DeveloperSite.start_date <= ref_date)),
                (or_(DeveloperSite.end_date.is_(None), DeveloperSite.end_date >= threshold_date))
            )

        # 5. Filtrage Groupe (SCD Type 2)
        if group_id:
            q = q.join(
                DeveloperGroupLink,
                (DeveloperGroupLink.developer_id == Developer.id) &
                (DeveloperGroupLink.group_id == group_id)
            ).filter(
                (or_(DeveloperGroupLink.start_date.is_(None), DeveloperGroupLink.start_date <= ref_date)),
                (or_(DeveloperGroupLink.end_date.is_(None), DeveloperGroupLink.end_date >= threshold_date))
            )

        return q.distinct().count()

    def create(self, db: Session, data: dict, group_ids: List[int] = None, p_start: Optional[date] = None, p_end: Optional[date] = None) -> Developer:
        """
        [SENIOR] Crée un developer et initialise ses liens de groupe via SCD Type 2.
        - p_start : permet de définir la date d'effet de l'affectation initiale.
        """
        valid_data = {k: v for k, v in data.items() if hasattr(self.model, k)}
        
        developer = Developer(**valid_data)
        db.add(developer)
        db.flush()  # obtenir developer.id

        if group_ids:
            # ✅ PASSAGE DE LA DATE EFFECTIVE (Solidité Enterprise)
            self.sync_groups_smart(db, developer, group_ids, p_start=p_start, p_end=p_end)

        return developer


    def sync_groups(self, db: Session, developer: Developer, group_ids: List[int]) -> None:
        """
         Délègue à sync_groups_smart sans dates.
        """
        self.sync_groups_smart(db, developer, group_ids)

    def sync_groups_smart(
        self,
        db:            Session,
        developer:     Developer,
        group_ids:     List[int],
        p_start:       Optional[date] = None,
        mutation_date: Optional[date] = None,
        p_end:         Optional[date] = None,
    ) -> None:
        """
        [ENTERPRISE SCD TYPE 2] Synchronisation intelligente des équipes.
        Gère les Corrections (Cas A) et les Mutations (Cas B).
        """
        from app.models.developer_group import DeveloperGroupLink

        desired_ids = set(group_ids) if group_ids else set()
        
        # 1. Identifier l'équipe primaire ACTUELLE
        current_primary = db.query(DeveloperGroupLink).filter(
            DeveloperGroupLink.developer_id == developer.id,
            DeveloperGroupLink.is_primary.is_(True),
            DeveloperGroupLink.is_active.is_(True)
        ).first()

        # Si pas de lien actif, on cherche le dernier même s'il est inactif (Auto-healing)
        if not current_primary:
            current_primary = db.query(DeveloperGroupLink).filter(
                DeveloperGroupLink.developer_id == developer.id,
                DeveloperGroupLink.is_primary.is_(True)
            ).order_by(DeveloperGroupLink.start_date.desc()).first()

        new_primary_group_id = group_ids[0] if group_ids else None

        # 2. Logique de Mutation vs Correction
        today         = date.today()
        
        #  NORMALISATION : p_start peut être date ou datetime
        p_start_date = p_start
        if p_start and hasattr(p_start, "date"):
            p_start_date = p_start.date()
            
        # Si mutation_date est fournie, on l'utilise comme date d'effet (Cas B)
        # Sinon, on utilise p_start_date (Cas A - Correction retroactive)
        #  On utilise l'onboarding comme fallback ultime au lieu de 'today'
        effective_date = mutation_date if mutation_date else (p_start_date if p_start_date else (developer.onboarding_date or today))
        close_date     = effective_date - timedelta(days=1)
        
        #  NORMALISATION : p_end
        p_end_date = p_end
        if p_end and hasattr(p_end, "date"):
            p_end_date = p_end.date()

        if new_primary_group_id:
            if not current_primary:
                #  PREMIÈRE AFFECTATION
                db.add(DeveloperGroupLink(
                    developer_id=developer.id,
                    group_id=new_primary_group_id,
                    is_active=True,
                    is_primary=True,
                    start_date=effective_date
                ))
            else:
                if current_primary.group_id != new_primary_group_id:
                    # Changement de groupe détecté !
                    
                    # On détermine si c'est une mutation (Date d'effet fournie et > start_date)
                    is_mutation = False
                    if mutation_date:
                        if not current_primary.start_date or effective_date > current_primary.start_date:
                            is_mutation = True
                    
                    if is_mutation:
                        #  CAS B : MUTATION (Nouveau segment, conservation du passé)
                        current_primary.is_active = False
                        # On garde is_primary=True pour l'histoire
                        current_primary.end_date = close_date
                        
                        db.add(DeveloperGroupLink(
                            developer_id=developer.id,
                            group_id=new_primary_group_id,
                            is_active=(p_end_date is None),
                            is_primary=True,
                            start_date=effective_date,
                            end_date=p_end_date
                        ))
                    else:
                        #  CAS A : CORRECTION (Mise à jour rétroactive)
                        current_primary.group_id = new_primary_group_id
                        if not current_primary.start_date or current_primary.start_date > effective_date:
                            current_primary.start_date = effective_date
                else:
                    # Même groupe → Cas A (Correction rétroactive)
                    # On force l'alignement sur la date effective (qui est déjà bridée par l'onboarding)
                    if not mutation_date:  # Cas A uniquement
                        if current_primary.start_date != effective_date:
                            logger.info(
                                "[SELF-HEAL] Dev %s: start_date réalignée %s → %s",
                                developer.id, current_primary.start_date, effective_date
                            )
                            current_primary.start_date = effective_date

        # 3. Clôture des autres groupes actifs qui ne sont plus dans la liste
        all_active = db.query(DeveloperGroupLink).filter(
            DeveloperGroupLink.developer_id == developer.id,
            DeveloperGroupLink.is_active.is_(True)
        ).all()

        for lnk in all_active:
            if lnk.group_id not in desired_ids:
                lnk.is_active = False
                lnk.is_primary = False
                lnk.end_date = close_date
            elif p_end_date:
                #  Clôture globale pour offboarding
                lnk.is_active = False
                lnk.end_date = p_end_date

        db.flush()
        
        # ═══════════════════════════════════════════════════════════════════
        # NORMALISATION DE L'HISTORIQUE
        # Fusion des groupes identiques et nettoyage des segments incohérents.
        # ═══════════════════════════════════════════════════════════════════
        self._normalize_group_history(db, developer.id)
        
        db.flush()

    def _normalize_group_history(self, db: Session, developer_id: int) -> None:
        """
         Reconstruction de la Timeline des Groupes.
        """
        from app.models.developer_group import DeveloperGroupLink
        from datetime import timedelta
        import sqlalchemy as sa
        from app.models.developer import Developer

        db.execute(
            sa.text("DELETE FROM developer_group_link WHERE developer_id = :d_id AND (end_date < start_date OR group_id IS NULL)"),
            {"d_id": developer_id}
        )
        
        segments = db.query(DeveloperGroupLink).filter(
            DeveloperGroupLink.developer_id == developer_id,
            DeveloperGroupLink.is_primary == True
        ).order_by(DeveloperGroupLink.start_date.asc()).all()
        
        if not segments: return
        
        i = 0
        while i < len(segments) - 1:
            curr = segments[i]
            nxt  = segments[i+1]
            
            # Fusion si même groupe
            if curr.group_id == nxt.group_id:
                curr.end_date = nxt.end_date
                curr.is_active = nxt.is_active or curr.is_active
                db.delete(nxt)
                segments.pop(i+1)
                continue
            
            # Gap Healing
            gap_date = nxt.start_date - timedelta(days=1)
            if curr.end_date != gap_date:
                curr.end_date = gap_date
            i += 1
        
        #  [CONTINUITY RULE]
        last = segments[-1]
        dev = db.get(Developer, developer_id)
        if dev and not dev.offboarding_date:
            #  On ne force la continuité QUE si le segment est déjà actif.
            # Cela permet de supporter les congés sabbatiques (segments fermés sans départ).
            if last.is_active and last.end_date is not None:
                last.end_date = None
        elif dev and dev.offboarding_date:
            if last.end_date != dev.offboarding_date:
                last.end_date = dev.offboarding_date



# =============================================================================
# DeveloperGroup Repository
# =============================================================================

class DeveloperGroupRepository(BaseRepository[DeveloperGroup]):

    def __init__(self):
        super().__init__(DeveloperGroup)

    def get_by_site_id(self, db: Session, site_id: int, active_only: bool = False, period_id: Optional[int] = None) -> List[DeveloperGroup]:
        #  On délègue à get_all pour centraliser la logique de calcul
        return self.get_all(db, active_only=active_only, period_id=period_id, site_id=site_id)

    def get_by_id(self, db: Session, obj_id: int) -> Optional[DeveloperGroup]:
        return (
            db.query(DeveloperGroup)
            .filter(DeveloperGroup.id == obj_id)
            .one_or_none()
        )

    def get_all_by_site(self, db: Session, site_id: int) -> List[DeveloperGroup]:
        return self.get_by_site_id(db, site_id)

    def get_by_manager(self, db: Session, manager_id: int) -> List[DeveloperGroup]:
        return (
            db.query(DeveloperGroup)
            .filter(DeveloperGroup.manager_id == manager_id)
            .all()
        )

    def get_all_site_ids(self, db: Session) -> List[int]:
        """[ENTERPRISE] Retourne tous les sites qui ont au moins un groupe actif."""
        from app.models.developer_site import DeveloperSite
        rows = (
            db.query(DeveloperSite.site_id)
            .join(Developer, Developer.id == DeveloperSite.developer_id)
            .join(DeveloperGroupLink, DeveloperGroupLink.developer_id == Developer.id)
            .distinct()
            .all()
        )
        return [r.site_id for r in rows if r.site_id]

    def get_all(self, db: Session, active_only: bool = False, period_id: Optional[int] = None, site_id: Optional[int] = None) -> List[DeveloperGroup]:
        # 1. Résolution de la fenêtre temporelle de la période
        start_p, end_p = None, None
        if period_id:
            p = db.query(Period).filter(Period.id == period_id).one_or_none()
            if p:
                start_p = date(p.year, p.month, 1)
                last_day = calendar.monthrange(p.year, p.month)[1]
                end_p = date(p.year, p.month, last_day)

        # 2. Construction de la sous-requête de comptage (SCD Type 2)
        # On compte les DEVELOPER_GROUP_LINK qui intersectent la période
        count_q = db.query(
            DeveloperGroupLink.group_id,
            func.count(DeveloperGroupLink.developer_id).label("cnt")
        ).join(Developer, Developer.id == DeveloperGroupLink.developer_id)
        
        # Filtres de base (Qualité des données)
        count_q = count_q.filter(
            Developer.is_validated == True,
            Developer.is_bot == False
        )

        if start_p and end_p:
            # Règle d'intersection temporelle Enterprise :
            # Le lien est actif si [start, end] chevauche [start_p, end_p]
            # On utilise COALESCE pour prendre la date d'onboarding si le lien n'a pas de date spécifique
            count_q = count_q.filter(
                and_(
                    func.coalesce(DeveloperGroupLink.start_date, Developer.onboarding_date) <= end_p,
                    or_(
                        DeveloperGroupLink.end_date == None,
                        DeveloperGroupLink.end_date >= start_p
                    ),
                    # Sécurité supplémentaire : le dev doit être arrivé dans l'entreprise
                    Developer.onboarding_date <= end_p
                )
            )
        else:
            # Si pas de période, on ne compte que les membres ACTUELS (end_date is NULL)
            count_q = count_q.filter(DeveloperGroupLink.end_date == None)

        count_sub = count_q.group_by(DeveloperGroupLink.group_id).subquery()

        # 3. Requête principale
        q = (
            db.query(DeveloperGroup, func.coalesce(count_sub.c.cnt, 0).label("member_count"))
            .outerjoin(count_sub, count_sub.c.group_id == DeveloperGroup.id)
        )

        if site_id:
            #  LOGIQUE TRANSVERSE : On filtre les groupes via la présence de membres sur le site
            q = q.join(DeveloperGroupLink, DeveloperGroupLink.group_id == DeveloperGroup.id)\
                 .join(Developer, Developer.id == DeveloperGroupLink.developer_id)\
                 .join(DeveloperSite, DeveloperSite.developer_id == Developer.id)\
                 .filter(DeveloperSite.site_id == site_id)

        if active_only:
            # Pour le mode active_only (filtre UI), on cache les groupes vides dans cette période
            q = q.filter(func.coalesce(count_sub.c.cnt, 0) > 0)

        rows = q.order_by(DeveloperGroup.name).all()

        # Transformation des tuples (Group, count) en objets Group augmentés
        results = []
        for group, count in rows:
            group.member_count = count
            results.append(group)
        
        return results

    

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
        [ENTERPRISE] Création d'équipe transverse (indépendante du site).
        """
        # Le site_id n'est plus supporté au niveau du groupe
        obj_in.pop("site_id", None)
        return super().create(db, obj_in)

    def create_from_import(self, db: Session, name: str) -> DeveloperGroup:
        """
         Crée un groupe transverse (sans site).
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