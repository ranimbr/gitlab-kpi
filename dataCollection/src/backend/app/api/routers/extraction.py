"""
api/routers/extraction.py
"""
import json
import logging
import os
from datetime import datetime, timezone
from typing import Dict, Optional, List

from fastapi import APIRouter, BackgroundTasks, Depends, File, Form, HTTPException, Path as FPath, Query, UploadFile, status
from fastapi.responses import FileResponse
from sqlalchemy.orm import Session

from app.api.dependencies import get_current_admin, get_current_user
from app.database.session import get_db
from app.models.app_user import AppUser
from app.models.extraction_lot import ExtractionLot, ExtractionStatusEnum, ExtractionTypeEnum
from app.models.commit import Commit
from app.models.merge_request import MergeRequest
from app.repositories.extraction_lot_repository import ExtractionLotRepository
from app.repositories.gitlab_config_repository import GitLabConfigRepository
from app.repositories.period_repository import PeriodRepository
from app.repositories.project_repository import ProjectRepository
from app.schemas.extraction_lot import ExtractionLotCreate, ExtractionLotResponse
from app.services.extraction.extraction_service import ExtractionService
from app.services.kpi.kpi_service import KpiService

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/extraction", tags=["Extraction"])

# Repositories module-level (stateless, safe)
config_repo  = GitLabConfigRepository()
project_repo = ProjectRepository()
lot_repo     = ExtractionLotRepository()
period_repo  = PeriodRepository()

# ─────────────────────────────────────────────────────────────────────────────
# IN-MEMORY PROGRESS TRACKER
# { lot_id: { "step_index": int, "step_label": str } }
# step_index : 0=GitLab connect, 1=commits, 2=MRs, 3=relink, 4=KPI, 5=done, -1=error
# ─────────────────────────────────────────────────────────────────────────────
_job_progress: Dict[int, dict] = {}


# =============================================================================
# BACKGROUND TASK — exécuté après que le endpoint a répondu 202
# =============================================================================

async def _background_extraction(
    lot_id:            int,
    gitlab_config_id:  int,
    triggered_by_user: int,
    gitlab_project_id: Optional[int] = None,
    developer_ids:     Optional[List[int]] = None,
    fast_mode:         bool          = False,
    allowed_gitlab_project_ids: Optional[List[int]] = None,
    auto_target_by_period: bool      = False,
) -> None:
    """
    Cœur de l'extraction — tourne en arrière-plan, durée illimitée.
    """
    # Import local pour éviter les imports circulaires et alléger le démarrage
    from app.database.session import SessionLocal
    from app.services.gitlab.gitlab_client import GitLabClient, GitLabAPIError
    from sqlalchemy.exc import SQLAlchemyError
    from app.services.extraction.extraction_filters import build_period_window
    from app.repositories.developer_repository import DeveloperRepository

    db = SessionLocal()
    _job_progress[lot_id] = {"step_index": 0, "step_label": "Connexion à GitLab…"}

    try:
        # ── Rechargement des objets dans la nouvelle session ──────────────────
        lot = db.query(ExtractionLot).filter(ExtractionLot.id == lot_id).first()
        if not lot:
            raise ValueError(f"Lot id={lot_id} introuvable dans le background task.")

        # ✅ INTELLIGENCE SYSTÈME (SENIOR) : Ciblage automatique par période (Sync RH)
        if auto_target_by_period:
            _, _, p_start, p_end = build_period_window(lot.period)
            eligible_devs = DeveloperRepository().get_active_during_period(
                db, p_start.date(), p_end.date()
            )
            developer_ids = [d.id for d in eligible_devs]
            logger.info(f"[lot={lot_id}] Smart-Sync: {len(developer_ids)} développeurs éligibles identifiés.")

        # ── Liste des projets à traiter ───────────────────────────────────────
        projects_to_process = []
        if gitlab_project_id:
            p = project_repo.get_by_gitlab_id(db, gitlab_project_id)
            if p: projects_to_process.append(p)
        else:
            projects_to_process = project_repo.get_by_gitlab_config(db, gitlab_config_id)
            if developer_ids:
                from app.models.project import Project
                from app.models.developer_project import DeveloperProject
                dev_projects_query = db.query(Project).join(
                    DeveloperProject, (DeveloperProject.project_id == Project.id)
                ).filter(
                    DeveloperProject.developer_id.in_(developer_ids),
                    Project.gitlab_config_id == gitlab_config_id
                )
                if allowed_gitlab_project_ids:
                    dev_projects_query = dev_projects_query.filter(Project.gitlab_project_id.in_(allowed_gitlab_project_ids))
                dev_projects = dev_projects_query.all()
                if dev_projects:
                    projects_to_process = dev_projects

            projects_to_process = [p for p in projects_to_process if p.is_active and not p.archived]

        if not projects_to_process:
            raise ValueError("Aucun projet actif trouvé pour cette configuration.")

        # ── Charger la config GitLab dans cette session ───────────────────────
        from app.models.gitlab_config import GitLabConfig
        gitlab_config = db.query(GitLabConfig).filter(GitLabConfig.id == gitlab_config_id).first()
        if not gitlab_config:
            raise ValueError(f"GitLabConfig id={gitlab_config_id} introuvable.")

        service = ExtractionService()
        client  = GitLabClient(gitlab_config)

        total_projects = len(projects_to_process)
        for idx, project in enumerate(projects_to_process):
            proj_prefix = f"[{idx+1}/{total_projects}] {project.name}"
            
            progress_pct = int((idx / total_projects) * 100)
            lot.step_progress  = progress_pct
            lot.current_action = f"Traitement {project.name}..."
            db.add(lot)
            db.flush()
            
            if lot.project_id is None:
                lot.project_id = project.id
                db.add(lot)
                db.flush()

            _job_progress[lot_id] = {
                "step_index": 1, 
                "step_label": f"{proj_prefix} : Récupération des commits…"
            }
            lot.current_action = _job_progress[lot_id]["step_label"]
            db.add(lot)
            db.flush()
            await service._extract_commits(db, project, lot, client, developer_ids=developer_ids, fast_mode=fast_mode)

            _job_progress[lot_id] = {
                "step_index": 2, 
                "step_label": f"{proj_prefix} : Récupération des Merge Requests…"
            }
            lot.current_action = _job_progress[lot_id]["step_label"]
            db.add(lot)
            db.flush()
            await service._extract_merge_requests(db, project, lot, client, developer_ids=developer_ids, fast_mode=fast_mode)

            _job_progress[lot_id] = {
                "step_index": 3, 
                "step_label": f"{proj_prefix} : Finalisation…"
            }
            service._relink_commits_to_developers(db, project.id)
            service._update_project_last_commit(db, project.id)

            _job_progress[lot_id] = {
                "step_index": 4, 
                "step_label": f"{proj_prefix} : Calcul des KPIs…"
            }
            kpi_service = KpiService()
            await kpi_service.generate_snapshot(
                db         = db,
                project_id = project.id,
                period_id  = lot.period_id,
                lot_id     = lot.id,
                developer_ids = developer_ids,
            )
            db.flush()

        # Agrégation finale
        from app.services.kpi.kpi_aggregator import KpiAggregator
        aggregator = KpiAggregator(db)
        for project in projects_to_process:
            aggregator.generate_monthly_snapshots(
                project_id = project.id,
                year       = lot.period.year,
                month      = lot.period.month,
                lot_id     = lot.id
            )
            try:
                from app.services.extraction.extraction_filters import build_period_window
                _, _, lot_start, lot_end = build_period_window(lot.period)
                service._certify_lot_commits(db, lot, project, developer_ids, lot_start, lot_end)
                service._certify_lot_mrs(db, lot, project, developer_ids, lot_start, lot_end)
            except: pass

        if lot.extraction_type == ExtractionTypeEnum.MONTHLY:
            file_path, md5       = service._generate_dump_file(db, lot)
            lot.generated_file   = file_path
            lot.md5sum           = md5

        lot.status         = ExtractionStatusEnum.completed
        lot.completed_at   = datetime.now(timezone.utc)
        lot.step_progress  = 100
        lot.current_action = "Extraction terminée ✓"
        db.commit()

        _job_progress[lot_id] = {"step_index": 5, "step_label": "Extraction terminée ✓"}

    except Exception as e:
        db.rollback()
        error_msg = str(e)[:1000]
        _job_progress[lot_id] = {"step_index": -1, "step_label": f"Erreur : {error_msg}"}
        try:
            lot = db.query(ExtractionLot).filter(ExtractionLot.id == lot_id).first()
            if lot:
                lot.status        = ExtractionStatusEnum.failed
                lot.completed_at  = datetime.now(timezone.utc)
                lot.error_message = error_msg
                db.commit()
        except: pass
        logger.error(f"Background extraction FAILED: {error_msg}", exc_info=True)
    finally:
        db.close()


# =============================================================================
# BACKGROUND TASK — Import JSON (mode hors-ligne / air-gapped)
# =============================================================================

async def _background_json_import(
    lot_id:             int,
    project_id:         int,
    period_id:          Optional[int],   # None = auto-détection depuis created_at
    data_type:          str,             # "merge_requests" | "commits" | "both"
    items:              list,
    triggered_by_user:  int,
) -> None:
    """
    Traite un fichier JSON fourni manuellement (format GitLab API) et l'insère en base
    sans passer par le client GitLab. Compatible avec les environnements air-gapped.

    Si period_id est None, la période est auto-détectée depuis created_at / authored_date
    de chaque élément et un ExtractionLot est créé par mois détecté (comme import_ela_mrs.py).
    """
    from app.database.session import SessionLocal
    from app.models.developer import Developer
    from app.models.commit import Commit
    from app.repositories.merge_request_repository import MergeRequestRepository
    from app.repositories.commit_repository import CommitRepository
    from app.repositories.developer_repository import DeveloperRepository
    from app.repositories.developer_project_repository import DeveloperProjectRepository
    from app.services.extraction.developer_identity import resolve_developer
    from app.services.gitlab.gitlab_mapper import GitLabMapper
    from app.services.kpi.kpi_aggregator import KpiAggregator
    from app.services.extraction.extraction_filters import build_period_window

    # ── helper : parse datetime ────────────────────────────────────────────────
    def _parse_dt(val):
        if not val:
            return None
        try:
            return datetime.fromisoformat(str(val).replace("Z", "+00:00"))
        except Exception:
            return None

    db = SessionLocal()
    _job_progress[lot_id] = {"step_index": 0, "step_label": "Initialisation de l'import JSON…"}

    try:
        lot     = db.query(ExtractionLot).filter(ExtractionLot.id == lot_id).first()
        project = project_repo.get_by_id(db, project_id)
        if not lot or not project:
            raise ValueError("Lot ou projet introuvable en base.")

        mr_repo_i      = MergeRequestRepository()
        commit_repo_i  = CommitRepository()
        dev_repo       = DeveloperRepository()
        dev_proj_repo  = DeveloperProjectRepository()

        # ── Pré-charger tous les développeurs actifs pour lookup rapide ──────
        all_devs   = db.query(Developer).filter(Developer.is_active == True).all()
        dev_by_uid   = {d.gitlab_user_id: d for d in all_devs if d.gitlab_user_id}
        dev_by_uname = {(d.gitlab_username or "").lower(): d for d in all_devs if d.gitlab_username}
        dev_by_email = {(d.email or "").lower(): d for d in all_devs if d.email}

        # ── Résolution des périodes et lots ───────────────────────────────────
        # lot_for_period[(year, month)] → ExtractionLot.id
        # period_id_for_ym[(year, month)] → Period.id
        created_lot_ids = set()
        lot_for_period:    Dict[tuple, int] = {}
        period_id_for_ym:  Dict[tuple, int] = {}
        affected_period_ids: set             = set()

        _, _, lot_start, lot_end = build_period_window(lot.period)

        def _get_or_create_lot_for_ym(year: int, month: int) -> Optional[int]:
            """Trouve ou crée l'ExtractionLot (projet+période). Cache le résultat."""
            key = (year, month)
            if key in lot_for_period:
                return lot_for_period[key]

            # Période
            period_obj = period_repo.get_or_create(db, year, month)
            period_id_for_ym[key] = period_obj.id
            affected_period_ids.add(period_obj.id)

            # Si l'utilisateur a fourni un period_id fixe → tous les items vont dans ce lot
            if period_id is not None and period_obj.id != period_id:
                # Filtre : on n'importe QUE les items de la période choisie
                lot_for_period[key] = None   # sentinel = ignorer
                return None

            # ExtractionLot : chercher d'abord un lot existant pour ce projet+période
            existing_lot = (
                db.query(ExtractionLot)
                .filter(
                    ExtractionLot.project_id == project_id,
                    ExtractionLot.period_id  == period_obj.id,
                    ExtractionLot.status     == ExtractionStatusEnum.completed,
                )
                .order_by(ExtractionLot.id.desc())
                .first()
            )
            if existing_lot:
                target_lot_id = existing_lot.id
            else:
                # Réutiliser le lot coordinateur si c'est la première période,
                # sinon créer un nouveau lot pour cette période
                if not lot_for_period:
                    # C'est la première période → le lot coordinateur sert de lot pour cette période
                    lot.period_id = period_obj.id
                    db.add(lot); db.flush()
                    target_lot_id = lot.id
                else:
                    new_lot = ExtractionLot(
                        extraction_type  = ExtractionTypeEnum.MONTHLY,
                        status           = ExtractionStatusEnum.running,
                        period_id        = period_obj.id,
                        project_id       = project_id,
                        triggered_by     = triggered_by_user,
                        gitlab_config_id = project.gitlab_config_id,
                        current_action   = f"Import JSON — {year}/{month:02d}",
                    )
                    db.add(new_lot); db.flush()
                    target_lot_id = new_lot.id
                    created_lot_ids.add(new_lot.id)

            lot_for_period[key] = target_lot_id
            return target_lot_id

        created_mr = updated_mr = skipped_mr = 0
        created_commit = skipped_commit = 0

        # ── Import Merge Requests ─────────────────────────────────────────────
        if data_type in ("merge_requests", "both"):
            _job_progress[lot_id] = {
                "step_index": 1,
                "step_label": f"Import des Merge Requests ({len(items)} éléments)…"
            }
            lot.current_action = _job_progress[lot_id]["step_label"]
            db.add(lot); db.flush()

            for mr_data in items:
                try:
                    # Ignorer les entrées sans iid (vraisemblablement des commits)
                    if not mr_data.get("iid"):
                        skipped_mr += 1
                        continue

                    # ── Auto-détection de la période depuis created_at ────────────────
                    mr_created = _parse_dt(mr_data.get("created_at"))
                    if not mr_created:
                        skipped_mr += 1
                        continue
                    item_lot_id = _get_or_create_lot_for_ym(mr_created.year, mr_created.month)
                    if item_lot_id is None:
                        # Filtré (période hors du filtre demandé)
                        skipped_mr += 1
                        continue

                    # ── Résolution développeur ───────────────────────────────────
                    author        = mr_data.get("author") or {}
                    author_uid    = author.get("id")
                    author_uname  = (author.get("username") or "").lower()
                    item_period_id = period_id_for_ym.get((mr_created.year, mr_created.month))

                    dev = (
                        dev_by_uid.get(author_uid)
                        or dev_by_uname.get(author_uname)
                        or resolve_developer(
                            db=db, project_id=project_id, period_id=item_period_id,
                            developer_repo=dev_repo, dev_project_repo=dev_proj_repo,
                            logger=logger,
                            email=author.get("email"), name=author.get("name"),
                            gitlab_id=author_uid, username=author.get("username"),
                            forbid_creation=True,
                        )
                    )

                    # Résolution reviewer
                    dev_reviewer = None
                    reviewers = mr_data.get("reviewers") or []
                    if reviewers:
                        r = reviewers[0]
                        dev_reviewer = (
                            dev_by_uid.get(r.get("id"))
                            or dev_by_uname.get((r.get("username") or "").lower())
                        )

                    # Résolution assignee
                    dev_assignee = None
                    assignee = mr_data.get("assignee") or {}
                    if assignee:
                        dev_assignee = (
                            dev_by_uid.get(assignee.get("id"))
                            or dev_by_uname.get((assignee.get("username") or "").lower())
                        )

                    mapped = GitLabMapper.map_merge_request(
                        data=mr_data,
                        project_id=project_id,
                        developer_id=dev.id if dev else None,
                        extraction_lot_id=item_lot_id,   # lot de la période détectée
                        reviewer_id=dev_reviewer.id if dev_reviewer else None,
                        approvals_data=mr_data.get("approvals_data"),
                    )
                    if dev_assignee:
                        mapped["assignee_id"] = dev_assignee.id

                    existing = mr_repo_i.get_by_gitlab_mr_id(db, mapped["gitlab_mr_id"], project_id)
                    if existing:
                        mr_repo_i.update(db, existing, mapped)
                        updated_mr += 1
                    else:
                        mr_repo_i.create(db, mapped)
                        created_mr += 1
                    db.flush()

                except Exception as exc:
                    logger.warning(f"[JSON Import] MR skip (iid={mr_data.get('iid')}): {exc}")
                    skipped_mr += 1

            db.commit()
            logger.info(f"[lot={lot_id}] MRs — created:{created_mr} updated:{updated_mr} skipped:{skipped_mr}")

        # ── Import Commits ────────────────────────────────────────────────────
        if data_type in ("commits", "both"):
            _job_progress[lot_id] = {
                "step_index": 2,
                "step_label": f"Import des commits ({len(items)} éléments)…"
            }
            lot.current_action = _job_progress[lot_id]["step_label"]
            db.add(lot); db.flush()

            for c_data in items:
                try:
                    sha = c_data.get("id")
                    if not sha or len(sha) < 10:
                        skipped_commit += 1
                        continue

                    # Déduplication par SHA
                    if db.query(Commit).filter(
                        Commit.gitlab_commit_id == sha,
                        Commit.project_id == project_id
                    ).first():
                        skipped_commit += 1
                        continue

                    # Auto-détection de la période depuis authored_date
                    commit_dt = _parse_dt(c_data.get("authored_date") or c_data.get("committed_date"))
                    if not commit_dt:
                        skipped_commit += 1
                        continue
                    item_lot_id = _get_or_create_lot_for_ym(commit_dt.year, commit_dt.month)
                    if item_lot_id is None:
                        skipped_commit += 1
                        continue
                    item_period_id = period_id_for_ym.get((commit_dt.year, commit_dt.month))

                    author_email = (c_data.get("author_email") or "").lower()
                    author_name  = c_data.get("author_name") or ""
                    dev = (
                        dev_by_email.get(author_email)
                        or resolve_developer(
                            db=db, project_id=project_id, period_id=item_period_id,
                            developer_repo=dev_repo, dev_project_repo=dev_proj_repo,
                            logger=logger,
                            email=author_email, name=author_name,
                            forbid_creation=True,
                        )
                    )

                    mapped = GitLabMapper.map_commit(
                        data=c_data,
                        project_id=project_id,
                        developer_id=dev.id if dev else None,
                        extraction_lot_id=item_lot_id,   # lot de la période détectée
                    )
                    commit_repo_i.create(db, mapped)
                    created_commit += 1
                    db.flush()

                except Exception as exc:
                    logger.warning(f"[JSON Import] Commit skip (sha={c_data.get('id', '?')[:8]}): {exc}")
                    skipped_commit += 1

            db.commit()
            logger.info(f"[lot={lot_id}] Commits — created:{created_commit} skipped:{skipped_commit}")

        # ── Certification + KPI pour TOUTES les périodes touchées ───────────────────
        _job_progress[lot_id] = {"step_index": 3, "step_label": "Certification des données…"}
        service = ExtractionService()
        try:
            if data_type in ("merge_requests", "both"):
                service._certify_lot_mrs(db, lot, project, None, lot_start, lot_end)
            if data_type in ("commits", "both"):
                service._certify_lot_commits(db, lot, project, None, lot_start, lot_end)
        except Exception as cert_exc:
            logger.warning(f"[JSON Import] Certification partielle: {cert_exc}")

        detected_periods = sorted(affected_period_ids) if affected_period_ids else ([period_id] if period_id else [])
        nb_periods = len(detected_periods)

        _job_progress[lot_id] = {
            "step_index": 4,
            "step_label": f"Recalcul des KPIs pour {nb_periods} période(s)…"
        }
        lot.current_action = _job_progress[lot_id]["step_label"]
        db.add(lot); db.flush()

        aggregator = KpiAggregator(db)
        for pid in detected_periods:
            try:
                aggregator.recalculate_period(period_id=pid)
                logger.info(f"[lot={lot_id}] KPI recalculé pour period_id={pid}")
            except Exception as kpi_exc:
                logger.warning(f"[lot={lot_id}] KPI échec period_id={pid}: {kpi_exc}")

        total_imported = created_mr + updated_mr + created_commit
        periods_label  = ", ".join(str(p) for p in detected_periods) if detected_periods else "?"
        lot.status        = ExtractionStatusEnum.completed
        lot.completed_at  = datetime.now(timezone.utc)
        lot.step_progress = 100
        lot.current_action = (
            f"Import JSON terminé ✓ — "
            f"{created_mr} MRs créées, {updated_mr} MJs, "
            f"{created_commit} commits, {skipped_mr + skipped_commit} ignorés — "
            f"{nb_periods} période(s)"
        )
        if created_lot_ids:
            db.query(ExtractionLot).filter(ExtractionLot.id.in_(created_lot_ids)).update({
                "status": ExtractionStatusEnum.completed,
                "completed_at": datetime.now(timezone.utc),
                "step_progress": 100,
                "current_action": "Import terminé ✓",
            }, synchronize_session=False)
        db.commit()

        _job_progress[lot_id] = {
            "step_index": 5,
            "step_label": (
                f"Import terminé ✓ ({total_imported} éléments / "
                f"{nb_periods} période(s) détectée(s))"
            ),
            "status": "completed",
            "lot_id": lot_id,
            "project_id": project_id,
            "period_id": period_id,
            "affected_periods": list(detected_periods),
            "extraction_type": "IMPORT_JSON",
        }
        logger.info(f"[lot={lot_id}] JSON import terminé — {total_imported} éléments, périodes={periods_label}.")

    except Exception as e:
        db.rollback()
        error_msg = str(e)[:1000]
        _job_progress[lot_id] = {"step_index": -1, "step_label": f"Erreur : {error_msg}"}
        try:
            lot = db.query(ExtractionLot).filter(ExtractionLot.id == lot_id).first()
            if lot:
                lot.status        = ExtractionStatusEnum.failed
                lot.completed_at  = datetime.now(timezone.utc)
                lot.error_message = error_msg
                db.commit()
            if created_lot_ids:
                db.query(ExtractionLot).filter(ExtractionLot.id.in_(created_lot_ids)).update({
                    "status": ExtractionStatusEnum.failed,
                    "completed_at": datetime.now(timezone.utc),
                    "error_message": error_msg,
                }, synchronize_session=False)
                db.commit()
        except Exception:
            pass
        logger.error(f"[lot={lot_id}] JSON import FAILED: {error_msg}", exc_info=True)
    finally:
        db.close()


# =============================================================================
# BACKGROUND TASK — Import ZIP (mode hors-ligne / air-gapped / bulk)
# =============================================================================

async def _background_zip_import(
    lot_id:             int,
    zip_bytes:          bytes,
    period_id:          Optional[int],
    data_type:          str,
    triggered_by_user:  int,
) -> None:
    """
    Tâche d'arrière-plan pour importer un fichier ZIP de masse contenant les JSON
    individuels de multiples développeurs (ex: merge_requests_safa.json).
    Auto-résout le développeur et son projet associé à la volée.
    """
    import zipfile
    import io
    from app.database.session import SessionLocal
    from app.models.developer import Developer
    from app.models.commit import Commit
    from app.repositories.merge_request_repository import MergeRequestRepository
    from app.repositories.commit_repository import CommitRepository
    from app.repositories.developer_repository import DeveloperRepository
    from app.repositories.developer_project_repository import DeveloperProjectRepository
    from app.services.extraction.developer_identity import resolve_developer
    from app.services.gitlab.gitlab_mapper import GitLabMapper
    from app.services.kpi.kpi_aggregator import KpiAggregator
    from app.services.extraction.extraction_filters import build_period_window
    from app.models.developer_project import DeveloperProject

    def _parse_dt(val):
        if not val:
            return None
        try:
            return datetime.fromisoformat(str(val).replace("Z", "+00:00"))
        except Exception:
            return None

    db = SessionLocal()
    _job_progress[lot_id] = {"step_index": 0, "step_label": "Ouverture du fichier ZIP en mémoire…"}

    try:
        lot = db.query(ExtractionLot).filter(ExtractionLot.id == lot_id).first()
        if not lot:
            raise ValueError("Lot coordinateur introuvable en base.")

        with zipfile.ZipFile(io.BytesIO(zip_bytes)) as z:
            json_files = [f for f in z.namelist() if f.lower().endswith(".json")]

        if not json_files:
            raise ValueError("L'archive ZIP ne contient aucun fichier .json")

        total_files = len(json_files)
        _job_progress[lot_id] = {"step_index": 0, "step_label": f"Trouvé {total_files} fichiers JSON à importer…"}
        lot.current_action = f"Début de l'import ZIP ({total_files} fichiers)"
        db.add(lot); db.flush()

        mr_repo_i      = MergeRequestRepository()
        commit_repo_i  = CommitRepository()
        dev_repo       = DeveloperRepository()
        dev_proj_repo  = DeveloperProjectRepository()

        # Pré-charger tous les développeurs actifs pour lookup rapide
        all_devs   = db.query(Developer).filter(Developer.is_active == True).all()
        dev_by_uid   = {d.gitlab_user_id: d for d in all_devs if d.gitlab_user_id}
        dev_by_uname = {(d.gitlab_username or "").lower(): d for d in all_devs if d.gitlab_username}
        dev_by_email = {(d.email or "").lower(): d for d in all_devs if d.email}

        created_lot_ids = set()
        lot_for_period:    Dict[tuple, int] = {}
        period_id_for_ym:  Dict[tuple, int] = {}
        affected_period_ids: set             = set()

        created_mr = updated_mr = skipped_mr = 0
        created_commit = skipped_commit = 0
        processed_files_count = 0

        with zipfile.ZipFile(io.BytesIO(zip_bytes)) as z:
            for file_idx, filename in enumerate(json_files):
                # Notification de progression
                pct = int((file_idx / total_files) * 100)
                lot.step_progress = pct
                lot.current_action = f"Lecture de {filename} ({file_idx+1}/{total_files})…"
                db.add(lot); db.flush()

                _job_progress[lot_id] = {
                    "step_index": 0,
                    "step_label": f"[{file_idx+1}/{total_files}] Lecture de {filename}…"
                }

                try:
                    content = z.read(filename)
                    items = json.loads(content)
                    if not isinstance(items, list):
                        items = [items]
                except Exception as parse_err:
                    logger.warning(f"[ZIP Import] Impossible de lire {filename} : {parse_err}")
                    continue

                if not items:
                    continue

                # ── Étape 1 : Résoudre le développeur pour ce fichier ─────────────────
                dev = None
                # Parcourir les items pour identifier l'auteur par username/email/id
                for item in items:
                    author = item.get("author") or {}
                    if author:
                        uid = author.get("id")
                        uname = (author.get("username") or "").lower()
                        email = (author.get("email") or "").lower()
                        dev = dev_by_uid.get(uid) or dev_by_uname.get(uname) or dev_by_email.get(email)
                        if dev:
                            break
                    
                    author_email = (item.get("author_email") or "").lower()
                    if author_email:
                        dev = dev_by_email.get(author_email)
                        if dev:
                            break

                if not dev:
                    # Tenter d'extraire depuis le nom du fichier s'il a un format type (merge_requests_safa.json)
                    filename_clean = filename.lower().replace("merge_requests_", "").replace("commits_", "").split(".")[0]
                    for d in all_devs:
                        if filename_clean in (d.gitlab_username or "").lower() or filename_clean in d.name.lower():
                            dev = d
                            break

                if not dev:
                    logger.warning(f"[ZIP Import] Impossible d'associer un développeur pour le fichier {filename}. Ignoré.")
                    continue

                # ── Étape 2 : Résoudre le projet de l'entreprise rattaché au dev ──────
                proj_assoc = (
                    db.query(DeveloperProject)
                    .filter(DeveloperProject.developer_id == dev.id, DeveloperProject.is_active == True)
                    .order_by(DeveloperProject.id.desc())
                    .first()
                )
                if not proj_assoc:
                    logger.warning(f"[ZIP Import] Le développeur {dev.name} n'est associé à aucun projet actif (REP, KPN...). Fichier {filename} ignoré.")
                    continue

                project_id = proj_assoc.project_id
                project = project_repo.get_by_id(db, project_id)
                if not project:
                    logger.warning(f"[ZIP Import] Projet ID={project_id} introuvable en base pour le développeur {dev.name}. Fichier {filename} ignoré.")
                    continue

                # ── Étape 3 : Traitement des données du fichier ───────────────────────
                def _get_or_create_lot_for_ym(year: int, month: int, current_project_id: int) -> Optional[int]:
                    key = (year, month, current_project_id)
                    if key in lot_for_period:
                        return lot_for_period[key]

                    period_obj = period_repo.get_or_create(db, year, month)
                    period_id_for_ym[(year, month)] = period_obj.id
                    affected_period_ids.add(period_obj.id)

                    if period_id is not None and period_obj.id != period_id:
                        lot_for_period[key] = None
                        return None

                    existing_lot = (
                        db.query(ExtractionLot)
                        .filter(
                            ExtractionLot.project_id == current_project_id,
                            ExtractionLot.period_id  == period_obj.id,
                            ExtractionLot.status     == ExtractionStatusEnum.completed,
                        )
                        .order_by(ExtractionLot.id.desc())
                        .first()
                    )
                    if existing_lot:
                        target_lot_id = existing_lot.id
                    else:
                        # Toujours créer un sous-lot d'extraction spécifique pour ce projet et cette période.
                        # Le lot coordinateur principal (lot) reste quant à lui Global (project_id = None).
                        new_lot = ExtractionLot(
                            extraction_type  = ExtractionTypeEnum.MONTHLY,
                            status           = ExtractionStatusEnum.running,
                            period_id        = period_obj.id,
                            project_id       = current_project_id,
                            triggered_by     = triggered_by_user,
                            gitlab_config_id = project.gitlab_config_id,
                            current_action   = f"Import ZIP ({filename}) — {year}/{month:02d}",
                            # ✅ Héritage du fichier source ZIP → visible dans l'historique
                            source_filename  = lot.source_filename,
                        )
                        db.add(new_lot); db.flush()
                        target_lot_id = new_lot.id
                        created_lot_ids.add(new_lot.id)

                    lot_for_period[key] = target_lot_id
                    return target_lot_id

                # Import des Merge Requests
                if data_type in ("merge_requests", "both"):
                    for mr_data in items:
                        try:
                            if not mr_data.get("iid"):
                                skipped_mr += 1
                                continue
                            mr_created = _parse_dt(mr_data.get("created_at"))
                            if not mr_created:
                                skipped_mr += 1
                                continue
                            item_lot_id = _get_or_create_lot_for_ym(mr_created.year, mr_created.month, project_id)
                            if item_lot_id is None:
                                skipped_mr += 1
                                continue

                            # Reviewers
                            dev_reviewer = None
                            reviewers = mr_data.get("reviewers") or []
                            if reviewers:
                                r = reviewers[0]
                                dev_reviewer = dev_by_uid.get(r.get("id")) or dev_by_uname.get((r.get("username") or "").lower())

                            # Assignee
                            dev_assignee = None
                            assignee = mr_data.get("assignee") or {}
                            if assignee:
                                dev_assignee = dev_by_uid.get(assignee.get("id")) or dev_by_uname.get((assignee.get("username") or "").lower())

                            mapped = GitLabMapper.map_merge_request(
                                data=mr_data,
                                project_id=project_id,
                                developer_id=dev.id,
                                extraction_lot_id=item_lot_id,
                                reviewer_id=dev_reviewer.id if dev_reviewer else None,
                                approvals_data=mr_data.get("approvals_data"),
                            )
                            if dev_assignee:
                                mapped["assignee_id"] = dev_assignee.id

                            existing = mr_repo_i.get_by_gitlab_mr_id(db, mapped["gitlab_mr_id"], project_id)
                            if existing:
                                mr_repo_i.update(db, existing, mapped)
                                updated_mr += 1
                            else:
                                mr_repo_i.create(db, mapped)
                                created_mr += 1
                            db.flush()
                        except Exception:
                            skipped_mr += 1

                # Import des Commits
                if data_type in ("commits", "both"):
                    for c_data in items:
                        try:
                            sha = c_data.get("id")
                            if not sha or len(sha) < 10:
                                skipped_commit += 1
                                continue

                            if db.query(Commit).filter(
                                Commit.gitlab_commit_id == sha,
                                Commit.project_id == project_id
                            ).first():
                                skipped_commit += 1
                                continue

                            commit_dt = _parse_dt(c_data.get("authored_date") or c_data.get("committed_date"))
                            if not commit_dt:
                                skipped_commit += 1
                                continue
                            item_lot_id = _get_or_create_lot_for_ym(commit_dt.year, commit_dt.month, project_id)
                            if item_lot_id is None:
                                skipped_commit += 1
                                continue

                            mapped = GitLabMapper.map_commit(
                                data=c_data,
                                project_id=project_id,
                                developer_id=dev.id,
                                extraction_lot_id=item_lot_id,
                            )
                            commit_repo_i.create(db, mapped)
                            created_commit += 1
                            db.flush()
                        except Exception:
                            skipped_commit += 1

                processed_files_count += 1
                logger.info(f"[ZIP Import] Import partiel {filename} ({dev.name}) terminé avec succès.")
            
            db.commit()

        # ── Étape 4 : Certification et recalcul des KPIs ──────────────────────
        _job_progress[lot_id] = {"step_index": 3, "step_label": "Certification finale des données…"}
        lot.current_action = "Certification finale..."
        db.add(lot); db.flush()

        detected_periods = sorted(affected_period_ids) if affected_period_ids else ([period_id] if period_id else [])
        nb_periods = len(detected_periods)

        _job_progress[lot_id] = {
            "step_index": 4,
            "step_label": f"Recalcul des KPIs pour {nb_periods} période(s)…"
        }
        lot.current_action = _job_progress[lot_id]["step_label"]
        db.add(lot); db.flush()

        aggregator = KpiAggregator(db)
        for pid in detected_periods:
            try:
                aggregator.recalculate_period(period_id=pid)
                logger.info(f"[ZIP Import] KPI recalculé pour period_id={pid}")
            except Exception as kpi_exc:
                logger.warning(f"[ZIP Import] Échec recalcul KPI period_id={pid}: {kpi_exc}")

        total_imported = created_mr + updated_mr + created_commit
        lot.status         = ExtractionStatusEnum.completed
        lot.completed_at   = datetime.now(timezone.utc)
        lot.step_progress  = 100
        lot.current_action = (
            f"Import ZIP terminé ✓ — {processed_files_count} fichiers traités. "
            f"{created_mr} MRs créées, {updated_mr} MJs, {created_commit} commits. "
            f"{nb_periods} période(s) mise(s) à jour."
        )
        if created_lot_ids:
            db.query(ExtractionLot).filter(ExtractionLot.id.in_(created_lot_ids)).update({
                "status": ExtractionStatusEnum.completed,
                "completed_at": datetime.now(timezone.utc),
                "step_progress": 100,
                "current_action": "Import ZIP terminé ✓",
            }, synchronize_session=False)
        db.commit()

        _job_progress[lot_id] = {
            "step_index": 5,
            "step_label": f"Import ZIP réussi ✓ ({total_imported} éléments importés sur {processed_files_count} fichiers)",
            "status": "completed",
            "lot_id": lot_id,
            "affected_periods": list(detected_periods),
            "extraction_type": "IMPORT_ZIP",
        }
        logger.info(f"[ZIP Import] Succès complet du lot #{lot_id} : {total_imported} éléments, {processed_files_count} fichiers.")

    except Exception as e:
        db.rollback()
        error_msg = str(e)[:1000]
        _job_progress[lot_id] = {"step_index": -1, "step_label": f"Erreur ZIP : {error_msg}"}
        try:
            lot = db.query(ExtractionLot).filter(ExtractionLot.id == lot_id).first()
            if lot:
                lot.status        = ExtractionStatusEnum.failed
                lot.completed_at  = datetime.now(timezone.utc)
                lot.error_message = error_msg
                db.commit()
            if created_lot_ids:
                db.query(ExtractionLot).filter(ExtractionLot.id.in_(created_lot_ids)).update({
                    "status": ExtractionStatusEnum.failed,
                    "completed_at": datetime.now(timezone.utc),
                    "error_message": error_msg,
                }, synchronize_session=False)
                db.commit()
        except:
            pass
        logger.error(f"[ZIP Import] FAILED lot={lot_id} : {error_msg}", exc_info=True)
    finally:
        db.close()


# =============================================================================
# ENDPOINT — Import manuel via fichier JSON ou ZIP (mode air-gapped / bulk)
# =============================================================================

@router.post("/upload-json", status_code=status.HTTP_202_ACCEPTED)
async def upload_json_import(
    background_tasks: BackgroundTasks,
    file:       UploadFile = File(...),
    project_id: Optional[int] = Form(None),    # Optionnel pour le mode ZIP
    period_id:  Optional[int] = Form(None),    # None = auto-détection depuis created_at
    data_type:  str        = Form("merge_requests"),  # merge_requests | commits | both
    db:            Session  = Depends(get_db),
    current_admin: AppUser  = Depends(get_current_admin),
):
    """
    Importe des données GitLab (MRs ou commits) depuis un fichier JSON individuel
    ou une archive ZIP contenant les fichiers JSON de multiples développeurs.
    Compatible avec les environnements sans accès réseau GitLab.
    """
    filename_lower = (file.filename or "").lower()
    if not filename_lower.endswith((".json", ".zip")):
        raise HTTPException(status_code=400, detail="Le fichier doit être au format .json ou .zip")

    content = await file.read()
    if len(content) > 100 * 1024 * 1024:  # 100 Mo max pour supporter les ZIPs conséquents
        raise HTTPException(status_code=400, detail="Fichier trop volumineux (max 100 Mo)")

    # ── COMPORTEMENT ZIP (IMPORTATION DE MASSE) ──────────────────────────────
    if filename_lower.endswith(".zip"):
        import zipfile
        import io
        try:
            with zipfile.ZipFile(io.BytesIO(content)) as z:
                json_files = [f for f in z.namelist() if f.lower().endswith(".json")]
        except Exception as e:
            raise HTTPException(status_code=400, detail=f"Fichier ZIP invalide ou corrompu : {e}")

        if not json_files:
            raise HTTPException(status_code=400, detail="L'archive ZIP ne contient aucun fichier .json")

        # Config GitLab par défaut
        from app.models.gitlab_config import GitLabConfig
        default_config = db.query(GitLabConfig).first()
        default_config_id = default_config.id if default_config else None

        now = datetime.now(timezone.utc)
        seed_period = None
        if period_id is not None:
            seed_period = period_repo.get_by_id(db, period_id)
        if not seed_period:
            seed_period = period_repo.get_or_create(db, now.year, now.month)

        # Création du lot coordinateur global
        lot = ExtractionLot(
            extraction_type  = ExtractionTypeEnum.MONTHLY,
            status           = ExtractionStatusEnum.running,
            period_id        = seed_period.id,
            project_id       = None,  # Multi-projets
            triggered_by     = current_admin.id,
            gitlab_config_id = default_config_id,
            current_action   = f"Import ZIP ({len(json_files)} fichiers)…",
            source_filename  = file.filename,
        )
        db.add(lot)
        db.commit()
        db.refresh(lot)

        _job_progress[lot.id] = {"step_index": 0, "step_label": "Démarrage de l'import ZIP de masse…"}

        background_tasks.add_task(
            _background_zip_import,
            lot_id            = lot.id,
            zip_bytes         = content,
            period_id         = period_id,
            data_type         = data_type,
            triggered_by_user = current_admin.id,
        )

        return {
            "lot_id":         lot.id,
            "status":         "running",
            "message":        f"Import ZIP démarré : {len(json_files)} fichiers JSON trouvés",
            "project_id":     0,
            "period_id":      period_id or 0,
            "auto_detect":    True,
            "extraction_type": "IMPORT_ZIP",
        }

    # ── COMPORTEMENT JSON (INDIVIDUEL RÉTROCOMPATIBLE) ──────────────────────────
    if not project_id or project_id == 0:
        raise HTTPException(status_code=400, detail="Veuillez sélectionner un projet pour l'import de fichier JSON individuel.")

    try:
        items = json.loads(content)
        if not isinstance(items, list):
            items = [items]
    except Exception as parse_err:
        raise HTTPException(status_code=400, detail=f"JSON invalide : {parse_err}")

    if not items:
        raise HTTPException(status_code=400, detail="Le fichier JSON est vide")

    if data_type not in ("merge_requests", "commits", "both"):
        raise HTTPException(status_code=400, detail="data_type invalide (merge_requests | commits | both)")

    project = project_repo.get_by_id(db, project_id)
    if not project:
        raise HTTPException(status_code=404, detail=f"Projet id={project_id} introuvable")

    if period_id is not None:
        period = period_repo.get_by_id(db, period_id)
        if not period:
            raise HTTPException(status_code=404, detail=f"Période id={period_id} introuvable")
        seed_period = period
    else:
        seed_period = None
        for item in items:
            date_str = item.get("created_at") or item.get("authored_date")
            if date_str:
                try:
                    dt = datetime.fromisoformat(str(date_str).replace("Z", "+00:00"))
                    seed_period = period_repo.get_or_create(db, dt.year, dt.month)
                    break
                except Exception:
                    pass
        if seed_period is None:
            raise HTTPException(
                status_code=400,
                detail="Impossible de détecter la période depuis les données. Veuillez sélectionner une période manuellement."
            )

    lot = ExtractionLot(
        extraction_type  = ExtractionTypeEnum.MONTHLY,
        status           = ExtractionStatusEnum.running,
        period_id        = seed_period.id,
        project_id       = project.id,
        triggered_by     = current_admin.id,
        gitlab_config_id = project.gitlab_config_id,
        current_action   = f"Import JSON ({len(items)} éléments)…",
        source_filename  = file.filename,
    )
    db.add(lot)
    db.commit()
    db.refresh(lot)

    _job_progress[lot.id] = {"step_index": 0, "step_label": "Démarrage de l'import JSON…"}

    background_tasks.add_task(
        _background_json_import,
        lot_id            = lot.id,
        project_id        = project.id,
        period_id         = period_id,
        data_type         = data_type,
        items             = items,
        triggered_by_user = current_admin.id,
    )

    logger.info(
        f"[JSON Import] Lot #{lot.id} lancé — projet={project.name} "
        f"period_id={'auto' if period_id is None else period_id} "
        f"data_type={data_type} items={len(items)} "
        f"par user={current_admin.id}"
    )

    return {
        "lot_id":         lot.id,
        "status":         "running",
        "message":        f"Import JSON démarré : {len(items)} éléments à traiter",
        "project_id":     project.id,
        "period_id":      period_id,
        "auto_detect":    period_id is None,
        "extraction_type": "IMPORT_JSON",
    }


@router.get("/jobs/{lot_id}")
def get_job_status(lot_id: int, db: Session = Depends(get_db), current_user: AppUser = Depends(get_current_user)):
    lot = db.query(ExtractionLot).filter(ExtractionLot.id == lot_id).first()
    if not lot: raise HTTPException(status_code=404)
    progress = _job_progress.get(lot_id, {})
    return {
        "lot_id": lot.id,
        "status": lot.status.value,
        "step_index": progress.get("step_index", 0),
        "step_label": progress.get("step_label", lot.current_action or "En cours…"),
        "step_progress": lot.step_progress or 0,
        "error_message": lot.error_message,
        "generated_file": os.path.basename(lot.generated_file) if lot.generated_file else None
    }


@router.get("/lots/{lot_id}/download", response_class=FileResponse)
def download_lot_file(lot_id: int, db: Session = Depends(get_db), current_admin: AppUser = Depends(get_current_admin)):
    lot = db.query(ExtractionLot).filter(ExtractionLot.id == lot_id).first()
    if not lot or not lot.generated_file or not os.path.exists(lot.generated_file):
        raise HTTPException(status_code=404)
    return FileResponse(path=lot.generated_file, filename=os.path.basename(lot.generated_file))
    return FileResponse(path=lot.generated_file, filename=os.path.basename(lot.generated_file))


@router.get("/lots", response_model=List[ExtractionLotResponse])
def list_lots(project_id: int = Query(None), period_id: int = Query(None), db: Session = Depends(get_db), current_admin: AppUser = Depends(get_current_admin)):
    q = db.query(ExtractionLot)
    if project_id: q = q.filter(ExtractionLot.project_id == project_id)
    if period_id: q = q.filter(ExtractionLot.period_id == period_id)
    lots = q.order_by(ExtractionLot.created_at.desc()).limit(100).all()
    return lots


@router.post("/simulate-team")
async def simulate_extraction_by_team(
    gitlab_config_id: int, db: Session = Depends(get_db), current_admin: AppUser = Depends(get_current_admin),
    site_id: Optional[int] = None, group_id: Optional[int] = None, developer_ids: str = None, project_ids: str = None,
    period_id: Optional[int] = None, all_developers: bool = False, is_smart_sync: bool = False, auto_target_by_period: bool = False
):
    from app.models.developer import Developer
    from app.models.project import Project
    from app.models.developer_project import DeveloperProject
    from app.services.extraction.extraction_filters import build_period_window
    from app.repositories.developer_repository import DeveloperRepository

    period = period_repo.get_by_id(db, period_id) if period_id else None
    dev_query = db.query(Developer).filter(Developer.is_active.is_(True), Developer.is_validated.is_(True))

    if developer_ids:
        ids = [int(i.strip()) for i in developer_ids.split(",") if i.strip().isdigit()]
        dev_query = dev_query.filter(Developer.id.in_(ids))
    elif group_id:
        from app.models.developer_group import developer_group_link
        subq = db.query(developer_group_link.c.developer_id).filter(developer_group_link.c.group_id == group_id).subquery()
        dev_query = dev_query.filter(Developer.id.in_(subq))
    elif site_id:
        from app.models.developer_site import DeveloperSite
        subq = db.query(DeveloperSite.developer_id).filter(DeveloperSite.site_id == site_id).subquery()
        dev_query = dev_query.filter(Developer.id.in_(subq))

    if (is_smart_sync or auto_target_by_period) and period:
        _, _, p_start, p_end = build_period_window(period)
        eligible_devs = DeveloperRepository().get_active_during_period(db, p_start.date(), p_end.date())
        dev_query = dev_query.filter(Developer.id.in_([d.id for d in eligible_devs]))

    devs = dev_query.all()
    dev_ids = [d.id for d in devs]
    
    # JOINTURE INTELLIGENTE : On cherche les projets liés soit par période, soit persistants
    from sqlalchemy import or_, and_
    import calendar
    from datetime import date
    
    start_p, end_p = None, None
    if period:
        start_p = date(period.year, period.month, 1)
        last_d  = calendar.monthrange(period.year, period.month)[1]
        end_p   = date(period.year, period.month, last_d)

    project_query = db.query(Project).join(DeveloperProject).filter(
        DeveloperProject.developer_id.in_(dev_ids), 
        Project.gitlab_config_id == gitlab_config_id, 
        Project.is_active.is_(True)
    )

    if period:
        project_query = project_query.filter(
            or_(
                DeveloperProject.period_id == period.id,
                and_(
                    DeveloperProject.period_id.is_(None),
                    or_(DeveloperProject.start_date.is_(None), DeveloperProject.start_date <= end_p),
                    or_(DeveloperProject.end_date.is_(None), DeveloperProject.end_date >= start_p)
                )
            )
        )
    
    if project_ids:
        p_ids = [int(i.strip()) for i in project_ids.split(",") if i.strip().isdigit()]
        project_query = project_query.filter(Project.gitlab_project_id.in_(p_ids))
    
    projects = project_query.distinct().all()
    return {
        "developer_count": len(devs),
        "project_count": len(projects),
        "estimated_api_calls": len(devs) * len(projects) * 3,
        "estimated_duration_sec": len(devs) * len(projects) * 1
    }


@router.post("/run", status_code=status.HTTP_202_ACCEPTED)
async def run_extraction_by_team(
    background_tasks: BackgroundTasks, gitlab_config_id: int, db: Session = Depends(get_db),
    current_admin: AppUser = Depends(get_current_admin), site_id: Optional[int] = None, group_id: Optional[int] = None,
    developer_ids: str = None, project_ids: str = None, extraction_type: str = "REALTIME",
    period_id: Optional[int] = None, all_developers: bool = False, fast_mode: bool = False,
    is_backfill: bool = False, is_smart_sync: bool = False, auto_target_by_period: bool = False
):
    from app.models.developer import Developer
    from app.models.project import Project as ProjectModel
    from app.models.developer_project import DeveloperProject
    from app.services.extraction.extraction_filters import build_period_window
    from app.repositories.developer_repository import DeveloperRepository

    try: ext_type = ExtractionTypeEnum(extraction_type.upper())
    except: raise HTTPException(status_code=400, detail="Type invalide")

    now = datetime.now(timezone.utc)
    period = period_repo.get_by_id(db, period_id) if period_id else period_repo.get_or_create(db, now.year, now.month)

    dev_query = db.query(Developer).filter(Developer.is_active.is_(True), Developer.is_validated.is_(True))
    if developer_ids:
        ids = [int(i.strip()) for i in developer_ids.split(",") if i.strip().isdigit()]
        dev_query = dev_query.filter(Developer.id.in_(ids))
    elif group_id:
        from app.models.developer_group import developer_group_link
        subq = db.query(developer_group_link.c.developer_id).filter(developer_group_link.c.group_id == group_id).subquery()
        dev_query = dev_query.filter(Developer.id.in_(subq))
    elif site_id:
        from app.models.developer_site import DeveloperSite
        subq = db.query(DeveloperSite.developer_id).filter(DeveloperSite.site_id == site_id).subquery()
        dev_query = dev_query.filter(Developer.id.in_(subq))

    if (is_smart_sync or auto_target_by_period) and period:
        _, _, p_start, p_end = build_period_window(period)
        eligible_devs = DeveloperRepository().get_active_during_period(db, p_start.date(), p_end.date())
        dev_query = dev_query.filter(Developer.id.in_([d.id for d in eligible_devs]))

    developers = dev_query.all()
    if not developers: raise HTTPException(status_code=404, detail="Aucun membre trouvé")
    target_dev_ids = [d.id for d in developers]

    # JOINTURE INTELLIGENTE (SENIOR) : Filtrage des projets par mission (Période ou Persistant)
    from sqlalchemy import or_, and_
    import calendar
    from datetime import date
    
    start_p = date(period.year, period.month, 1)
    last_d  = calendar.monthrange(period.year, period.month)[1]
    end_p   = date(period.year, period.month, last_d)

    project_query = db.query(ProjectModel).join(DeveloperProject).filter(
        DeveloperProject.developer_id.in_(target_dev_ids), 
        ProjectModel.gitlab_config_id == gitlab_config_id, 
        ProjectModel.is_active.is_(True)
    )

    project_query = project_query.filter(
        or_(
            DeveloperProject.period_id == period.id,
            and_(
                DeveloperProject.period_id.is_(None),
                or_(DeveloperProject.start_date.is_(None), DeveloperProject.start_date <= end_p),
                or_(DeveloperProject.end_date.is_(None), DeveloperProject.end_date >= start_p)
            )
        )
    )

    if project_ids:
        p_ids = [int(i.strip()) for i in project_ids.split(",") if i.strip().isdigit()]
        project_query = project_query.filter(ProjectModel.gitlab_project_id.in_(p_ids))

    projects = project_query.distinct().all()
    launched = []
    for project in projects:
        if is_backfill: lot_repo.delete_realtime_lots(db, period.id, project_id=project.id)
        lot = ExtractionLot(
            extraction_type=ext_type, status=ExtractionStatusEnum.running, period_id=period.id,
            project_id=project.id, developer_id=None, triggered_by=current_admin.id, gitlab_config_id=gitlab_config_id
        )
        db.add(lot)
        db.flush()
        _job_progress[lot.id] = {"step_index": 0, "step_label": f"Consolidation {project.name}"}
        # [STRICT MISSION ISOLATION] On filtre les développeurs éligibles spécifiquement pour CE projet
        # pour éviter d'envoyer la liste globale de l'équipe à chaque tâche projet.
        from app.utils.mission_utils import get_certified_developers_for_mission
        project_target_ids = get_certified_developers_for_mission(
            db, project_id=project.id, period_id=period.id, eligible_ids=target_dev_ids
        )
        
        if not project_target_ids:
            logger.warning(f"Pas de développeur certifié pour le projet {project.name} (lot {lot.id})")
            continue

        background_tasks.add_task(
            _background_extraction, lot_id=lot.id, gitlab_config_id=gitlab_config_id, triggered_by_user=current_admin.id,
            gitlab_project_id=project.gitlab_project_id, developer_ids=project_target_ids, fast_mode=fast_mode,
            allowed_gitlab_project_ids=[project.gitlab_project_id]
        )
        launched.append({"lot_id": lot.id, "project": project.name})

    db.commit()
    return {"status": "launched", "jobs": launched}