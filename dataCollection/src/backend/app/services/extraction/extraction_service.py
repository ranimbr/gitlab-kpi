"""GitLab extraction orchestrator and persistence workflow."""
import asyncio
import hashlib
import json
import logging
from datetime import datetime, timezone
from pathlib import Path
from typing import Dict, List, Optional, Tuple

from sqlalchemy.exc import SQLAlchemyError
from sqlalchemy.orm import Session

from app.core.config import get_settings
from app.models.extraction_lot import ExtractionLot, ExtractionStatusEnum, ExtractionTypeEnum
from app.models.gitlab_config import GitLabConfig
from app.models.developer import Developer
from app.models.period import Period
from app.repositories.audit_log_repository import AuditLogRepository
from app.repositories.commit_repository import CommitRepository
from app.repositories.developer_repository import DeveloperRepository
from app.repositories.developer_project_repository import DeveloperProjectRepository
from app.repositories.extraction_lot_repository import ExtractionLotRepository
from app.repositories.developer_site_repository import DeveloperSiteRepository
from app.repositories.merge_request_repository import MergeRequestRepository
from app.repositories.comment_repository import CommentRepository
from app.repositories.period_repository import PeriodRepository
from app.repositories.project_repository import ProjectRepository
from app.services.extraction.developer_identity import (
    matches_target_devs,
    normalize_email,
    resolve_developer,
    normalize_username,
)
from app.services.extraction.extraction_filters import (
    build_period_window,
    build_target_vectors,
    find_matched_target_dev,
    is_in_period,
    is_target_author_commit,
    is_target_author_note,
    mr_matches_target_devs,
)
from app.services.extraction.gitlab_fetch_strategy import (
    fetch_unique_commits,
)
from app.services.gitlab.gitlab_client import GitLabAPIError, GitLabClient, GitLabProjectNotFoundError
from app.services.gitlab.gitlab_mapper import GitLabMapper
from app.utils.mission_utils import (
    get_certified_developers_for_mission,
    get_developers_for_data_extraction,
    is_project_contribution_certified,
    is_contribution_certified
)

logger   = logging.getLogger(__name__)
settings = get_settings()

# Main extraction service.

class ExtractionService:

    def __init__(self):
        self.project_repo     = ProjectRepository()
        self.developer_repo   = DeveloperRepository()
        self.dev_project_repo = DeveloperProjectRepository()
        self.commit_repo      = CommitRepository()
        self.mr_repo          = MergeRequestRepository()
        self.comment_repo     = CommentRepository()
        self.lot_repo         = ExtractionLotRepository()
        self.audit_repo       = AuditLogRepository()
        self.period_repo      = PeriodRepository()

    @staticmethod
    def _log_context(*, project_id: Optional[int] = None, lot_id: Optional[int] = None, phase: str = "unknown", **extra) -> str:
        parts = [f"phase={phase}"]
        if project_id is not None:
            parts.append(f"project_id={project_id}")
        if lot_id is not None:
            parts.append(f"lot_id={lot_id}")
        for key, value in extra.items():
            parts.append(f"{key}={value}")
        return " | ".join(parts)

    def _update_lot_progress(self, db: Session, lot, progress: int, action: str):
        """[SENIOR] Mise à jour granulaire du statut pour feedback UI temps réel."""
        lot.step_progress = progress
        lot.current_action = action
        db.flush()

    # =========================================================================
    # REALTIME EXTRACTION
    # =========================================================================

    async def run_realtime_extraction(
        self,
        db:                Session,
        gitlab_project_id: int,
        gitlab_config:     GitLabConfig,
        triggered_by_user: int,
    ) -> ExtractionLot:
        from fastapi import HTTPException, status as http_status

        now    = datetime.now(timezone.utc)
        period = self.period_repo.get_or_create(db, now.year, now.month)

        if not self.period_repo.is_open(db, period.id):
            raise HTTPException(
                status_code=http_status.HTTP_409_CONFLICT,
                detail=f"Period {period.year}/{period.month:02d} is closed (RG-01).",
            )

        project = self.project_repo.get_by_gitlab_id(db, gitlab_project_id)
        client = GitLabClient(gitlab_config)
        if not project:
            project_data = await client.get_project(gitlab_project_id)
            if not project_data:
                raise HTTPException(
                    status_code=404,
                    detail=f"GitLab project id={gitlab_project_id} not found",
                )
            mapped                     = GitLabMapper.map_project(project_data)
            mapped["gitlab_config_id"] = gitlab_config.id
            project                    = self.project_repo.create(db, mapped)
            db.flush()
        elif not project.namespace or not project.path:
            logger.info(f"Enriching project id={project.id} with GitLab metadata...")
            try:
                project_data = await client.get_project(gitlab_project_id)
                if project_data:
                    mapped = GitLabMapper.map_project(project_data)
                    self.project_repo.update(db, project.id, {
                        "name": mapped.get("name"),
                        "path": mapped.get("path"),
                        "namespace": mapped.get("namespace"),
                        "description": mapped.get("description"),
                        "visibility": mapped.get("visibility"),
                        "default_branch": mapped.get("default_branch"),
                    })
                    db.flush()
            except Exception as e:
                logger.warning(f"Failed to enrich project details for gitlab_id={gitlab_project_id}: {e}")

        lot = ExtractionLot(
            extraction_type=ExtractionTypeEnum.REALTIME,
            status=ExtractionStatusEnum.running,
            period_id=period.id,
            project_id=project.id,
            triggered_by=triggered_by_user,
        )
        db.add(lot)
        db.flush()

        self.audit_repo.log(
            db=db, user_id=triggered_by_user, action="LAUNCH_EXTRACTION",
            entity_type="ExtractionLot", entity_id=lot.id,
            new_value={"extraction_type": "REALTIME", "project_id": project.id},
        )

        import time
        t_start = time.monotonic()
        
        try:
            client = GitLabClient(gitlab_config)
            self._update_lot_progress(db, lot, 10, "Initialisation de la connexion GitLab...")
            
            logger.info(self._log_context(project_id=project.id, lot_id=lot.id, phase="realtime_start"))
            
            # [SENIOR FIX] Identification de la mission pour le Realtime
            # On récupère les IDs des développeurs officiellement rattachés à ce projet
            from app.models.developer_project import DeveloperProject
            eligible_dev_ids = [
                r[0] for r in db.query(DeveloperProject.developer_id)
                .filter(DeveloperProject.project_id == project.id, DeveloperProject.is_active == True)
                .all()
            ]

            self._update_lot_progress(db, lot, 20, "Extraction des Commits et Merge Requests...")
            counts = await self._extract_data(db, project, lot, client, developer_ids=eligible_dev_ids)
            logger.info(
                f"[DIAGNOSTIC] Extraction REALTIME lancée pour projet={project.gitlab_project_id}"
            )
            c_count, m_count = counts if counts else (0, 0)
            
            self._update_lot_progress(db, lot, 70, "Réconciliation des auteurs (re-linkage)...")
            relinked = self._relink_commits_to_developers(db, project.id)
            if relinked > 0:
                logger.info(
                    self._log_context(
                        project_id=project.id,
                        lot_id=lot.id,
                        phase="realtime_relink",
                        relinked_commits=relinked,
                    )
                )

            self._update_lot_progress(db, lot, 90, "Mise à jour des métadonnées projet...")
            self._update_project_last_commit(db, project.id)

            lot.status        = ExtractionStatusEnum.completed
            lot.completed_at  = datetime.now(timezone.utc)
            lot.error_message = None
            lot.step_progress = 100
            lot.current_action = "Extraction terminée avec succès"
            lot.items_count   = c_count + m_count
            lot.duration_ms   = int((time.monotonic() - t_start) * 1000)
            db.commit()
            
            # 🚀 [SENIOR AUTO-SNAPSHOT] Déclenchement automatique des KPIs
            try:
                from app.services.kpi.kpi_aggregator import KpiAggregator
                aggregator = KpiAggregator(db)
                aggregator.generate_monthly_snapshots(
                    project_id=project.id,
                    year=period.year,
                    month=period.month,
                    lot_id=lot.id
                )
                db.commit()
                logger.info(f"[AUTO-SNAPSHOT] Success for Project {project.id}")
            except Exception as e:
                logger.error(f"[AUTO-SNAPSHOT] Failed for Project {project.id}: {e}")

            logger.info(self._log_context(project_id=project.id, lot_id=lot.id, phase="realtime_completed"))

        except GitLabProjectNotFoundError as e:
            db.rollback()
            error_msg = f"CRITICAL: Project not found/accessible on GitLab. Reason: {e.message}"
            try:
                lot.status = ExtractionStatusEnum.failed
                lot.completed_at = datetime.now(timezone.utc)
                lot.error_message = error_msg
                db.commit()
            except Exception:
                pass
            logger.error(
                self._log_context(
                    project_id=project.id,
                    lot_id=lot.id,
                    phase="realtime_failed_404",
                    error=error_msg,
                )
            )
            raise
        except (GitLabAPIError, SQLAlchemyError) as e:
            db.rollback()
            error_msg = str(e)[:1000]
            try:
                lot.status        = ExtractionStatusEnum.failed
                lot.completed_at  = datetime.now(timezone.utc)
                lot.error_message = error_msg
                db.add(lot)
                db.commit()
            except Exception:
                pass
            logger.error(
                self._log_context(
                    project_id=project.id,
                    lot_id=lot.id,
                    phase="realtime_failed",
                    error=error_msg,
                )
            )
            raise

        return lot

    # =========================================================================
    # MONTHLY EXTRACTION
    # =========================================================================

    async def run_monthly_extraction(
        self,
        db:            Session,
        project_id:    int,
        period_id:     int,
        gitlab_config: GitLabConfig,
        is_backfill:   bool = False,
    ) -> ExtractionLot:
        from fastapi import HTTPException, status as http_status

        project = self.project_repo.get_by_id(db, project_id)
        if not project:
            raise ValueError(f"Project id={project_id} not found")
            
        period = db.query(Period).filter(Period.id == period_id).first()
        if not period:
            raise ValueError(f"Period id={period_id} not found")
        if period.status == "closed":
            raise HTTPException(
                status_code=http_status.HTTP_409_CONFLICT,
                detail=f"Period {period.year}/{period.month} is closed. Extraction locked."
            )

        existing_lot = self.lot_repo.get_monthly(db, period_id, project_id)

        if existing_lot and not is_backfill:
            raise HTTPException(
                status_code=http_status.HTTP_409_CONFLICT,
                detail=(
                    f"A MONTHLY extraction already exists for "
                    f"project_id={project_id} period_id={period_id}. "
                    f"Use is_backfill=True to recalculate."
                ),
            )

        if existing_lot and is_backfill:
            lot              = existing_lot
            lot.status       = ExtractionStatusEnum.running
            lot.completed_at = lot.error_message = None
            db.flush()
        else:
            lot = ExtractionLot(
                extraction_type=ExtractionTypeEnum.MONTHLY,
                status=ExtractionStatusEnum.running,
                period_id=period_id,
                project_id=project.id,
            )
            db.add(lot)
            db.flush()

        import time
        t_start = time.monotonic()
        
        try:
            client = GitLabClient(gitlab_config)
            self._update_lot_progress(db, lot, 10, "Initialisation mensuelle...")

            if not project.namespace or not project.path:
                logger.info(f"Enriching project id={project.id} with GitLab metadata during monthly extraction...")
                try:
                    project_data = await client.get_project(project.gitlab_project_id)
                    if project_data:
                        mapped = GitLabMapper.map_project(project_data)
                        self.project_repo.update(db, project.id, {
                            "name": mapped.get("name"),
                            "path": mapped.get("path"),
                            "namespace": mapped.get("namespace"),
                            "description": mapped.get("description"),
                            "visibility": mapped.get("visibility"),
                            "default_branch": mapped.get("default_branch"),
                        })
                        db.flush()
                except Exception as e:
                    logger.warning(f"Failed to enrich project details for gitlab_id={project.gitlab_project_id}: {e}")
            
            # 🧠 [SENIOR ENGINE] - Sélection Intelligente basée sur le Cycle de Vie
            # On ne veut extraire que les devs qui étaient présents dans l'entreprise durant cette période.
            from app.services.extraction.extraction_filters import build_period_window
            _, _, p_start, p_end = build_period_window(period)
            
            # [STRICT MISSION FILTER - ENTERPRISE GRADE] ───────────────────────
            # On utilise get_developers_for_data_extraction pour l'extraction de données brutes
            # SANS la règle RG-02 des 15 jours (règle de proratisation RH)
            # La règle RG-02 est appliquée uniquement au niveau du calcul des KPIs
            eligible_ids = get_developers_for_data_extraction(
                db=db,
                project_id=project.id,
                period_id=period.id,
                start_date=p_start.date(),
                end_date=p_end.date()
            )

            logger.info(
                f"[SMART MISSION FILTER] Project '{project.name}' (ID: {project.id}) | "
                f"Period: {period.year}/{period.month} | "
                f"Eligible devs: {len(eligible_ids)} "
                f"(Includes persistent & monthly-bound - HUMAN ONLY)"
            )

            if not eligible_ids:
                logger.warning(
                    f"[STRICT MISSION FILTER] Empty cohort for project {project.id}. "
                    f"Check if developers are assigned to this project in the CSV mission roster."
                )

            lot.metadata_summary = (
                f"Cohorte de {len(eligible_ids)} développeurs "
                f"assignés au projet '{project.name}' "
                f"(Window: {p_start.date()} → {p_end.date()})"
            )
            
            logger.info(
                self._log_context(
                    project_id=project.id, lot_id=lot.id, phase="monthly_start", 
                    period_id=period_id, eligible_devs_count=len(eligible_ids)
                )
            )
            
            self._update_lot_progress(db, lot, 20, f"Extraction pour {len(eligible_ids)} développeurs éligibles...")
            counts = await self._extract_data(db, project, lot, client, developer_ids=eligible_ids)
            c_count, m_count = counts if counts else (0, 0)
            
            self._update_lot_progress(db, lot, 70, "Réassociation des commits orphelins...")
            relinked = self._relink_commits_to_developers(db, project.id)
            if relinked > 0:
                logger.info(
                    self._log_context(
                        project_id=project.id,
                        lot_id=lot.id,
                        phase="monthly_relink",
                        relinked_commits=relinked,
                    )
                )

            self._update_lot_progress(db, lot, 85, "Calcul des métadonnées projet...")
            self._update_project_last_commit(db, project.id)

            self._update_lot_progress(db, lot, 90, "Génération du fichier dump...")
            file_path, md5     = self._generate_dump_file(db, lot)
            lot.generated_file = file_path
            lot.md5sum         = md5
            lot.status         = ExtractionStatusEnum.completed
            lot.completed_at   = datetime.now(timezone.utc)
            lot.error_message  = None
            lot.step_progress  = 100
            lot.current_action = "Extraction mensuelle terminée"
            lot.items_count    = c_count + m_count
            lot.api_calls_count = client.api_calls_count
            lot.retry_count    = client.retry_count
            lot.duration_ms    = int((time.monotonic() - t_start) * 1000)
            db.flush()
            db.commit() # Commit before snapshotting

            # 🚀 [SENIOR AUTO-SNAPSHOT] Déclenchement automatique des KPIs
            try:
                from app.services.kpi.kpi_aggregator import KpiAggregator
                aggregator = KpiAggregator(db)
                aggregator.generate_monthly_snapshots(
                    project_id=project.id,
                    year=period.year,
                    month=period.month,
                    lot_id=lot.id
                )
                db.commit()
                logger.info(f"[AUTO-SNAPSHOT] Success for Project {project.id} (Monthly)")
            except Exception as e:
                logger.error(f"[AUTO-SNAPSHOT] Failed for Project {project.id} (Monthly): {e}")

        except GitLabProjectNotFoundError as e:
            db.rollback()
            error_msg = f"ERROR: Target project ID is inaccessible (404). Check API permissions. Details: {e.message}"
            try:
                lot.status = ExtractionStatusEnum.failed
                lot.completed_at = datetime.now(timezone.utc)
                lot.error_message = error_msg
                if 'client' in locals() and client:
                    lot.api_calls_count = client.api_calls_count
                    lot.retry_count = client.retry_count
                db.add(lot)
                db.commit()
            except Exception:
                pass
            logger.error(
                self._log_context(
                    project_id=project.id,
                    lot_id=lot.id,
                    phase="monthly_failed_404",
                    error=error_msg,
                )
            )
            raise
        except (GitLabAPIError, SQLAlchemyError) as e:
            db.rollback()
            error_msg         = str(e)[:1000]
            try:
                lot.status        = ExtractionStatusEnum.failed
                lot.completed_at  = datetime.now(timezone.utc)
                lot.error_message = error_msg
                db.add(lot)
                db.commit()
                
                # [ENTERPRISE RETRY] Schedule automatic retry for failed extraction
                from app.services.retry_service import get_retry_service
                retry_service = get_retry_service()
                asyncio.create_task(retry_service.schedule_retry(db, lot.id))
                logger.info(f"[RETRY] Automatic retry scheduled for failed lot {lot.id}")
                
            except Exception:
                pass
            logger.error(
                self._log_context(
                    project_id=project.id,
                    lot_id=lot.id,
                    phase="monthly_failed",
                    error=error_msg,
                )
            )
            raise

        return lot

    # =========================================================================
    # EXTRACT DATA
    # =========================================================================

    async def _extract_data(
        self, 
        db: Session, 
        project, 
        lot, 
        client, 
        developer_ids: Optional[List[int]] = None, 
        fast_mode: bool = False
    ) -> Tuple[int, int]:
        c_count = await self._extract_commits(db, project, lot, client, developer_ids=developer_ids, fast_mode=fast_mode)
        db.flush()
        m_count = await self._extract_merge_requests(db, project, lot, client, developer_ids=developer_ids, fast_mode=fast_mode)
        db.flush()
        logger.info(
            self._log_context(
                project_id=project.id,
                lot_id=lot.id,
                phase="extract_data_counts",
                commits_created=c_count,
                mrs_created_or_updated=m_count,
            )
        )

        if (c_count + m_count) == 0:
            msg = "Warning: 0 items matched your filters (check Date/Authors)."
            lot.error_message = msg
            logger.warning(self._log_context(project_id=project.id, lot_id=lot.id, phase="extract_data_empty"))

        return c_count, m_count

    async def _ensure_developers_ids(self, db: Session, target_devs: List[Developer], client) -> None:
        """
        [FIX-ID-RESHAPE] Vérifie et résout les gitlab_user_id manquants via l'API GitLab.
        Crucial pour les imports CSV qui ne contiennent que le username.
        [SENIOR] Version Robuste : si GitLab bloque (429), on arrête d'insister et on passe à la suite.
        """
        for dev in target_devs:
            if not dev.gitlab_user_id and dev.gitlab_username:
                logger.debug(f"Resolving GitLab ID for {dev.gitlab_username}...")
                try:
                    # On utilise fast_fail pour ne pas geler l'extraction pendant 10min
                    user_data = await client.get_user_by_username(dev.gitlab_username)
                    if user_data and "id" in user_data:
                        dev.gitlab_user_id = user_data["id"]
                        logger.info(f"Matched {dev.gitlab_username} to ID {dev.gitlab_user_id}")
                    else:
                        logger.warning(f"Could not find GitLab ID for username: {dev.gitlab_username}")
                except Exception as e:
                    # Si c'est un rate limit (429), on arrête tout le loop de résolution
                    if hasattr(e, 'status_code') and e.status_code == 429:
                        logger.warning(f"Aborting ID resolution for this session: GitLab Rate Limit hit.")
                        break
                    logger.error(f"Error resolving GitLab ID for {dev.gitlab_username}: {e}")
        db.flush()

    # =========================================================================
    # [FIX-DEDUP-3] EXTRACT COMMITS — avec pré-chargement des membres
    # =========================================================================

    async def _extract_commits(
        self, 
        db, 
        project, 
        lot, 
        client, 
        developer_ids: Optional[List[int]] = None, 
        fast_mode: bool = False
    ) -> int:
        """
        [FIX-DEDUP-3] Pré-charge les membres avec emails officiels GitLab
        avant d'extraire les commits.
        """
        # 🎯 STRATÉGIE SENIOR : Extraction Robuste
        target_devs = []
        target_devs_map = {}
        
        # [SENIOR HARDENING - ENTERPRISE STRICT] ──────────────────────────────
        # On ne se contente plus de faire confiance à developer_ids.
        # On utilise get_developers_for_data_extraction pour l'extraction de données brutes
        # SANS la règle RG-02 des 15 jours
        certified_mission_ids = set(get_developers_for_data_extraction(
            db=db, project_id=project.id, period_id=lot.period_id
        ))

        effective_ids = []
        if developer_ids:
            effective_ids = [did for did in developer_ids if did in certified_mission_ids]
            if len(effective_ids) < len(developer_ids):
                logger.warning(
                    f"[STRICT MISSION] {len(developer_ids) - len(effective_ids)} "
                    f"développeurs sélectionnés manuellement ont été rejetés car non-assignés au projet {project.name}."
                )
        else:
            effective_ids = list(certified_mission_ids)

        if not effective_ids:
            return 0

        target_devs = db.query(Developer).filter(Developer.id.in_(effective_ids)).all()
        target_devs_map = {d.id: d for d in target_devs}
        
        # [FIX-ID-SYNC] S'assure que les IDs GitLab numériques sont présents
        await self._ensure_developers_ids(db, target_devs, client)

        members_map: Dict[int, dict] = {}
        # [SENIOR Optimization] On évite le fetch des membres si on est en mode ciblé.
        # Pourquoi ? car la boucle `_extract_commits` a désormais un raccourci `matched_dev`
        # qui utilise directement les `target_devs` pré-chargés par ID/Email sans avoir
        # besoin du mapping membre global. Evite les 429 sur les gros repos.
        if not developer_ids:
            try:
                members_map = await client.get_project_members_with_emails(
                    project.gitlab_project_id
                )
                logger.info(f"Pre-loaded {len(members_map)} members for project={project.name}")
            except Exception as e:
                logger.warning(f"Could not pre-load members: {e}")
        else:
            logger.info(f"Targeted mode: skipping global member pre-load for project={project.name}")

        # [SENIOR] Pre-fetch mission dates for this project to enable Surgical Daily Precision
        from app.models.developer_project import DeveloperProject
        missions = db.query(DeveloperProject).filter(
            DeveloperProject.project_id == project.id,
            DeveloperProject.developer_id.in_(effective_ids),
            DeveloperProject.is_active == True
        ).all()
        prefetched_missions = {m.developer_id: (m.start_date, m.end_date) for m in missions}

        # [SENIOR Optimization] On récupère désormais tout par projet
        # pour éviter les faux-négatifs de l'API GitLab.
        
        since = until = None
        lot_start = lot_end = None
        try:
            since, until, lot_start, lot_end = build_period_window(lot.period)
        except Exception as e:
            logger.warning(f"Calcul période échoué: {e}")
        
        filtered_out_period = 0
        filtered_out_dev    = 0
        
        logger.info(f"[CHIRURGICAL] Isolation temporelle active: {lot_start.isoformat()} -> {lot_end.isoformat()}")

        # [FIX] Utiliser all=True pour capturer tous les commits (incluant ceux mergés)
        # Le filtrage par auteur se fait localement via _matches_target_devs
        unique_commits = await fetch_unique_commits(
            client=client,
            gitlab_project_id=project.gitlab_project_id,
            since=since,
            until=until,
        )
        
        logger.info(f"[DIAGNOSTIC] unique_commits found: {len(unique_commits)}")

        created = skipped = 0
        for commit_data in unique_commits:
            sha = commit_data.get("id")
            # [SENIOR] Déduplication globale par SHA pour ce projet
            if not sha or self.commit_repo.get_by_sha(db, sha, project.id):
                skipped += 1
                continue

            # [SENIOR] Filtre chirurgical : on valide la date de l'auteur
            # car GitLab peut renvoyer de l'historique sur les filtres fuzzy
            if not is_in_period(commit_data.get("authored_date"), lot_start, lot_end):
                logger.debug(f"Filter Out: commit {sha[:8]} falls outside target period.")
                filtered_out_period += 1
                skipped += 1
                continue

            gitlab_id    = commit_data.get("author_id")
            author_email = commit_data.get("author_email")
            author_name  = commit_data.get("author_name")
            author_username = commit_data.get("author_username")

            # [STRICT TEAM ISOLATION] - LOGIQUE DURCIE (SENIOR)
            # On ne traite QUE si le dev est dans la map cible (Zero Trust Discovery)
            if not self._matches_target_devs(gitlab_id, author_name, author_email, target_devs_map):
                logger.debug(f"Filter Out (Non-Target): commit {sha[:8]} by {author_name} rejected.")
                filtered_out_dev += 1
                skipped += 1
                continue

            # [SENIOR FIX] Si la logique ciblée a déjà trouvé le dev via _matches_target_devs, on l'utilise directement !
            matched_dev = find_matched_target_dev(
                target_devs_map=target_devs_map,
                gitlab_id=gitlab_id,
                author_email=author_email,
                author_username=author_username,
            )
            
            if matched_dev:
                developer = matched_dev
            else:
                developer = self._resolve_developer(
                    db=db,
                    project_id=project.id,
                    period_id=lot.period_id,
                    email=author_email,
                    name=author_name,
                    gitlab_id=gitlab_id,
                    username=author_username,
                    members_map=members_map,
                    forbid_creation=True 
                )

            if not developer:
                skipped += 1
                continue
                
            # [SENIOR] SURGICAL MISSION CHECK (Daily Precision)
            try:
                commit_dt = datetime.fromisoformat(commit_data.get("authored_date", "").replace("Z", "+00:00"))
                commit_date = commit_dt.date()
                
                # Check absolute RH + Project Mission dates
                if not is_project_contribution_certified(db, developer.id, project.id, commit_date, prefetched_missions):
                    logger.warning(
                        f"[SECURITY] Surgical: Commit {sha[:8]} rejected for {developer.name} "
                        f"on project {project.name} (Date {commit_date} outside mission or contract)"
                    )
                    filtered_out_dev += 1
                    skipped += 1
                    continue
            except Exception as e:
                logger.error(f"Error during Surgical Mission check: {e}")
                
            # [SENIOR HOTFIX] Fetch stats only for this specific matched commit
            # [OPTIMISATION DISABLED] Stats now included from get_project_commits(with_stats=True)
            # detailed_commit = await client.get_commit_detail(project.gitlab_project_id, commit_data["id"])
            # if detailed_commit:
            #     commit_data = detailed_commit
                
            mapped = GitLabMapper.map_commit(
                data=commit_data,
                project_id=project.id,
                developer_id=developer.id,
                extraction_lot_id=lot.id,
            )
            self.commit_repo.create(db, mapped)
            created += 1

        db.commit()

        # [SENIOR CERTIFICATION] Final step: ensure the lot "claims" its relevant data
        # even if those commits existed before. This ensures the JSON dump is accurate.
        self._certify_lot_commits(db, lot, project, effective_ids, lot_start, lot_end)
        
        db.refresh(lot)
        return len(lot.commits)

    def _certify_lot_commits(self, db: Session, lot, project, developer_ids: Optional[List[int]], start_date: datetime, end_date: datetime):
        """
        ✅ [SENIOR++++] THE GUARDIAN OF INTEGRITY
        Certifie et ancre tous les commits du projet à ce lot si l'auteur fait partie de la mission.
        Cette méthode répare les erreurs d'identification qui surviennent pendant l'extraction brute.
        """
        from app.models.commit import Commit
        from app.models.developer import Developer
        from app.services.extraction.developer_identity import resolve_developer_id_fuzzy

        # [STRICT MISSION VALIDATION]
        # On utilise get_developers_for_data_extraction pour l'extraction de données brutes
        # SANS la règle RG-02 des 15 jours
        certified_mission_ids = set(get_developers_for_data_extraction(
            db=db, project_id=project.id, period_id=lot.period_id
        ))
        
        effective_ids = developer_ids if developer_ids else list(certified_mission_ids)
        # On s'assure qu'on ne traite que des certifiés
        effective_ids = [did for did in effective_ids if did in certified_mission_ids]

        if not effective_ids:
            logger.warning(f"[lot={lot.id}] No certified developers for certification. Skipping.")
            return

        # 1. Identifier tous les développeurs valides pour cette mission (RH Source of Truth)
        mission_devs = db.query(Developer).filter(Developer.id.in_(effective_ids)).all()
        
        # 2. Scanner TOUS les commits du projet sur la période (même ceux non-liés)
        commits = db.query(Commit).filter(
            Commit.project_id == project.id,
            Commit.authored_date >= start_date,
            Commit.authored_date <  end_date,
            Commit.is_merge_commit == False
        ).all()

        from app.utils.mission_utils import is_project_contribution_certified
        
        # [SENIOR] Pre-fetch mission dates for this project
        from app.models.developer_project import DeveloperProject
        missions = db.query(DeveloperProject).filter(
            DeveloperProject.project_id == project.id,
            DeveloperProject.developer_id.in_(effective_ids),
            DeveloperProject.is_active == True
        ).all()
        prefetched_missions = {m.developer_id: (m.start_date, m.end_date) for m in missions}

        count = 0
        for c in commits:
            target_dev_id = c.developer_id
            
            # Si le commit n'a pas de lot ou pas de dev, on tente une résolution Senior
            if not c.extraction_lot_id or not target_dev_id:
                matched_id = resolve_developer_id_fuzzy(db, c.author_email, c.author_name, mission_devs)
                if matched_id:
                    target_dev_id = matched_id
            
            # [SURGICAL DAILY PRECISION]
            if target_dev_id and target_dev_id in certified_mission_ids:
                if is_project_contribution_certified(db, target_dev_id, project.id, c.authored_date.date(), prefetched_missions):
                    c.developer_id = target_dev_id
                    c.extraction_lot_id = lot.id
                    count += 1
                else:
                    # [SENIOR] Dé-ancrage automatique si non-conforme aux dates de mission précises
                    if c.extraction_lot_id == lot.id:
                        c.extraction_lot_id = None
            else:
                if c.extraction_lot_id == lot.id:
                    c.extraction_lot_id = None

        db.commit()
        logger.info(f"[lot={lot.id}] HIGH-INTEGRITY SURGICAL CERTIFICATION: Anchored {count} commits.")

    def _certify_lot_mrs(self, db: Session, lot, project, developer_ids: Optional[List[int]], start_date: datetime, end_date: datetime):
        """
        ✅ [SENIOR++++] MR SURGICAL CERTIFICATION
        Ancre les Merge Requests au lot en vérifiant l'appartenance des auteurs à la mission AU JOUR PRÈS.
        """
        from app.models.merge_request import MergeRequest
        from app.models.developer import Developer
        from app.services.extraction.developer_identity import resolve_developer_id_fuzzy
        from app.utils.mission_utils import is_project_contribution_certified

        # [STRICT MISSION VALIDATION]
        certified_mission_ids = set(get_certified_developers_for_mission(
            db=db, project_id=project.id, period_id=lot.period_id
        ))
        
        effective_ids = developer_ids if developer_ids else list(certified_mission_ids)
        effective_ids = [did for did in effective_ids if did in certified_mission_ids]

        if not effective_ids:
            return

        mission_devs = db.query(Developer).filter(Developer.id.in_(effective_ids)).all()

        # [SENIOR] Pre-fetch mission dates for this project
        from app.models.developer_project import DeveloperProject
        missions = db.query(DeveloperProject).filter(
            DeveloperProject.project_id == project.id,
            DeveloperProject.developer_id.in_(effective_ids),
            DeveloperProject.is_active == True
        ).all()
        prefetched_missions = {m.developer_id: (m.start_date, m.end_date) for m in missions}

        from sqlalchemy import or_, and_

        mrs = db.query(MergeRequest).filter(
            MergeRequest.project_id == project.id,
            or_(
                and_(
                    MergeRequest.created_at_gitlab >= start_date,
                    MergeRequest.created_at_gitlab <  end_date
                ),
                MergeRequest.extraction_lot_id == lot.id
            )
        ).all()
        
        count = 0
        for mr in mrs:
            target_dev_id = mr.developer_id
            
            if not mr.extraction_lot_id or not target_dev_id:
                matched_id = resolve_developer_id_fuzzy(db, None, mr.author_name, mission_devs)
                if matched_id:
                    target_dev_id = matched_id
            
            # [SURGICAL DAILY PRECISION]
            actor_ids = [did for did in [target_dev_id, mr.reviewer_id, mr.assignee_id] if did]
            
            belongs_to_lot = (
                mr.created_at_gitlab and 
                mr.created_at_gitlab >= start_date and 
                mr.created_at_gitlab < end_date
            )
            
            is_certified = False
            for act_id in set(actor_ids):
                if act_id in certified_mission_ids:
                    mr_date = mr.created_at_gitlab.date() if mr.created_at_gitlab else start_date.date()
                    if is_project_contribution_certified(db, act_id, project.id, mr_date, prefetched_missions):
                        is_certified = True
                        break
            
            if is_certified and belongs_to_lot:
                if target_dev_id:
                    mr.developer_id = target_dev_id
                mr.extraction_lot_id = lot.id
                count += 1
            else:
                if mr.extraction_lot_id == lot.id:
                    mr.extraction_lot_id = None

        db.commit()
        logger.info(f"[lot={lot.id}] HIGH-INTEGRITY SURGICAL CERTIFICATION: Anchored {count} MRs.")

    async def _extract_merge_requests(
        self, 
        db, 
        project, 
        lot, 
        client, 
        developer_ids: Optional[List[int]] = None, 
        fast_mode: bool = False
    ) -> int:
        target_usernames = []
        # [FIX-N+1] Pré-charger les devs cibles en dict UNE SEULE FOIS
        target_devs_map: Dict[int, Developer] = {}
        
        # [SENIOR HARDENING] Always use a target map, even in Global mode.
        # [STRICT MISSION VALIDATION]
        certified_mission_ids = set(get_certified_developers_for_mission(
            db=db, project_id=project.id, period_id=lot.period_id
        ))

        effective_ids = []
        if developer_ids:
            effective_ids = [did for did in developer_ids if did in certified_mission_ids]
        else:
            effective_ids = list(certified_mission_ids)

        if not effective_ids:
            return 0

        if effective_ids:
            _loaded_devs = db.query(Developer).filter(Developer.id.in_(effective_ids)).all()
            target_devs_map = {d.id: d for d in _loaded_devs}
            # [FIX-ID-SYNC] S'assure que les IDs GitLab numériques sont présents avant d'extraire les MRs
            await self._ensure_developers_ids(db, list(target_devs_map.values()), client)
            target_usernames = [normalize_username(d.gitlab_username) for d in _loaded_devs if d.gitlab_username]
            
            if not target_usernames:
                logger.warning(f"[lot={lot.id}] Targeted developers have NO gitlab_username in DB. Fetching might yield 0 results.")

        updated_after = updated_before = None
        lot_start = lot_end = None
        try:
            updated_after, updated_before, lot_start, lot_end = build_period_window(lot.period)
        except Exception as e:
            logger.warning(f"Calcul période MR échoué: {e}")

        # [SENIOR FIX] Fetches ALL MRs for the period globally to avoid 403 errors 
        # on certain restricted query parameters (author_username, etc.)
        # and then filters them LOCALLY.
        try:
            mrs = await client.get_project_merge_requests(
                project.gitlab_project_id, 
                updated_after=updated_after,
                updated_before=updated_before
            )
            logger.info(f"[lot={lot.id}] Global MR fetch: found {len(mrs)} MRs to filter locally.")
        except Exception as e:
            logger.error(f"Global MR fetch failed: {e}")
            mrs = []
        # [SENIOR] Pre-fetch mission dates for this project to enable Surgical Daily Precision
        from app.models.developer_project import DeveloperProject
        missions = db.query(DeveloperProject).filter(
            DeveloperProject.project_id == project.id,
            DeveloperProject.developer_id.in_(effective_ids),
            DeveloperProject.is_active == True
        ).all()
        prefetched_missions = {m.developer_id: (m.start_date, m.end_date) for m in missions}

        created = updated = skipped = 0

        # [OPTIMISATION] Process MRs in parallel with semaphore to limit concurrency
        async def process_single_mr(mr_data):
            local_created, local_updated, local_skipped = 0, 0, 0
            existing_mr = self.mr_repo.get_by_gitlab_mr_id(db, mr_data["iid"], project.id)
            
            author = mr_data.get("author") or {}
            mr_iid = mr_data.get("iid")
            
            if not mr_matches_target_devs(mr_data, target_devs_map):
                local_skipped += 1
                return local_created, local_updated, local_skipped
            
            # [SENIOR] SURGICAL MISSION CHECK (Daily Precision for MRs)
            mr_created_str = mr_data.get("created_at")
            if mr_created_str:
                try:
                    mr_dt = datetime.fromisoformat(mr_created_str.replace("Z", "+00:00"))
                    mr_date = mr_dt.date()
                    
                    # We check if the author is certified for THIS day on THIS project
                    # MR author is the primary target.
                    author_id = author.get("id")
                    target_dev = None
                    if author_id:
                        target_dev = next((d for d in target_devs_map.values() if d.gitlab_user_id == author_id), None)
                    
                    if target_dev:
                        from app.utils.mission_utils import is_project_contribution_certified
                        if not is_project_contribution_certified(db, target_dev.id, project.id, mr_date, prefetched_missions):
                            logger.warning(
                                f"[SECURITY] Surgical: MR !{mr_iid} rejected for {target_dev.name} "
                                f"on project {project.name} (Date {mr_date} outside mission)"
                            )
                            local_skipped += 1
                            return local_created, local_updated, local_skipped
                except Exception as e:
                    logger.error(f"Error during Surgical MR check: {e}")

            logger.info(f"[lot={lot.id}] MR !{mr_iid} MATCHED for certified developers.")

            author_data = mr_data.get("author") or {}
            reviewers_list = mr_data.get("reviewers") or []
            assignees_list = mr_data.get("assignees") or [mr_data.get("assignee")]
            primary_reviewer_data = reviewers_list[0] if reviewers_list else {}
            primary_assignee_data = assignees_list[0] if assignees_list and assignees_list[0] else {}

            # Resolution des entités locales
            dev_author = self._resolve_developer(
                db=db, project_id=project.id,
                period_id=lot.period_id,
                email=author_data.get("email"), name=author_data.get("name"),
                gitlab_id=author_data.get("id"), username=author_data.get("username"),
                # ✅ [STRICT MISSION] Interdiction de création
                forbid_creation=True
            )
            
            dev_reviewer = None
            if primary_reviewer_data:
                dev_reviewer = self._resolve_developer(
                    db=db, project_id=project.id,
                    period_id=lot.period_id,  # ✅ Missing period_id
                    email=primary_reviewer_data.get("email"), name=primary_reviewer_data.get("name"),
                    gitlab_id=primary_reviewer_data.get("id"), username=primary_reviewer_data.get("username"),
                    forbid_creation=bool(developer_ids)
                )

            dev_assignee = None
            if primary_assignee_data:
                dev_assignee = self._resolve_developer(
                    db=db, project_id=project.id,
                    period_id=lot.period_id,  # ✅ Missing period_id
                    email=primary_assignee_data.get("email"), name=primary_assignee_data.get("name"),
                    gitlab_id=primary_assignee_data.get("id"), username=primary_assignee_data.get("username"),
                    forbid_creation=bool(developer_ids)
                )

            # [SENIOR LOGIC] On ne skip QUE si aucun acteur n'est local
            if not dev_author and not dev_reviewer and not dev_assignee:
                local_skipped += 1
                return local_created, local_updated, local_skipped

            # [SENIOR LOGIC] — DEEP EXTRACTION
            # Le listing MR ne renvoie pas commits_count. On fetch le détail complet + les commits.
            mr_notes: list = []
            approvals_data = {}
            try:
                # [SENIOR FIX 1.1] Appels parallèles pour diviser le temps par 3 !
                # [OPTIMISATION SKIP NOTES] Notes non nécessaires pour KPIs spécifiés
                full_mr_data, mr_commits, mr_notes_data, approvals_data = await asyncio.gather(
                    client.get_merge_request_detail(project.gitlab_project_id, mr_data["iid"]),
                    client.get_merge_request_commits(project.gitlab_project_id, mr_data["iid"]),
                    # client.get_merge_request_notes(project.gitlab_project_id, mr_data["iid"]),  # [SKIP NOTES]
                    client.get_merge_request_approvals(project.gitlab_project_id, mr_data["iid"])
                )
                mr_notes_data = []  # [SKIP NOTES] Empty instead of fetching
                
                # [SKIP NOTES] Force user_notes_count à 0 AVANT l'update pour éviter d'être écrasé
                mr_data["user_notes_count"] = 0
                
                if full_mr_data:
                    mr_data.update(full_mr_data)
                
                # [SENIOR LOGIC] — HIGH PRECISION TEMPORAL FILTERING
                # 1. Commits : Only those by author AND within this period
                author_data = full_mr_data.get("author", {}) if full_mr_data else {}
                
                # [FIX-N+1] Utiliser le dict pré-chargé target_devs_map — ZÉRO requête DB ici
                target_ids, target_names, target_emails, target_unames = build_target_vectors(
                    author_data=author_data,
                    target_devs_map=target_devs_map,
                    scoped=bool(developer_ids),
                )

                # commits_count should represent TOTAL commits in MR (complexity metric)
                # Use GitLab API value if available, otherwise count all commits
                mr_data["commits_count"] = full_mr_data.get("commits_count", len(mr_commits)) if full_mr_data else len(mr_commits)
                
                # Keep filtered commits for KPI calculation (author + period filtering)
                filtered_commits = [
                    c for c in mr_commits
                    if (not (c.get("title", "").lower().startswith("merge branch"))) and
                    is_target_author_commit(c, target_names, target_emails) and
                    is_in_period(c.get("authored_date", ""), lot_start, lot_end)
                ]

                # Compute additions, deletions, total_changes from MR commits in database
                try:
                    if mr_commits:
                        from app.models.commit import Commit
                        mr_commit_shas = [c.get("id") for c in mr_commits if c.get("id")]
                        db_commits = db.query(Commit).filter(
                            Commit.project_id == project.id,
                            Commit.gitlab_commit_id.in_(mr_commit_shas)
                        ).all()
                        mr_data["additions"] = sum(c.additions or 0 for c in db_commits)
                        mr_data["deletions"] = sum(c.deletions or 0 for c in db_commits)
                        mr_data["total_changes"] = sum(c.total_changes or 0 for c in db_commits)
                except Exception as e:
                    logger.warning(f"Failed to calculate additions/deletions for MR !{mr_data['iid']}: {e}")

                # [SENIOR FIX 1.3] Cycle Time calculation (Merge Date - First Commit Date)
                if mr_data.get("state") == "merged" and mr_data.get("merged_at"):
                    try:
                        if mr_commits:
                            # Les commits sont souvent triés du plus récent au plus ancien, le premier commit = dernier élément
                            first_commit_date_str = mr_commits[-1].get("authored_date")
                            if first_commit_date_str:
                                first_commit_date = datetime.fromisoformat(first_commit_date_str.replace("Z", "+00:00"))
                                merged_at = datetime.fromisoformat(mr_data["merged_at"].replace("Z", "+00:00"))
                                cycle_time_hours = (merged_at - first_commit_date).total_seconds() / 3600
                                if cycle_time_hours > 0:
                                    mr_data["cycle_time_hours"] = round(cycle_time_hours, 2)
                    except Exception as e:
                        logger.warning(f"Failed to calculate cycle time for MR !{mr_data['iid']}: {e}")

                # 2. Comments (Notes) : Only those by TARGET developers AND within this period
                # [SKIP NOTES] Notes non nécessaires pour KPIs spécifiés
                # user_notes_count déjà forcé à 0 AVANT l'update (ligne 1034)
                mr_notes = mr_notes_data
                # filtered_notes = [
                #     n for n in mr_notes
                #     if not n.get("system", False) and
                #     is_target_author_note(n, target_ids, target_unames) and
                #     is_in_period(n.get("created_at", ""), lot_start, lot_end)
                # ]
                # mr_data["user_notes_count"] = len(filtered_notes)

                # [SENIOR FIX] Fetch resource_state_events for precise approved_at timestamp
                # This provides accurate review time calculation (creation -> approval)
                # If unavailable, the mapper will use merged_at as fallback
                try:
                    resource_state_events = await client.get_merge_request_resource_state_events(
                        project.gitlab_project_id, mr_data["iid"]
                    )
                    approval_event = None
                    for event in resource_state_events:
                        if event.get("state") == "approved":
                            approval_event = event
                            break
                    
                    if approval_event and approval_event.get("created_at"):
                        mr_data["approved_at"] = approval_event["created_at"]
                        logger.debug(f"MR !{mr_data['iid']}: precise approved_at from resource_state_events")
                except Exception as e:
                    logger.debug(f"Could not fetch resource_state_events for MR !{mr_data['iid']}: {e}")

            except Exception as e:
                logger.warning(f"Could not fetch/filter MR detail/commits/notes for !{mr_data['iid']}: {e}")

            mr_created_str = mr_data.get("created_at")
            belongs_to_lot = is_in_period(mr_created_str, lot_start, lot_end)

            # Map Data
            mapped = GitLabMapper.map_merge_request(
                data=mr_data, project_id=project.id,
                developer_id=dev_author.id if dev_author else None, 
                extraction_lot_id=lot.id if belongs_to_lot else None,
                approvals_data=approvals_data,
                reviewer_id=dev_reviewer.id if dev_reviewer else None
            )
            # Ajout manuel de l'assignee_id si le mapper ne le prend pas encore (le modèle le supporte)
            if dev_assignee:
                mapped["assignee_id"] = dev_assignee.id

            current_mr = None
            if existing_mr:
                if not belongs_to_lot:
                    mapped.pop("extraction_lot_id", None)
                current_mr = self.mr_repo.update(db, existing_mr, mapped)
                local_updated += 1
            else:
                current_mr = self.mr_repo.create(db, mapped)
                local_created += 1

            # Link commits to MR in commit_merge_request table
            try:
                if mr_commits:
                    mr_commit_shas = [c.get("id") for c in mr_commits if c.get("id")]
                    from app.models.commit import Commit
                    from sqlalchemy import text
                    db_commits = db.query(Commit).filter(
                        Commit.project_id == project.id,
                        Commit.gitlab_commit_id.in_(mr_commit_shas)
                    ).all()
                    for c in db_commits:
                        exists = db.execute(
                            text("SELECT 1 FROM commit_merge_request WHERE commit_id = :cid AND mr_id = :mrid"),
                            {"cid": c.id, "mrid": current_mr.id}
                        ).fetchone()
                        if not exists:
                            db.execute(
                                text("INSERT INTO commit_merge_request (commit_id, authored_date, mr_id, developer_id) VALUES (:cid, :adate, :mrid, :devid)"),
                                {
                                    "cid": c.id,
                                    "adate": c.authored_date,
                                    "mrid": current_mr.id,
                                    "devid": c.developer_id
                                }
                            )
            except Exception as e:
                logger.warning(f"Could not link commits to MR !{mr_data.get('iid', '?')}: {e}")

            # [FIX-DOUBLE-CALL] Réutilise mr_notes déjà chargé — aucun appel API supplémentaire
            # [FIX-SILENT] Exception loggée (warning) au lieu d'être silencieusement ignorée
            # [SKIP NOTES] Persistance des notes désactivée
            # try:
            #     for note in mr_notes:
            #         if note.get("system"): continue
            #         n_author = note.get("author") or {}
            #         commenter = self._resolve_developer(
            #             db=db, project_id=project.id,
            #             period_id=lot.period_id,
            #             email=n_author.get("email"), name=n_author.get("name"),
            #             gitlab_id=n_author.get("id"), username=n_author.get("username"),
            #             # ✅ [STRICT MISSION] Interdiction de création
            #             forbid_creation=True
            #         )
            #         if commenter:
            #             self.comment_repo.create_if_not_exists(db, {
            #                 "gitlab_id": note.get("id"), "body": note.get("body"),
            #                 "created_at": note.get("created_at"), "developer_id": commenter.id,
            #                 "merge_request_id": current_mr.id
            #             })
            # except Exception as e:
            #     logger.warning(f"Could not persist notes for MR !{mr_data.get('iid', '?')}: {e}")
            db.commit()
            
            return local_created, local_updated, local_skipped

        # [OPTIMISATION] Process MRs in parallel with semaphore to limit concurrency
        semaphore = asyncio.Semaphore(5)  # Process 5 MRs concurrently
        
        async def process_with_semaphore(mr_data):
            async with semaphore:
                return await process_single_mr(mr_data)
        
        # Process all MRs in parallel and sum results
        results = await asyncio.gather(*[process_with_semaphore(mr_data) for mr_data in mrs])
        for c, u, s in results:
            created += c
            updated += u
            skipped += s

        # [SENIOR CERTIFICATION] Final step: ensure the lot "claims" its relevant data
        self._certify_lot_mrs(db, lot, project, effective_ids, lot_start, lot_end)

        logger.info(f"MRs — created:{created} updated:{updated} skipped:{skipped} project={project.name}")
        return created + updated


    # =========================================================================
    # [FIX-DEDUP-1] RESOLVE DEVELOPER — lookup strict avec normalisation
    # =========================================================================

    def _resolve_developer(
        self,
        db:          Session,
        project_id:  int,
        period_id:   int,
        email:       Optional[str]            = None,
        name:        Optional[str]            = None,
        gitlab_id:   Optional[int]            = None,
        username:    Optional[str]            = None,
        members_map: Optional[Dict[int, dict]] = None,
        forbid_creation: bool = False,
    ):
        return resolve_developer(
            db=db,
            project_id=project_id,
            period_id=period_id,
            developer_repo=self.developer_repo,
            dev_project_repo=self.dev_project_repo,
            logger=logger,
            email=email,
            name=name,
            gitlab_id=gitlab_id,
            username=username,
            forbid_creation=forbid_creation,
        )

    # =========================================================================
    # RE-LINKAGE
    # =========================================================================

    def _relink_commits_to_developers(self, db: Session, project_id: int) -> int:
        """
        Re-lie les commits sans developer_id aux Developer existants.
        Heuristique safe : 1 seul dev validé dans le projet → lui attribuer
        tous les commits orphelins.
        """
        from app.models.commit import Commit
        from app.models.developer import Developer
        from app.models.developer_project import DeveloperProject

        commits_without_dev = (
            db.query(Commit)
            .filter(Commit.project_id == project_id, Commit.developer_id.is_(None))
            .all()
        )
        if not commits_without_dev:
            return 0

        developers = (
            db.query(Developer)
            .join(
                DeveloperProject,
                (DeveloperProject.developer_id == Developer.id) &
                (DeveloperProject.project_id   == project_id) &
                (DeveloperProject.is_active.is_(True)),
            )
            .filter(
                Developer.is_validated.is_(True),
                Developer.is_bot.is_(False),
                Developer.is_active.is_(True),
            )
            .all()
        )

        if len(developers) == 1:
            single_dev = developers[0]
            for commit in commits_without_dev:
                commit.developer_id = single_dev.id
            db.flush()
            logger.info(
                f"Re-linked {len(commits_without_dev)} orphan commits "
                f"to '{single_dev.name}'"
            )
            return len(commits_without_dev)

        return 0

    # =========================================================================
    # HELPERS
    # =========================================================================

    def _matches_target_devs(
        self, 
        gitlab_id: Optional[int], 
        name: Optional[str], 
        email: Optional[str], 
        target_devs_map: Dict[int, Developer]
    ) -> bool:
        return matches_target_devs(
            gitlab_id=gitlab_id,
            name=name,
            email=email,
            target_devs_map=target_devs_map,
        )


    def _update_project_last_commit(self, db: Session, project_id: int) -> None:
        last_date = self.commit_repo.get_last_commit_date(db, project_id)
        if last_date:
            self.project_repo.update_last_commit_date(db, project_id, last_date)

    def _generate_dump_file(self, db: Session, lot: ExtractionLot) -> tuple:
        from app.models.commit import Commit
        from app.models.merge_request import MergeRequest

        commits = db.query(Commit).filter(Commit.extraction_lot_id == lot.id).all()
        mrs     = db.query(MergeRequest).filter(MergeRequest.extraction_lot_id == lot.id).all()

        dump = {
            "lot_id":           lot.id,
            "project_id":       lot.project_id,
            "period_id":        lot.period_id,
            "extraction_type":  lot.extraction_type.value,
            "generated_at":     datetime.now(timezone.utc).isoformat(),
            "commits": [
                {
                    "sha":             c.gitlab_commit_id,
                    "title":           c.title,
                    "authored_date":   c.authored_date.isoformat(),
                    "additions":       c.additions,
                    "deletions":       c.deletions,
                    "total_changes":   c.total_changes,
                    "is_merge_commit": c.is_merge_commit,
                    "developer_id":    c.developer_id,
                }
                for c in commits
            ],
            "merge_requests": [
                {
                    "gitlab_mr_id":      mr.gitlab_mr_id,
                    "title":             mr.title,
                    "state":             mr.state.value if hasattr(mr.state, "value") else mr.state,
                    "is_draft":          mr.is_draft,
                    "approved":          mr.approved,
                    "review_time_hours": mr.review_time_hours,
                    "source_branch":     mr.source_branch,
                    "target_branch":     mr.target_branch,
                    "developer_id":      mr.developer_id,
                    "reviewer_id":       mr.reviewer_id,
                }
                for mr in mrs
            ],
        }

        content = json.dumps(dump, ensure_ascii=False, indent=2)
        md5     = hashlib.md5(content.encode("utf-8")).hexdigest()

        dump_dir  = Path(settings.DUMP_DIR)
        dump_dir.mkdir(parents=True, exist_ok=True)
        file_name = f"lot_{lot.id}_project_{lot.project_id}_period_{lot.period_id}.json"
        file_path = str(dump_dir / file_name)

        with open(file_path, "w", encoding="utf-8") as f:
            f.write(content)

        return file_path, md5