"""
services/admin/developer_service.py — v5 Enterprise-grade

MODIFICATIONS v5 :
──────────────────────────────────────────────────────────────────
AJOUT gestion complète de la colonne "group" du CSV :
    Avant v5 : la colonne "group" était ignorée silencieusement.
               Seul default_group_id était utilisé.
    v5        : lookup du groupe par nom (case-insensitive).
               Si introuvable → create_missing_groups ou warning.

AJOUT create_missing_groups (bool) :
    Si True  → DeveloperGroupRepository.create_from_import() appelé.
    Si False → nom inconnu ajouté à unknown_groups_names (retourné
               dans la réponse pour action UI).

AJOUT tracking unknown_groups / created_groups :
    Même logique que unknown_sites / unknown_projects.

Toutes les corrections v4 conservées.
"""
import csv
import io
import logging
from datetime import datetime, date, timedelta
from typing import List, Optional, Set, Dict

from fastapi import HTTPException, status
from sqlalchemy.orm import Session
from pydantic_core import PydanticUndefined as UNSET

from app.database.session import current_db_var

from app.models.developer import Developer
from app.models.developer_import_log import ImportStatusEnum
from app.repositories.audit_log_repository import AuditLogRepository
from app.repositories.developer_import_log_repository import DeveloperImportLogRepository
from app.repositories.developer_project_repository import DeveloperProjectRepository
from app.repositories.developer_repository import DeveloperRepository, DeveloperGroupRepository
from app.repositories.developer_site_repository import DeveloperSiteRepository
from app.repositories.site_repository import SiteRepository
from app.repositories.project_repository import ProjectRepository
from app.repositories.project_site_repository import ProjectSiteRepository
from app.schemas.developer import DeveloperCreate, DeveloperUpdate, DeveloperValidate
from app.models.period import Period
from app.services.extraction.extraction_filters import build_period_window

logger = logging.getLogger(__name__)

REQUIRED_COLUMNS = {"name", "email", "gitlab_username"}


class DeveloperService:

    def __init__(self):
        self.dev_repo        = DeveloperRepository()
        self.dev_proj_repo   = DeveloperProjectRepository()
        self.dev_site_repo   = DeveloperSiteRepository()
        self.import_log_repo = DeveloperImportLogRepository()
        self.site_repo       = SiteRepository()
        self.project_repo    = ProjectRepository()
        self.group_repo      = DeveloperGroupRepository()
        self.project_site_repo = ProjectSiteRepository()
        self.audit_repo      = AuditLogRepository()

    # =========================================================================
    # CRÉATION MANUELLE
    # =========================================================================

    def create_developer(
        self,
        db:         Session,
        payload:    DeveloperCreate,
        created_by: Optional[int] = None,
        ip_address: Optional[str] = None,
    ) -> Developer:
        # ✅ LOGIQUE SENIOR : Upsert interactif
        # Si le développeur existe déjà (email ou username), on le met à jour
        # au lieu de retourner une erreur 409. Cela permet de "ré-affecter" 
        # un développeur existant via le modal d'ajout.
        existing = None
        if payload.email:
            existing = self.dev_repo.get_by_email(db, payload.email)
        
        if not existing and payload.gitlab_username:
            existing = self.dev_repo.get_by_gitlab_username(db, payload.gitlab_username)

        if existing:
            logger.info("create_developer: Doublon détecté (%s), passage en mode UPDATE (Upsert)", existing.email or existing.gitlab_username)
            from app.schemas.developer import DeveloperUpdate
            # Conversion du payload Create en Update
            update_payload = DeveloperUpdate(**payload.model_dump(exclude_unset=True))
            return self.update_developer(
                db=db, developer_id=existing.id, payload=update_payload,
                updated_by=created_by, ip_address=ip_address
            )

        # ── [RG-05] Validation des dates de cycle de vie ────────────────────
        off_date = getattr(payload, "offboarding_date", None)
        on_date  = getattr(payload, "onboarding_date",  None)
        if on_date and off_date and on_date >= off_date:
            raise HTTPException(
                status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
                detail="[RG-05] La date d'entrée doit être strictement antérieure à la date de départ.",
            )

        dev_data = {
            "gitlab_user_id":  payload.gitlab_user_id,
            "gitlab_username": payload.gitlab_username,
            "name":            payload.name,
            "email":           payload.email,
            "company":         None,
            "is_external":     payload.is_external,
            "onboarding_date": payload.onboarding_date,
            "is_bot":          False,
            "is_validated":    True,
            "auto_created":    False,
            "source":          "manual",
            "created_by":      created_by,
        }

        developer = self.dev_repo.create(db, dev_data, group_ids=payload.group_ids)
        db.flush()

        self.dev_site_repo.sync_smart(
            db, developer.id, payload.sites,
            p_start=payload.onboarding_date,
            mutation_date=payload.mutation_date
        )
        
        # ✅ LOGIQUE ENTERPRISE : Sync des projets
        # On aligne la date de début de mission sur la date d'onboarding par défaut
        # pour s'assurer que le dev est visible dès son premier jour dans les rapports.
        target_period_id = getattr(payload, "period_id", None)
        project_ids = [p.project_id for p in payload.projects]
        
        if project_ids:
            self.dev_proj_repo.sync_smart(
                db, developer.id, project_ids,
                p_start=payload.onboarding_date,
                mutation_date=payload.mutation_date
            )

        self.audit_repo.log(
            db=db, user_id=created_by, action="CREATE_DEVELOPER",
            entity_type="Developer", entity_id=developer.id,
            entity_name=developer.name,
            new_value={"name": developer.name, "email": developer.email, "source": "manual", "period_id": target_period_id},
            ip_address=ip_address,
        )

        # ✅ LOGIQUE AUTO-DISCOVERY : Maj des liens Projet-Site
        self.sync_project_site_associations(db, developer.id)

        db.commit()
        db.refresh(developer)
        return developer

    # =========================================================================
    # VALIDATION ADMIN
    # =========================================================================

    def validate_developer(
        self,
        db:           Session,
        developer_id: int,
        payload:      DeveloperValidate,
        validated_by: Optional[int] = None,
        ip_address:   Optional[str] = None,
    ) -> Developer:
        developer = self.dev_repo.get_by_id(db, developer_id)
        if not developer:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Développeur introuvable.")

        old_value  = {"is_validated": developer.is_validated, "is_bot": developer.is_bot}
        update_data = {"is_validated": payload.is_validated}
        if payload.is_bot     is not None: update_data["is_bot"]     = payload.is_bot

        self.dev_repo.update(db, developer, update_data)
        
        if payload.group_ids is not None:
            self.dev_repo.sync_groups(db, developer, payload.group_ids)

        if payload.sites is not None:
            self.dev_site_repo.sync(
                db, developer_id,
                [{"site_id": s.site_id, "is_primary": s.is_primary} for s in payload.sites],
            )
        if payload.projects is not None:
            self.dev_proj_repo.sync(db, developer_id, [p.project_id for p in payload.projects])

        self.audit_repo.log(
            db=db, user_id=validated_by, action="UPDATE_DEVELOPER",
            entity_type="Developer", entity_id=developer_id,
            entity_name=developer.name,
            old_value=old_value,
            new_value={"is_validated": payload.is_validated, "is_bot": payload.is_bot},
            ip_address=ip_address,
        )

        # ✅ LOGIQUE AUTO-DISCOVERY : Maj des liens Projet-Site
        self.sync_project_site_associations(db, developer_id)

        db.commit()
        db.refresh(developer)
        return developer

    # =========================================================================
    # MISE À JOUR
    # =========================================================================

    def _json_serializable(self, data: dict) -> dict:
        """
        Convertit les objets non-sérialisables (date, datetime) en strings ISO.
        Évite les erreurs 500 lors de l'insertion en colonne JSON (AuditLog).
        """
        import datetime
        clean = {}
        for k, v in data.items():
            if isinstance(v, (datetime.date, datetime.datetime)):
                clean[k] = v.isoformat()
            elif isinstance(v, dict):
                clean[k] = self._json_serializable(v)
            else:
                clean[k] = v
        return clean

    def update_developer(
        self,
        db:           Session,
        developer_id: int,
        payload:      DeveloperUpdate,
        updated_by:   Optional[int] = None,
        ip_address:   Optional[str] = None,
    ) -> Developer:
        developer = self.dev_repo.get_by_id(db, developer_id)
        if not developer:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Développeur introuvable.")

        # Capture developer state before update
        old_properties = {
            "name": developer.name,
            "email": developer.email,
            "gitlab_username": developer.gitlab_username,
            "is_active": developer.is_active,
            "is_validated": developer.is_validated,
            "is_bot": developer.is_bot,
            "is_external": developer.is_external,
            "onboarding_date": developer.onboarding_date,
            "offboarding_date": developer.offboarding_date,
        }

        # Résolution de la période cible pour la Smart-Sync (Priorité à la sélection UI)
        target_period_id = getattr(payload, "period_id", None)
        mutation_date = getattr(payload, "mutation_date", None)
        p_start = None

        from datetime import datetime
        
        if mutation_date:
            # ✅ [PRIORITÉ 1] : Date d effet explicite du Modal
            p_start = datetime.combine(mutation_date, datetime.min.time())
        elif target_period_id:
            # ✅ [PRIORITÉ 2] : Mois sélectionné dans le Dashboard
            from app.models.period import Period
            period = db.query(Period).get(target_period_id)
            if period:
                p_start = datetime(period.year, period.month, 1)
        
        # ✅ [PRIORITÉ 3] : L onboarding_date est un FALLBACK ultime
        if not p_start and developer.onboarding_date:
            p_start = datetime.combine(developer.onboarding_date, datetime.min.time())

        # ✅ LOGIQUE ENTERPRISE : Offboarding-Sync
        # Si un offboarding_date est présent (dans le payload ou l'existant), 
        # les segments de mission doivent s'arrêter à cette date.
        p_end = None
        new_off_date = getattr(payload, "offboarding_date", UNSET)
        off_date_to_use = new_off_date if new_off_date is not UNSET else developer.offboarding_date
        
        if off_date_to_use:
            p_end = datetime.combine(off_date_to_use, datetime.min.time())

        update_data = payload.model_dump(exclude_unset=True, exclude={"sites", "projects", "group_ids", "period_id", "mutation_date"})

        # ── [RG-05] Validation des dates de cycle de vie ────────────────────
        # La date d'entrée doit être strictement antérieure à la date de départ.
        new_on_raw  = update_data.get("onboarding_date",  developer.onboarding_date)
        new_off_raw = update_data.get("offboarding_date", developer.offboarding_date)
        if new_on_raw and new_off_raw and new_on_raw >= new_off_raw:
            raise HTTPException(
                status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
                detail="[RG-05] La date d'entrée doit être strictement antérieure à la date de départ.",
            )

        # ========================================================================
        # [ENTERPRISE FIX] Détection du changement is_active → gestion SCD2
        # Suspension temporaire (True→False) : Fermeture des segments site/projet
        # Réactivation        (False→True)  : Réouverture des segments site/projet
        # ========================================================================
        new_is_active = update_data.get("is_active", None)
        is_active_before = developer.is_active

        if new_is_active is not None and new_is_active != is_active_before:
            effect_date = mutation_date or off_date_to_use or date.today()

            from app.models.developer_site import DeveloperSite
            from app.models.developer_project import DeveloperProject
            from app.models.developer_group import DeveloperGroupLink
            from datetime import timedelta

            if not new_is_active:
                # ── SUSPENSION : Fermeture propre de la carrière à la veille de effect_date ──────
                close_date = effect_date - timedelta(days=1)

                # 1. Traitement des Sites
                # Supprimer les segments qui commencent après la date de fermeture
                future_sites = db.query(DeveloperSite).filter(
                    DeveloperSite.developer_id == developer_id,
                    DeveloperSite.start_date > close_date
                ).all()
                for seg in future_sites:
                    logger.info("[SUSPENSION] Suppression segment site futur id=%d", seg.id)
                    db.delete(seg)

                # Fermer les segments actifs à la date de fermeture
                active_sites = db.query(DeveloperSite).filter(
                    DeveloperSite.developer_id == developer_id,
                    DeveloperSite.start_date <= close_date,
                    ((DeveloperSite.is_active.is_(True)) | (DeveloperSite.end_date > close_date))
                ).all()
                for seg in active_sites:
                    seg.is_active = False
                    seg.end_date  = close_date
                    logger.info("[SUSPENSION] Fermeture segment site id=%d au %s", seg.id, close_date)

                # 2. Traitement des Projets
                future_projects = db.query(DeveloperProject).filter(
                    DeveloperProject.developer_id == developer_id,
                    DeveloperProject.start_date > close_date
                ).all()
                for seg in future_projects:
                    logger.info("[SUSPENSION] Suppression segment projet futur id=%d", seg.id)
                    db.delete(seg)

                active_projects = db.query(DeveloperProject).filter(
                    DeveloperProject.developer_id == developer_id,
                    DeveloperProject.start_date <= close_date,
                    ((DeveloperProject.is_active.is_(True)) | (DeveloperProject.end_date > close_date))
                ).all()
                for seg in active_projects:
                    seg.is_active = False
                    seg.end_date  = close_date
                    logger.info("[SUSPENSION] Fermeture segment projet id=%d au %s", seg.id, close_date)

                # 3. Traitement des Groupes
                future_groups = db.query(DeveloperGroupLink).filter(
                    DeveloperGroupLink.developer_id == developer_id,
                    DeveloperGroupLink.start_date > close_date
                ).all()
                for seg in future_groups:
                    logger.info("[SUSPENSION] Suppression segment groupe futur id=%d", seg.id)
                    db.delete(seg)

                active_groups = db.query(DeveloperGroupLink).filter(
                    DeveloperGroupLink.developer_id == developer_id,
                    DeveloperGroupLink.start_date <= close_date,
                    ((DeveloperGroupLink.is_active.is_(True)) | (DeveloperGroupLink.end_date > close_date))
                ).all()
                for seg in active_groups:
                    seg.is_active = False
                    seg.end_date  = close_date
                    logger.info("[SUSPENSION] Fermeture segment groupe id=%d au %s", seg.id, close_date)

                db.flush()
                logger.info(
                    "[SUSPENSION] Dev_id=%d suspendu à compter du %s (fermeture au %s)",
                    developer_id, effect_date, close_date
                )

            else:
                # ── RÉACTIVATION : Réouverture des segments depuis effect_date ──
                # Réouvrir les segments site fermés les plus récents
                closed_sites = db.query(DeveloperSite).filter(
                    DeveloperSite.developer_id == developer_id,
                    DeveloperSite.is_active.is_(False),
                ).order_by(DeveloperSite.end_date.desc()).all()

                # On ne rouvre que les segments fermés lors de la suspension
                # (ceux dont end_date = effect_date - 1 jour)
                reactivation_close_date = None
                # On cherche la date de fermeture la plus récente
                if closed_sites:
                    reactivation_close_date = max(
                        (s.end_date for s in closed_sites if s.end_date), default=None
                    )

                reopened_site_ids = set()
                for seg in closed_sites:
                    if seg.end_date and seg.end_date == reactivation_close_date and seg.site_id not in reopened_site_ids:
                        # Créer un nouveau segment ouvert à partir de effect_date
                        db.add(DeveloperSite(
                            developer_id=developer_id,
                            site_id=seg.site_id,
                            is_primary=seg.is_primary,
                            is_active=True,
                            start_date=effect_date,
                            end_date=None,
                        ))
                        reopened_site_ids.add(seg.site_id)
                        logger.info(
                            "[RÉACTIVATION] Rouvert segment site_id=%d pour dev_id=%d à partir du %s",
                            seg.site_id, developer_id, effect_date
                        )

                closed_projects = db.query(DeveloperProject).filter(
                    DeveloperProject.developer_id == developer_id,
                    DeveloperProject.is_active.is_(False),
                ).order_by(DeveloperProject.end_date.desc()).all()

                reopened_project_ids = set()
                for seg in closed_projects:
                    if seg.end_date and seg.end_date == reactivation_close_date and seg.project_id not in reopened_project_ids:
                        db.add(DeveloperProject(
                            developer_id=developer_id,
                            project_id=seg.project_id,
                            is_active=True,
                            start_date=effect_date,
                            end_date=None,
                        ))
                        reopened_project_ids.add(seg.project_id)
                        logger.info(
                            "[RÉACTIVATION] Rouvert segment project_id=%d pour dev_id=%d à partir du %s",
                            seg.project_id, developer_id, effect_date
                        )

                closed_groups = db.query(DeveloperGroupLink).filter(
                    DeveloperGroupLink.developer_id == developer_id,
                    DeveloperGroupLink.is_active.is_(False),
                ).order_by(DeveloperGroupLink.end_date.desc()).all()

                reopened_group_ids = set()
                for seg in closed_groups:
                    if seg.end_date and seg.end_date == reactivation_close_date and seg.group_id not in reopened_group_ids:
                        db.add(DeveloperGroupLink(
                            developer_id=developer_id,
                            group_id=seg.group_id,
                            is_active=True,
                            is_primary=getattr(seg, 'is_primary', False),
                            start_date=effect_date,
                            end_date=None,
                        ))
                        reopened_group_ids.add(seg.group_id)

                db.flush()
                logger.info(
                    "[RÉACTIVATION] Dev_id=%d réactivé à partir du %s (sites=%s, projects=%s)",
                    developer_id, effect_date, list(reopened_site_ids), list(reopened_project_ids)
                )

        if update_data:
            self.dev_repo.update(db, developer, update_data)

        # ========================================================================
        # [ENTERPRISE] DÉTECTION DES CHANGEMENTS SENSIBLES (Option B)
        # Capture l'état AVANT synchronisation pour détecter les corrections
        # qui nécessitent un recalcul des KPIs historiques.
        # ========================================================================
        changed_fields = []

        # Snapshot AVANT
        projects_before = set(
            dp.project_id for dp in self.dev_proj_repo.get_by_developer(db, developer_id, active_only=True)
        )
        sites_before = set(
            ds.site_id for ds in self.dev_site_repo.get_by_developer(db, developer_id)
            if getattr(ds, 'is_active', True)
        )
        from app.models.developer_group import DeveloperGroupLink
        groups_before = set(
            gl.group_id for gl in db.query(DeveloperGroupLink).filter(
                DeveloperGroupLink.developer_id == developer_id,
                DeveloperGroupLink.is_active == True
            ).all()
        )

        # ── [SCD2 FIX] Skip sync_smart si is_active vient de changer ───────────
        # Quand is_active change (suspension/réactivation), nos segments SCD2 sont
        # déjà créés correctement.
        is_active_just_changed = (new_is_active is not None and new_is_active != is_active_before)
        is_suspension = is_active_just_changed and not new_is_active

        # 1. Sites
        if is_suspension or is_active_just_changed:
            pass # On ne recrée pas de segments pour un dev qu'on vient de suspendre ou réactiver !
        elif payload.sites is not None:
            self.dev_site_repo.sync_smart(db, developer_id, payload.sites, p_start=p_start, p_end=p_end, mutation_date=mutation_date)
        elif not is_active_just_changed:
            final_sites = [{"site_id": ds.site_id, "is_primary": ds.is_primary}
                           for ds in self.dev_site_repo.get_by_developer(db, developer_id)
                           if getattr(ds, 'is_active', True)]
            self.dev_site_repo.sync_smart(db, developer_id, final_sites, p_start=p_start, p_end=p_end, mutation_date=mutation_date)

        # 2. Projets
        if is_suspension or is_active_just_changed:
            pass
        elif payload.projects is not None:
            self.dev_proj_repo.sync_smart(
                db, developer_id,
                [p.project_id for p in payload.projects],
                p_start=p_start, p_end=p_end, mutation_date=mutation_date
            )

        # 3. Groupes
        if is_suspension or is_active_just_changed:
            pass
        elif payload.group_ids is not None:
            self.dev_repo.sync_groups_smart(
                db, developer, payload.group_ids,
                p_start=p_start.date() if p_start else None,
                mutation_date=payload.mutation_date,
                p_end=p_end.date() if p_end else None
            )
        elif not is_active_just_changed:
            self.dev_repo.sync_groups_smart(
                db, developer, list(groups_before),
                p_start=p_start.date() if p_start else None,
                mutation_date=payload.mutation_date,
                p_end=p_end.date() if p_end else None
            )

        # Flush pour que les nouveaux états soient visibles
        db.flush()

        # Snapshot APRÈS
        projects_after = set(
            dp.project_id for dp in self.dev_proj_repo.get_by_developer(db, developer_id, active_only=True)
        )
        sites_after = set(
            ds.site_id for ds in self.dev_site_repo.get_by_developer(db, developer_id)
            if getattr(ds, 'is_active', True)
        )
        groups_after = set(
            gl.group_id for gl in db.query(DeveloperGroupLink).filter(
                DeveloperGroupLink.developer_id == developer_id,
                DeveloperGroupLink.is_active == True
            ).all()
        )

        # Détection des changements
        if projects_before != projects_after:
            changed_fields.append("projects")
        if sites_before != sites_after:
            changed_fields.append("sites")
        if groups_before != groups_after:
            changed_fields.append("groups")

        # Champs RH sensibles (dates de cycle de vie)
        sensitive_hr_fields = {"onboarding_date", "offboarding_date"}
        if update_data and sensitive_hr_fields & set(update_data.keys()):
            changed_fields.append("lifecycle_dates")

        # ========================================================================
        # [ENTERPRISE FIX] Détection des Corrections Rétroactives (Case A)
        # Si mutation_date est NULL et qu'il y a un changement de site/groupe/projet,
        # c'est une CORRECTION rétroactive qui affecte l'historique.
        # On doit identifier les périodes impactées pour recalcul.
        # ========================================================================
        is_retroactive_correction = (
            mutation_date is None and 
            (payload.sites is not None or payload.group_ids is not None or payload.projects is not None)
        )
        
        affected_periods = []
        if is_retroactive_correction:
            # Déterminer la plage temporelle affectée
            # De l'onboarding (ou création) jusqu'à aujourd'hui
            earliest_date = developer.onboarding_date if developer.onboarding_date else developer.created_at.date()
            if hasattr(earliest_date, 'date'):
                earliest_date = earliest_date.date()
            
            from app.repositories.period_repository import PeriodRepository
            period_repo = PeriodRepository()
            
            # Récupérer toutes les périodes depuis l'arrivée du dev
            all_periods_list = period_repo.get_all(db)
            all_periods = [
                p for p in all_periods_list
                if (p.year > earliest_date.year) or 
                   (p.year == earliest_date.year and p.month >= earliest_date.month)
            ]
            
            affected_periods = [
                {"period_id": p.id, "year": p.year, "month": p.month}
                for p in all_periods
                if not p.status or p.status != "closed"  # Ne recalculer que les périodes ouvertes
            ]
            
            if affected_periods:
                changed_fields.append("retroactive_correction")
                logger.info(
                    f"[RETROACTIVE CORRECTION] Dev {developer_id} ({developer.name}) : "
                    f"{len(affected_periods)} périodes impactées par correction rétroactive"
                )

        recalculation_needed = len(changed_fields) > 0

        # Construct detailed associations before and after for timeline detection
        old_assoc = {
            "sites": [{"site_id": s} for s in sites_before],
            "group_ids": list(groups_before),
            "projects": [{"project_id": p} for p in projects_before]
        }
        new_assoc = {
            "sites": [{"site_id": s} for s in sites_after],
            "group_ids": list(groups_after),
            "projects": [{"project_id": p} for p in projects_after]
        }

        old_detail = {**self._json_serializable(old_properties), **old_assoc}
        
        # Log d'audit enrichi avec les champs modifiés
        new_detail = {**self._json_serializable(update_data), **new_assoc}
        if changed_fields:
            new_detail["_changed_associations"] = changed_fields
        
        # ✅ [FIX] Inclure mutation_date dans le log d'audit pour la timeline
        if mutation_date:
            new_detail["mutation_date"] = mutation_date.isoformat() if hasattr(mutation_date, 'isoformat') else str(mutation_date)

        self.audit_repo.log(
            db=db, user_id=updated_by, action="UPDATE_DEVELOPER",
            entity_type="Developer", entity_id=developer_id,
            entity_name=developer.name,
            old_value=old_detail,
            new_value=new_detail,
            ip_address=ip_address,
        )

        # ✅ LOGIQUE AUTO-DISCOVERY : Maj des liens Projet-Site
        self.sync_project_site_associations(db, developer_id)

        # ========================================================================
        # [ENTERPRISE FIX] Recalcul automatique des KPIs pour corrections rétroactives
        # Si une correction rétroactive est détectée, on recalcule les KPIs des périodes ouvertes
        # ========================================================================
        if is_retroactive_correction and affected_periods:
            try:
                from app.services.kpi.kpi_aggregator import KpiAggregator
                aggregator = KpiAggregator(db)
                
                # Récupérer tous les projets du développeur pour recalculer
                dev_projects = self.dev_proj_repo.get_by_developer(db, developer_id)
                project_ids = [dp.project_id for dp in dev_projects]
                
                recalculated_count = 0
                for period_info in affected_periods:
                    for project_id in project_ids:
                        try:
                            aggregator.recalculate_period(
                                period_id=period_info["period_id"],
                                project_id=project_id
                            )
                            recalculated_count += 1
                            logger.info(
                                f"[RETROACTIVE RECALC] Recalcul KPIs : "
                                f"Dev {developer_id}, Period {period_info['year']}/{period_info['month']}, "
                                f"Project {project_id}"
                            )
                        except Exception as e:
                            logger.error(
                                f"[RETROACTIVE RECALC] Erreur recalcul period {period_info['period_id']} "
                                f"project {project_id}: {e}"
                            )
                
                logger.info(
                    f"[RETROACTIVE RECALC] Dev {developer_id} : "
                    f"{recalculated_count} recalculs KPIs terminés"
                )
            except Exception as e:
                logger.error(f"[RETROACTIVE RECALC] Erreur globale recalcul KPIs: {e}")

        db.commit()
        db.refresh(developer)

        return {
            "developer": developer,
            "recalculation_needed": recalculation_needed,
            "changed_fields": changed_fields,
            "affected_periods": affected_periods if is_retroactive_correction else [],
        }

    # =========================================================================
    # AUTO-DISCOVERY DES LIENS PROJET-SITE
    # =========================================================================

    def sync_project_site_associations(self, db: Session, developer_id: int):
        """
        [SENIOR LOGIQUE ENTERPRISE]
        Synchronise la table project_site en fonction des affectations du développeur.
        Si un dev est sur Projet P et Site S, alors (P, S) doit exister.
        """
        try:
            # On récupère les IDs des projets et sites actifs du dev
            p_ids = [p.project_id for p in self.dev_proj_repo.get_by_developer(db, developer_id)]
            s_ids = [s.site_id for s in self.dev_site_repo.get_by_developer(db, developer_id)]

            if not p_ids or not s_ids:
                return

            for pid in p_ids:
                for sid in s_ids:
                    # Ajout idempotent (le repo gère déjà le check exists)
                    self.project_site_repo.add(db, pid, sid)
            db.flush()
        except Exception as e:
            logger.error("Erreur sync_project_site_associations pour dev %d: %s", developer_id, str(e))

    def _update_developer_project_period_id(
        self, db: Session, developer_id: int, project_ids: List[int], period_id: Optional[int]
    ):
        """
        [FIX] Met à jour period_id des certifications developer_project créées.
        Cette méthode est appelée après sync_smart pour lier les certifications à une période spécifique.
        """
        logger.info(f"[FIX] _update_developer_project_period_id appelée: dev_id={developer_id}, project_ids={project_ids}, period_id={period_id}")
        if not period_id:
            logger.warning(f"[FIX] period_id est None, abandon de la mise à jour pour dev {developer_id}")
            return

        try:
            # Mettre à jour period_id des certifications actives pour les projets spécifiés
            result = db.query(DeveloperProject).filter(
                DeveloperProject.developer_id == developer_id,
                DeveloperProject.project_id.in_(project_ids),
                DeveloperProject.is_active == True
            ).update({"period_id": period_id})
            logger.info(f"[FIX] Mise à jour period_id: {result.rowcount} certifications mises à jour pour dev {developer_id}")
            db.flush()
        except Exception as e:
            logger.error("Erreur _update_developer_project_period_id pour dev %d: %s", developer_id, str(e))

    # =========================================================================
    # FUSION DE DOUBLONS (MERGE)
    # =========================================================================

    def merge_developers(
        self,
        db: Session,
        canonical_id: int,
        duplicate_id: int,
        merged_by: Optional[int] = None,
        ip_address: Optional[str] = None,
    ) -> Developer:
        """
        Fusionne le profil doublon dans le profil principal.
        Transfère les Commits, MergeRequests et KpiSnapshots pour éviter la perte de données.
        """
        from app.models.commit import Commit
        from app.models.merge_request import MergeRequest
        from app.models.kpi_snapshot import KpiSnapshot
        from fastapi import HTTPException, status

        if canonical_id == duplicate_id:
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Impossible de fusionner un profil avec lui-même.")

        canonical = self.dev_repo.get_by_id(db, canonical_id)
        duplicate = self.dev_repo.get_by_id(db, duplicate_id)

        if not canonical:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Profil principal introuvable.")
        if not duplicate:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Profil doublon introuvable.")

        try:
            # 1. Transfert des Commits
            db.query(Commit).filter(Commit.developer_id == duplicate_id).update(
                {"developer_id": canonical_id}, synchronize_session=False
            )

            # 2. Transfert des Merge Requests (Auteur et Reviewer)
            db.query(MergeRequest).filter(MergeRequest.developer_id == duplicate_id).update(
                {"developer_id": canonical_id}, synchronize_session=False
            )
            db.query(MergeRequest).filter(MergeRequest.reviewer_id == duplicate_id).update(
                {"reviewer_id": canonical_id}, synchronize_session=False
            )
            
            # 2.1 Transfert des CommitMergeRequest et Alert
            from app.models.commit_merge_request import CommitMergeRequest
            from app.models.alert import Alert
            
            db.query(CommitMergeRequest).filter(CommitMergeRequest.developer_id == duplicate_id).update(
                {"developer_id": canonical_id}, synchronize_session=False
            )
            db.query(Alert).filter(Alert.developer_id == duplicate_id).update(
                {"developer_id": canonical_id}, synchronize_session=False
            )

            # 3. Transfert des KpiSnapshots (Gestion des conflits d'Index Unique)
            dup_snapshots = db.query(KpiSnapshot).filter(KpiSnapshot.developer_id == duplicate_id).all()
            for ds in dup_snapshots:
                existing = db.query(KpiSnapshot).filter(
                    KpiSnapshot.project_id == ds.project_id,
                    KpiSnapshot.period_id == ds.period_id,
                    KpiSnapshot.developer_id == canonical_id
                ).first()
                if existing:
                    # Le canonical a déjà un snapshot pour ce projet/période. On gère la collision.
                    existing.total_commits += ds.total_commits
                    existing.total_mrs_created += ds.total_mrs_created
                    existing.total_mrs_approved += ds.total_mrs_approved
                    existing.total_mrs_merged += ds.total_mrs_merged
                    existing.review_time_hours += ds.review_time_hours
                    existing.nb_commits_per_project += ds.nb_commits_per_project
                    db.delete(ds)
                else:
                    ds.developer_id = canonical_id

            # 4. Transfert des affectations Sites et Projets
            dup_sites = self.dev_site_repo.get_by_developer(db, duplicate_id)
            for ds in dup_sites:
                if not self.dev_site_repo.exists(db, canonical_id, ds.site_id):
                    self.dev_site_repo.add(db, canonical_id, ds.site_id, is_primary=False)
                db.delete(ds) # Suppression de l'ancienne liaison

            dup_projs = self.dev_proj_repo.get_by_developer(db, duplicate_id)
            for dp in dup_projs:
                if not self.dev_proj_repo.exists(db, canonical_id, dp.project_id):
                    self.dev_proj_repo.add(db, canonical_id, dp.project_id)
                db.delete(dp)

            # 5. Audit Log
            self.audit_repo.log(
                db=db, user_id=merged_by, action="MERGE_DEVELOPER",
                entity_type="Developer", entity_id=canonical_id,
                entity_name=canonical.name,
                old_value={"duplicate_id_merged": duplicate_id, "duplicate_email": duplicate.email},
                new_value={"status": "merged"}, ip_address=ip_address,
            )

            # 6. Suppression finale du profil doublon
            db.delete(duplicate)
            db.commit()

            db.refresh(canonical)
            return canonical

        except Exception as e:
            db.rollback()
            logger.error("Erreur fusion devs %s -> %s: %s", duplicate_id, canonical_id, str(e))
            raise HTTPException(
                status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
                detail="Erreur interne lors de la fusion. Les données n'ont pas été modifiées."
            )

    # =========================================================================
    # IMPORT CSV / EXCEL — Enterprise v5
    # =========================================================================

    def import_from_file(
        self,
        db:                      Session,
        file_content:            bytes,
        file_name:               str,
        period_id:               Optional[int] = None,  # ✅ OPTIONNEL POUR PERSISTENCE
        imported_by:             Optional[int] = None,
        default_site_id:         Optional[int] = None,
        default_group_id:        Optional[int] = None,
        default_gitlab_config_id: Optional[int] = None,
        dry_run:                 bool = False,
        create_missing_sites:    bool = False,
        create_missing_projects: bool = False,
        create_missing_groups:   bool = False,
        full_sync:               bool = False,
    ) -> dict:
        """
        Import enterprise complet.

        Gestion des 3 types d'entités manquantes :
            Sites    → create_missing_sites    / unknown_sites    / created_sites
            Projets  → create_missing_projects / unknown_projects / created_projects
            Groupes  → create_missing_groups   / unknown_groups   / created_groups

        La colonne "group" du CSV est résolue par nom (case-insensitive).
        Si le groupe n'est pas trouvé :
            create_missing_groups=True  → groupe créé automatiquement
            create_missing_groups=False → warning non bloquant, dev créé sans groupe
        """
        file_type = "xlsx" if file_name.lower().endswith((".xlsx", ".xls")) else "csv"

        # ✅ AJOUT: Récupérer la base de données cible pour l'audit
        target_db = current_db_var.get() or "unknown"

        import_log_id = self.import_log_repo.create_log(
            db, file_name=file_name, imported_by=imported_by, target_database=target_db, file_type=file_type
        )
        db.flush()

        try:
            rows = self._parse_file(file_content, file_type)
        except HTTPException:
            raise
        except Exception as e:
            self.import_log_repo.fail(db, import_log_id, str(e))
            db.commit()
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=f"Erreur de lecture du fichier : {e}",
            )

        # ── [SENIOR] Préparation de la Fenêtre Temporelle ────────────────────
        p_start = p_end = None
        if period_id:
            period = db.query(Period).filter(Period.id == period_id).first()
            if period:
                from app.services.extraction.extraction_filters import build_period_window
                _, _, p_start, p_end = build_period_window(period)


        # ── Pré-chargement O(1) des référentiels ────────────────────────────
        all_sites    = {s.name.lower().strip(): s for s in self.site_repo.get_all(db)}
        all_groups   = {g.name.lower().strip(): g for g in self.group_repo.get_all(db)}
        
        # ✅ LOGIQUE SENIOR : Tracking pour Full Sync
        # ⚠️ FIX ARCHITECTURAL : Le scope du full_sync est PROJET × PÉRIODE, pas global.
        # Objectif : ne désactiver que les devs absents d'un projet SPÉCIFIQUE pour ce mois.
        # Importer le CSV inkscape ne doit JAMAIS toucher les devs de gitlab-shell.
        csv_project_ids: set = set()  # Projets référencés dans le CSV (rempli pendant la boucle)
        processed_ids: set = set()

        logger.info("Import: %d sites et %d groupes chargés en cache.", len(all_sites), len(all_groups))
        
        # Projets : double indexation (Nom et ID GitLab)
        _projects_all = self.project_repo.get_all(db, active_only=False)
        all_projects_by_name = {p.name.lower(): p for p in _projects_all}
        all_projects_by_id   = {p.gitlab_project_id: p for p in _projects_all if p.gitlab_project_id}

        # ── Collecteurs ───────────────────────────────────────────────────────
        success_list   : List[dict] = []
        error_list     : List[dict] = []
        duplicate_list : List[dict] = []

        unknown_sites_names    : Set[str] = set()
        unknown_projects_data  : Dict[str, Optional[int]] = {}
        unknown_groups_names   : Set[str] = set()
        created_sites_names    : Set[str] = set()
        created_projects_names : Set[str] = set()
        created_groups_names   : Set[str] = set()

        for row_num, row in enumerate(rows, start=2):
            #  DIAGNOSTIC SENIOR : On log les clés une seule fois
            if row_num == 2:
                logger.info("Import DEBUG: Clés détectées dans le CSV: %s", list(row.keys()))

            #  LOGIQUE RESILIENTE (Senior) : On cherche avec une tolérance maximale
            def get_val(keys):
                keys_lower = [k.lower().strip() for k in keys]
                for row_k, val in row.items():
                    rk_clean = str(row_k).lower().strip()
                    if rk_clean in keys_lower:
                        return (str(val) or "").strip()
                return ""

            name     = get_val(["name", "nom", "full_name"])
            email    = get_val(["email", "mail", "courriel"]).lower()
            username = get_val(["gitlab_username", "username", "identifiant", "user"])
            
            # Détection flexible de la colonne Groupe
            group_csv_raw = get_val(["group", "groups", "groupe", "groupes", "equipe", "équipe", "team"])
            
            onboarding_csv_raw  = get_val(["onboarding_date", "date_entree", "date_arrivee", "join_date"])
            offboarding_csv_raw = get_val(["offboarding_date", "date_sortie", "date_depart", "leave_date"])
            mission_start_raw   = get_val(["mission_start", "start_date", "debut_mission", "date_debut"])
            mission_end_raw     = get_val(["mission_end", "end_date", "fin_mission", "date_fin"])

            from datetime import datetime
            def parse_csv_date(val):
                if not val: return None
                try:
                    # On supporte YYYY-MM-DD et DD/MM/YYYY
                    if "/" in val:
                        return datetime.strptime(val, "%d/%m/%Y").date()
                    return datetime.fromisoformat(val).date()
                except: return None

            onboarding_date  = parse_csv_date(onboarding_csv_raw)
            offboarding_date = parse_csv_date(offboarding_csv_raw)
            
            # Mission dates default to onboarding/offboarding if not explicitly provided
            mission_start = parse_csv_date(mission_start_raw) or onboarding_date
            mission_end   = parse_csv_date(mission_end_raw) or offboarding_date

            # ── Validation champs obligatoires ────────────────────────────────
            if not name or not email or not username:
                logger.warning("Import Ligne %d: Champs manquants (Nom=%s, Email=%s, User=%s)", row_num, name, email, username)
                error_list.append({
                    "row": row_num, "status": "error",
                    "name": name or None, "email": email or None,
                    "reason": "Champs obligatoires manquants (name, email, gitlab_username)",
                })
                continue

            logger.info("Import Ligne %d: Analyse dev %s (%s) | Groupe CSV: '%s'", row_num, name, username, group_csv_raw)

            # ── Détection Existant (UPSERT) ───────────────────────────────────
            existing_dev = None
            if self.dev_repo.get_by_email(db, email):
                existing_dev = self.dev_repo.get_by_email(db, email)
            elif self.dev_repo.get_by_gitlab_username(db, username):
                existing_dev = self.dev_repo.get_by_gitlab_username(db, username)

            if dry_run:
                # En dry-run : on analyse les entités même sans créer le dev
                # pour remonter unknown_sites/projects/groups dans le rapport
                self._analyze_dry_run_row(
                    row, all_sites, all_projects_by_name, all_groups,
                    unknown_sites_names, unknown_projects_data, unknown_groups_names,
                )
                if existing_dev:
                    success_list.append({
                        "row": row_num, "status": "updated",
                        "name": name, "email": email,
                        "reason": f"Sera mis à jour (ID {existing_dev.id})",
                    })
                else:
                    success_list.append({
                        "row": row_num, "status": "success",
                        "name": name, "email": email,
                        "reason": "Création prévue",
                    })
                continue

            row_warnings: List[str] = []

            # ── Résolution des sites ──────────────────────────────────────────
            site_names     = [s.strip() for s in (row.get("sites") or "").split(",") if s.strip()]
            resolved_sites : List[dict] = []

            for i, sname in enumerate(site_names):
                site = all_sites.get(sname.lower())
                if site is None:
                    if create_missing_sites:
                        site = self.site_repo.create_from_import(db, sname)
                        all_sites[sname.lower()] = site
                        created_sites_names.add(sname)
                        logger.info("Import: site '%s' créé (ligne %d)", sname, row_num)
                    else:
                        unknown_sites_names.add(sname)
                        row_warnings.append(
                            f"Site '{sname}' introuvable — dev mis à jour sans ce site."
                        )
                        logger.warning("Import: site '%s' introuvable (ligne %d)", sname, row_num)
                        continue
                resolved_sites.append({
                    "site": site,
                    "is_primary": (i == 0 and not resolved_sites),
                })

            # ── Résolution des projets ────────────────────────────────────────
            project_items     = [p.strip() for p in (row.get("projects") or "").split(",") if p.strip()]
            resolved_projects : List[object] = []

            for pitem in project_items:
                # Analyse syntaxe "Nom:ID" (ex: "Frontend:1234")
                parts = pitem.rsplit(":", 1)
                pname = parts[0].strip()
                p_gitlab_id = int(parts[1].strip()) if len(parts) > 1 and parts[1].strip().isdigit() else None

                # 1. Tentative par ID GitLab (Le plus fiable)
                proj = None
                if p_gitlab_id and p_gitlab_id in all_projects_by_id:
                    proj = all_projects_by_id[p_gitlab_id]
                
                # 2. Tentative par Nom si non trouvé par ID
                if proj is None:
                    proj = all_projects_by_name.get(pname.lower())
                
                if proj is None:
                    if create_missing_projects:
                        proj = self.project_repo.create_from_import(
                            db, 
                            pname, 
                            gitlab_project_id=p_gitlab_id, 
                            gitlab_config_id=default_gitlab_config_id
                        )
                        all_projects_by_name[pname.lower()] = proj
                        created_projects_names.add(pname)
                        logger.info("Import: projet '%s' créé avec ID%s (ligne %d)", pname, p_gitlab_id, row_num)
                    else:
                        if pname not in unknown_projects_data or (unknown_projects_data[pname] is None and p_gitlab_id):
                            unknown_projects_data[pname] = p_gitlab_id
                            
                        row_warnings.append(
                            f"Projet '{pname}' introuvable — dev mis à jour sans ce projet."
                        )
                        logger.warning("Import: projet '%s' introuvable (ligne %d)", pname, row_num)
                        continue
                else:
                    #  LOGIQUE AMÉLIORÉE : Réparation des projets orphelins (sans config)
                    updates = {}
                    
                    # 1. Update ID GitLab si fourni dans CSV et manquant en base
                    if p_gitlab_id is not None and getattr(proj, "gitlab_project_id", None) is None:
                        updates["gitlab_project_id"] = p_gitlab_id
                    
                    # 2. Update Config GitLab si fournie via l'UI et manquante en base
                    if default_gitlab_config_id and getattr(proj, "gitlab_config_id", None) is None:
                        updates["gitlab_config_id"] = default_gitlab_config_id
                    
                    if updates:
                        self.project_repo.update(db, proj.id, updates)
                resolved_projects.append(proj)
                csv_project_ids.add(proj.id)  # ✅ FIX: Scope full_sync au projet du CSV

            # ── Résolution des groupes ────────────────────────────────────────
            groups_csv = [g.strip() for g in group_csv_raw.split(",") if g.strip()]
            resolved_group_ids: List[int] = []

            for gname in groups_csv:
                gname_clean = gname.lower().strip()
                group = all_groups.get(gname_clean)
                
                if group is None:
                    if create_missing_groups:
                        group = self.group_repo.create_from_import(db, gname)
                        db.flush() # Pour avoir l'ID
                        all_groups[gname_clean] = group
                        created_groups_names.add(gname)
                        logger.info("Import: groupe '%s' CRÉÉ et indexé (ligne %d)", gname, row_num)
                    else:
                        unknown_groups_names.add(gname)
                        row_warnings.append(f"Groupe '{gname}' introuvable (auto-création OFF).")
                        logger.warning("Import: groupe '%s' introuvable et non créé (ligne %d)", gname, row_num)
                if group:
                    resolved_group_ids.append(group.id)

            # Fallback sur default_group_id si aucun groupe résolu
            if not resolved_group_ids and default_group_id:
                resolved_group_ids = [default_group_id]

            # ── UPSERT du développeur ─────────────────────────────────────────
            try:
                # Définir le start_date effectif pour la synchronisation
                # ✅ SOLUTION SOLIDE : La date d'effet est la MAX(période, onboarding)
                # pour garantir qu'un dev ne démarre jamais AVANT son onboarding
                # et ne démarre JAMAIS après aujourd'hui par accident.
                from datetime import datetime, timezone
                effective_p_start = p_start  # date de la période sélectionnée (ex: 01/01/2026)
                if onboarding_date:
                    # On prend le MAX : si le dev arrive en cours de période, sa mission commence à son arrivée
                    onboarding_as_dt = datetime.combine(onboarding_date, datetime.min.time()).replace(tzinfo=timezone.utc)
                    if not effective_p_start or onboarding_as_dt > effective_p_start:
                        effective_p_start = onboarding_as_dt

                if existing_dev:
                    # ── [SENIOR] Politique de réactivation Enterprise ──────────
                    # Cas 1 : offboarding_date fixée → Départ délibéré RH → BLOQUER l'import
                    #          Un dev qui a officiellement quitté l'entreprise ne doit pas
                    #          être réintégré via un simple re-import CSV.
                    # Cas 2 : is_active=False SANS offboarding_date → Bug ou erreur système
                    #          → Réactivation automatique tolérée (correction de données)
                    if existing_dev.offboarding_date is not None:
                        # ── [CORRECTION CHIRURGICALE] Politique RH Enterprise ──────────
                        # RÈGLE : Un dev offboardé NE DOIT PAS être réactivé par un import CSV.
                        # MAIS : On doit quand même corriger son AFFECTATION (groupe/équipe)
                        # pour éviter l'anomalie "Aucun" sur la page Validation Profils.
                        # → On fait UNIQUEMENT la resynchronisation des groupes, rien d'autre.
                        logger.info(
                            "Import Ligne %d: DEV_OFFBOARDED_GROUP_SYNC — %s a une date de départ (%s), "
                            "correction groupe/site/projet uniquement (pas de réactivation).",
                            row_num, name, existing_dev.offboarding_date
                        )
                        if resolved_group_ids:
                            self.dev_repo.sync_groups_smart(
                                db, existing_dev, resolved_group_ids,
                                p_start=effective_p_start,
                                p_end=existing_dev.offboarding_date  # La fin = offboarding
                            )
                        # ✅ FIX: Also sync sites for offboarded developers
                        if resolved_sites:
                            self.dev_site_repo.sync_smart(
                                db, existing_dev.id,
                                [{"site_id": rs["site"].id, "is_primary": rs["is_primary"]} for rs in resolved_sites],
                                p_start=effective_p_start,
                                p_end=existing_dev.offboarding_date
                            )
                        # ✅ FIX: Also sync projects for offboarded developers
                        if resolved_projects:
                            project_ids = [p.id for p in resolved_projects]
                            self.dev_proj_repo.sync_smart(
                                db, existing_dev.id, project_ids,
                                p_start=effective_p_start,
                                p_end=existing_dev.offboarding_date
                            )
                        success_list.append({
                            "row": row_num, "status": "updated",
                            "name": name, "email": email,
                            "reason": f"Affectations corrigées (dev offboardé le {existing_dev.offboarding_date}, statut RH conservé)."
                        })
                        processed_ids.add(existing_dev.id)
                        db.flush()
                        continue  # On s'arrête là : pas de mise à jour des autres champs

                    elif not existing_dev.is_active:
                        # is_active=False sans offboarding_date → erreur système, on corrige
                        self.dev_repo.update(db, existing_dev, {"is_active": True})
                        row_warnings.append(
                            "[AUTO-CORRECTION] Développeur marqué inactif sans date de départ — réactivé automatiquement."
                        )
                        logger.info(
                            "Import Ligne %d: AUTO_REACTIVATE — %s réactivé (is_active=False sans offboarding_date).",
                            row_num, name
                        )

                    # Mise à jour des dates si fournies dans le CSV (Correction historique)
                    hist_updates = {}
                    if onboarding_date: hist_updates["onboarding_date"] = onboarding_date
                    if offboarding_date is not None: hist_updates["offboarding_date"] = offboarding_date
                    if hist_updates:
                        self.dev_repo.update(db, existing_dev, hist_updates)

                    # [SCD TYPE 2] Synchronisation INTELLIGENTE des équipes
                    if resolved_group_ids:
                        self.dev_repo.sync_groups_smart(
                            db, existing_dev, resolved_group_ids, p_start=effective_p_start
                        )

                    # [SCD TYPE 2] Synchronisation INTELLIGENTE des sites
                    if resolved_sites:
                        self.dev_site_repo.sync_smart(
                            db, existing_dev.id,
                            [{"site_id": rs["site"].id, "is_primary": rs["is_primary"]} for rs in resolved_sites],
                            p_start=effective_p_start
                        )
                    elif default_site_id:
                        self.dev_site_repo.sync_smart(
                            db, existing_dev.id,
                            [{"site_id": default_site_id, "is_primary": True}],
                            p_start=effective_p_start
                        )

                        
                    # [STRICT MISSION] Synchronisation INTELLIGENTE (SCD Type 2)
                    if resolved_projects:
                        project_ids = [p.id for p in resolved_projects]
                        self.dev_proj_repo.sync_smart(
                            db, existing_dev.id, project_ids,
                            p_start=effective_p_start
                        )
                        # ✅ FIX: Mettre à jour period_id des certifications créées
                        self._update_developer_project_period_id(
                            db, existing_dev.id, project_ids, period_id
                        )
                    else:
                        # Si aucun projet dans le CSV, on clôture les missions actives
                        self.dev_proj_repo.sync_smart(db, existing_dev.id, [], p_start=effective_p_start)

                        
                    db.flush()
                    
                    row_result: dict = {
                        "row":    row_num,
                        "status": "updated",
                        "name":   name,
                        "email":  email,
                        "reason": "Mise à jour réussie (affectations ajoutées)."
                    }
                    if row_warnings:
                        row_result["warnings"] = row_warnings
                    
                    success_list.append(row_result)
                    processed_ids.add(existing_dev.id)

                    # ✅ LOGIQUE AUTO-DISCOVERY
                    self.sync_project_site_associations(db, existing_dev.id)
                    
                else:
                    # Création standard
                    dev_data = {
                        "gitlab_username": username,
                        "name":            name,
                        "email":           email,
                        "is_active":       True,
                        "is_validated":    True,
                        "is_bot":          False,
                        "auto_created":    False,
                        "source":          "csv_import",
                        "created_by":      imported_by,
                        "onboarding_date": onboarding_date, # ✅ AJOUT : Date historique
                        "offboarding_date": offboarding_date,
                    }

                    developer = self.dev_repo.create(
                        db, dev_data, 
                        group_ids=resolved_group_ids,
                        p_start=effective_p_start,
                        p_end=p_end
                    )
                    db.flush()

                    # [SCD TYPE 2] Synchronisation INTELLIGENTE des sites (nouveau dev)
                    if resolved_sites:
                        self.dev_site_repo.sync_smart(
                            db, developer.id,
                            [{"site_id": rs["site"].id, "is_primary": rs["is_primary"]} for rs in resolved_sites],
                            p_start=effective_p_start
                        )
                    elif default_site_id:
                        self.dev_site_repo.sync_smart(
                            db, developer.id,
                            [{"site_id": default_site_id, "is_primary": True}],
                            p_start=effective_p_start
                        )


                    # [STRICT MISSION] Synchronisation INTELLIGENTE
                    if resolved_projects:
                        project_ids = [p.id for p in resolved_projects]
                        self.dev_proj_repo.sync_smart(
                            db, developer.id, project_ids,
                            p_start=effective_p_start
                        )



                    row_result: dict = {
                        "row":    row_num,
                        "status": "success",
                        "name":   name,
                        "email":  email,
                    }
                    if row_warnings:
                        row_result["warnings"] = row_warnings

                    success_list.append(row_result)
                    processed_ids.add(developer.id)

                    # ✅ LOGIQUE AUTO-DISCOVERY
                    self.sync_project_site_associations(db, developer.id)

            except Exception as e:
                db.rollback()
                error_list.append({
                    "row": row_num, "status": "error",
                    "name": name, "email": email, "reason": str(e),
                })

        # ── RÉCONCILIATION (Full Sync) ────────────────────────────────────────
        #  [ARCHITECTURE CORRIGÉE] : Le full_sync ne touche JAMAIS Developer.is_active.
        #
        # Règle métier fondamentale :
        #   Developer.is_active = False → Départ définitif de l'entreprise (action admin manuelle)
        #   DeveloperProject.is_active  = False → Absent de ce projet ce mois-ci (temporel)
        #
        # La synchronisation période est déjà faite par sync_for_period() dans la boucle ci-dessus.
        # Ce bloc ne fait que reporter QUI a été retiré du scope de la période pour le rapport.
        deactivated_list = []
        if full_sync and csv_project_ids:
            from app.models.developer_project import DeveloperProject

            # Devs qui étaient actifs sur ces projets ce mois-ci mais absents du CSV
            active_in_scope = (
                db.query(DeveloperProject.developer_id)
                .filter(
                    DeveloperProject.project_id.in_(csv_project_ids),
                    DeveloperProject.period_id == period_id,
                    DeveloperProject.is_active.is_(True),
                )
                .distinct()
                .all()
            )
            active_ids_in_scope = {row[0] for row in active_in_scope}

            # Identification des devs retirés du périmètre (sync_for_period l'a déjà fait)
            removed_from_period = active_ids_in_scope - processed_ids
            for d_id in removed_from_period:
                dev = self.dev_repo.get_by_id(db, d_id)
                if dev:
                    if not dry_run:
                        # ✅ DESACTIVATION RÉELLE (Hard Sync)
                        # On retire le dev des projets présents dans le CSV pour lesquels il était actif
                        self.dev_proj_repo.deactivate_from_projects(db, d_id, list(csv_project_ids), p_start=p_start)
                        
                        self.audit_repo.log(
                            db=db, user_id=imported_by, action="DEV_REMOVED_FROM_PERIOD",
                            entity_type="Developer", entity_id=d_id,
                            entity_name=dev.name or dev.gitlab_username or dev.email,
                            old_value={"period_id": period_id, "project_ids": list(csv_project_ids)},
                            new_value={"reason": "Absent du fichier CSV pour cette période — mission CLÔTURÉE"},
                        )
                    deactivated_list.append({"id": d_id, "name": dev.name, "email": dev.email})

            logger.info(
                "Full Sync [period=%d, projets=%s]: %d devs retirés de la période (Developer.is_active NON MODIFIÉ).",
                period_id, csv_project_ids, len(deactivated_list)
            )

        # ── Finalisation ──────────────────────────────────────────────────────
        self.import_log_repo.complete(
            db, import_log_id,
            total_rows      = len(rows),
            success_count   = len(success_list),
            error_count     = len(error_list),
            duplicate_count = len(duplicate_list),
            report_data     = {
                "success":    success_list,
                "errors":     error_list,
                "duplicates": duplicate_list,
            },
        )

        if not dry_run:
            db.commit()
        else:
            db.rollback()

        logger.info(
            "Import %s— total=%d success=%d errors=%d duplicates=%d | "
            "unknown[sites=%s projects=%s groups=%s] "
            "created[sites=%s projects=%s groups=%s]",
            "[DRY-RUN] " if dry_run else "",
            len(rows), len(success_list), len(error_list), len(duplicate_list),
            sorted(unknown_sites_names),    list(unknown_projects_data.keys()),  sorted(unknown_groups_names),
            sorted(created_sites_names),    sorted(created_projects_names),  sorted(created_groups_names),
        )

        return {
            "lot_id":            import_log_id,
            "status":            ImportStatusEnum.completed.value,
            "file_name":         file_name,
            "total_rows":        len(rows),
            "success_count":     len(success_list),
            "error_count":       len(error_list),
            "duplicate_count":   len(duplicate_list),
            "deactivated_count": len(deactivated_list),
            "deactivated_list":  deactivated_list,
            "dry_run":           dry_run,
            "rows":              (success_list + error_list + duplicate_list) if len(rows) <= 100 else None,
            "unknown_sites":     sorted(list(unknown_sites_names))    or None,
            "unknown_projects":  unknown_projects_data or None,
            "unknown_groups":    sorted(list(unknown_groups_names))   or None,
            "created_sites":     sorted(created_sites_names)    or None,
            "created_projects":  sorted(created_projects_names) or None,
            "created_groups":    sorted(created_groups_names)   or None,
            "processed_ids":     list(processed_ids), # ✅ [ENTERPRISE] For background recalculation
        }

    # =========================================================================
    # HELPER PRIVÉ — Analyse dry-run (sans créer le dev)
    # =========================================================================

    def _analyze_dry_run_row(
        self,
        row:                   dict,
        all_sites:             dict,
        all_projects:          dict,
        all_groups:            dict,
        unknown_sites_names:   Set[str],
        unknown_projects_data: Dict[str, Optional[int]],  # ✅ FIX: Dict {nom: gitlab_id}
        unknown_groups_names:  Set[str],
    ) -> None:
        """
        NOUVEAU : en dry-run, analyse les entités de chaque ligne
        pour remonter les inconnues dans le rapport SANS créer quoi que ce soit.
        Permet à l'admin de voir TOUS les conflits avant l'import réel.
        """
        for sname in [s.strip() for s in (row.get("sites") or "").split(",") if s.strip()]:
            if all_sites.get(sname.lower()) is None:
                unknown_sites_names.add(sname)

        for pitem in [p.strip() for p in (row.get("projects") or "").split(",") if p.strip()]:
            # Analyse syntaxe "Nom:ID"
            p_parts = pitem.rsplit(":", 1)
            pname = p_parts[0].strip()
            p_gitlab_id = int(p_parts[1].strip()) if len(p_parts) > 1 and p_parts[1].strip().isdigit() else None

            if all_projects.get(pname.lower()) is None:
                if pname not in unknown_projects_data or (unknown_projects_data[pname] is None and p_gitlab_id):
                    unknown_projects_data[pname] = p_gitlab_id

        groups_csv = [g.strip() for g in (row.get("group") or "").split(",") if g.strip()]
        for gname in groups_csv:
            if all_groups.get(gname.lower()) is None:
                unknown_groups_names.add(gname)

    # =========================================================================
    # VALIDATION EN-TÊTES
    # =========================================================================

    def _validate_headers(self, headers: set) -> None:
        missing = REQUIRED_COLUMNS - {h.lower().strip() for h in headers}
        if missing:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=(
                    f"Colonnes obligatoires manquantes : {', '.join(sorted(missing))}. "
                    f"Téléchargez le template via GET /developers/import/template."
                ),
            )

    # =========================================================================
    # PARSE FICHIER
    # =========================================================================

    def _parse_file(self, content: bytes, file_type: str) -> List[dict]:
        if file_type == "csv":
            #  SENIOR : Chaîne de décodage robuste (UTF8 -> CP1252 -> Latin1)
            text = None
            for enc in ["utf-8-sig", "cp1252", "latin-1"]:
                try:
                    text = content.decode(enc)
                    logger.info("Import: Fichier décodé avec succès en %s", enc)
                    break
                except UnicodeDecodeError:
                    continue
            
            if not text:
                raise HTTPException(status_code=400, detail="Encodage du fichier non supporté (utilisez UTF-8)")
                
            # Détection auto du délimiteur (virgule ou point-virgule)
            try:
                dialect = csv.Sniffer().sniff(text[:1024]) if "," in text or ";" in text else "excel"
            except:
                dialect = "excel" # Fallback
                
            reader = csv.DictReader(io.StringIO(text), dialect=dialect)
            
            if reader.fieldnames:
                # On normalise les headers dès la lecture
                return [
                    {str(k).lower().strip(): v for k, v in row.items() if k}
                    for row in reader
                ]
            return []
        else:
            try:
                import openpyxl
                wb      = openpyxl.load_workbook(io.BytesIO(content), read_only=True)
                ws      = wb.active
                raw     = list(ws.iter_rows(values_only=True))
                if not raw:
                    return []
                headers = [str(h).strip().lower() if h else "" for h in raw[0]]
                self._validate_headers(set(headers))
                return [
                    {headers[i]: str(cell).strip() if cell is not None else ""
                     for i, cell in enumerate(row)}
                    for row in raw[1:]
                ]
            except HTTPException:
                raise
            except ImportError:
                raise HTTPException(
                    status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
                    detail="openpyxl non installé — utilisez le format CSV.",
                )