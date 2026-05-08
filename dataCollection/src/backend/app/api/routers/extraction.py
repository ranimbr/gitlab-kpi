"""
api/routers/extraction.py
"""
import logging
import os
from datetime import datetime, timezone
from typing import Dict, Optional, List

from fastapi import APIRouter, BackgroundTasks, Depends, HTTPException, Path as FPath, Query, status
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


@router.post("/run", status_code=status.HTTP_202_ACCEPTED)
async def run_extraction(
    request:          ExtractionLotCreate,
    background_tasks: BackgroundTasks,
    db:               Session = Depends(get_db),
    current_admin:    AppUser = Depends(get_current_admin),
):
    gitlab_config_id = request.gitlab_config_id
    project = None
    if request.project_id:
        project = project_repo.get_by_id(db, request.project_id)
        if project: gitlab_config_id = project.gitlab_config_id

    if not gitlab_config_id:
        active_configs = config_repo.get_active_configs(db)
        if len(active_configs) == 1: gitlab_config_id = active_configs[0].id

    if not gitlab_config_id:
        raise HTTPException(status_code=400, detail="Config GitLab manquante")

    now = datetime.now(timezone.utc)
    period = None
    if request.extraction_type == ExtractionTypeEnum.MONTHLY:
        period = period_repo.get_by_id(db, request.period_id)
    else:
        period = period_repo.get_or_create(db, now.year, now.month)

    lot = ExtractionLot(
        extraction_type = request.extraction_type,
        status          = ExtractionStatusEnum.running,
        period_id       = period.id,
        project_id      = project.id if project else None,
        developer_id    = request.developer_ids[0] if request.developer_ids and len(request.developer_ids)==1 else None,
        triggered_by    = current_admin.id,
        gitlab_config_id = gitlab_config_id,
    )
    db.add(lot)
    db.commit()
    db.refresh(lot)

    background_tasks.add_task(
        _background_extraction,
        lot_id            = lot.id,
        gitlab_config_id  = gitlab_config_id,
        triggered_by_user = current_admin.id,
        gitlab_project_id = project.gitlab_project_id if project else None,
        developer_ids     = request.developer_ids,
        fast_mode         = getattr(request, "fast_mode", False),
        auto_target_by_period = request.auto_target_by_period
    )
    return {"lot_id": lot.id, "status": "running"}


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


@router.get("/lots", response_model=List[ExtractionLotResponse])
def list_lots(project_id: int = Query(None), period_id: int = Query(None), db: Session = Depends(get_db), current_admin: AppUser = Depends(get_current_admin)):
    q = db.query(ExtractionLot)
    if project_id: q = q.filter(ExtractionLot.project_id == project_id)
    if period_id: q = q.filter(ExtractionLot.period_id == period_id)
    lots = q.order_by(ExtractionLot.created_at.desc()).limit(100).all()
    return [
        {
            "id": lot.id, "extraction_type": lot.extraction_type.value, "status": lot.status.value,
            "project_id": lot.project_id, "period_id": lot.period_id, "developer_id": lot.developer_id,
            "created_at": lot.created_at.isoformat() if lot.created_at else None,
            "items_count": lot.items_count, "mr_count": lot.mr_count, "commit_count": lot.commit_count,
            "developer": {"id": lot.developer.id, "name": lot.developer.name} if lot.developer else None
        } for lot in lots
    ]


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
    
    project_query = db.query(Project).join(DeveloperProject).filter(
        DeveloperProject.developer_id.in_(dev_ids), Project.gitlab_config_id == gitlab_config_id, Project.is_active.is_(True)
    ).distinct()
    
    if project_ids:
        p_ids = [int(i.strip()) for i in project_ids.split(",") if i.strip().isdigit()]
        project_query = project_query.filter(Project.gitlab_project_id.in_(p_ids))
    
    projects = project_query.all()
    return {
        "developer_count": len(devs),
        "project_count": len(projects),
        "estimated_api_calls": len(devs) * len(projects) * 3,
        "estimated_duration_sec": len(devs) * len(projects) * 1
    }


@router.post("/by-team", status_code=status.HTTP_202_ACCEPTED)
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

    project_query = db.query(ProjectModel).join(DeveloperProject).filter(
        DeveloperProject.developer_id.in_(target_dev_ids), ProjectModel.gitlab_config_id == gitlab_config_id, ProjectModel.is_active.is_(True)
    ).distinct()

    if project_ids:
        p_ids = [int(i.strip()) for i in project_ids.split(",") if i.strip().isdigit()]
        project_query = project_query.filter(ProjectModel.gitlab_project_id.in_(p_ids))

    projects = project_query.all()
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
        background_tasks.add_task(
            _background_extraction, lot_id=lot.id, gitlab_config_id=gitlab_config_id, triggered_by_user=current_admin.id,
            gitlab_project_id=project.gitlab_project_id, developer_ids=target_dev_ids, fast_mode=fast_mode,
            allowed_gitlab_project_ids=[project.gitlab_project_id]
        )
        launched.append({"lot_id": lot.id, "project": project.name})

    db.commit()
    return {"status": "launched", "jobs": launched}