"""
api/routers/extraction.py

CORRECTIONS :

"""
import os
import logging

from fastapi import APIRouter, Depends, HTTPException, Path as FPath, Query, status
from fastapi.responses import FileResponse
from sqlalchemy.orm import Session

from app.api.dependencies import get_current_admin, get_current_user
from app.database.session import get_db
from app.models.app_user import AppUser
from app.models.extraction_lot import ExtractionLot
from app.repositories.gitlab_config_repository import GitLabConfigRepository
from app.repositories.extraction_lot_repository import ExtractionLotRepository
from app.repositories.project_repository import ProjectRepository
from app.schemas.extraction_lot import ExtractionLotCreate, ExtractionRunResponse
from app.schemas.enums import ExtractionTypeEnum
from app.services.extraction.extraction_service import ExtractionService
from app.services.kpi.kpi_service import KpiService

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/extraction", tags=["Extraction"])

config_repo  = GitLabConfigRepository()
project_repo = ProjectRepository()
lot_repo     = ExtractionLotRepository()

# =============================================================================
# POST /extraction/run
# =============================================================================

@router.post(
    "/run",
    response_model = ExtractionRunResponse,
    status_code    = status.HTTP_200_OK,
    summary        = "Lancer une extraction GitLab (REALTIME ou MONTHLY)",
)
async def run_extraction(
    request:       ExtractionLotCreate,
    db:            Session = Depends(get_db),
    current_admin: AppUser = Depends(get_current_admin),
):
    """
    Lance une extraction GitLab pour un projet donné.

    - **REALTIME** : extraction manuelle — période doit être ouverte (RG-01).
    - **MONTHLY**  : clôture la période, dump JSON + KPI snapshot.
    - **is_backfill** : si True + MONTHLY → recalcule les KPIs sur une période
      déjà extraite sans lever 409. Équivalent Airflow --backfill.
    """
    project = project_repo.get_by_id(db, request.project_id)
    if not project:
        raise HTTPException(status_code=404, detail="Project not found")

    if not project.gitlab_config_id:
        raise HTTPException(
            status_code=400,
            detail="Project has no GitLab configuration assigned",
        )

    gitlab_config = config_repo.get_by_id(db, project.gitlab_config_id)
    if not gitlab_config or not gitlab_config.is_active:
        raise HTTPException(
            status_code=400,
            detail="GitLab configuration inactive or not found",
        )

    service     = ExtractionService()
    kpi_service = KpiService()

    # =========================================================================
    # REALTIME
    # =========================================================================
    if request.extraction_type == ExtractionTypeEnum.REALTIME:

        lot = await service.run_realtime_extraction(
            db                = db,
            gitlab_project_id = project.gitlab_project_id,
            gitlab_config     = gitlab_config,
            triggered_by_user = current_admin.id,
        )

        try:
            await kpi_service.generate_snapshot(
                db         = db,
                project_id = project.id,
                period_id  = lot.period_id,
                lot_id     = lot.id,
            )
            logger.info(
                f"KPI snapshot generated after REALTIME — "
                f"project_id={project.id} period_id={lot.period_id}"
            )
        except Exception as e:
            logger.warning(
                f"KPI snapshot failed after REALTIME (non-blocking) — "
                f"project_id={project.id}: {e}"
            )

        message = "Extraction REALTIME completed successfully"

    # =========================================================================
    # MONTHLY  (+ BACKFILL)
    # =========================================================================
    elif request.extraction_type == ExtractionTypeEnum.MONTHLY:

        if not request.period_id:
            raise HTTPException(
                status_code=400,
                detail="period_id is required for MONTHLY extraction",
            )

        # ✅ FIX CRITIQUE : is_backfill lu depuis le schéma et passé au service
        is_backfill = request.is_backfill  # défaut False dans le schéma

        lot = await service.run_monthly_extraction(
            db            = db,
            project_id    = request.project_id,
            period_id     = request.period_id,
            gitlab_config = gitlab_config,
            is_backfill   = is_backfill,
        )

        try:
            await kpi_service.generate_snapshot(
                db         = db,
                project_id = project.id,
                period_id  = lot.period_id,
                lot_id     = lot.id,
            )
            logger.info(
                f"KPI snapshot generated after "
                f"{'BACKFILL' if is_backfill else 'MONTHLY'} — "
                f"project_id={project.id} period_id={lot.period_id}"
            )
        except Exception as e:
            logger.error(
                f"KPI snapshot failed after "
                f"{'BACKFILL' if is_backfill else 'MONTHLY'} — "
                f"project_id={project.id}: {e}"
            )

        message = (
            "Backfill completed — KPI snapshot recalculated"
            if is_backfill
            else "Extraction MONTHLY completed — KPI snapshot generated"
        )

    else:
        raise HTTPException(status_code=400, detail="Invalid extraction type")

    return ExtractionRunResponse(
        message         = message,
        lot_id          = lot.id,
        extraction_type = lot.extraction_type.value,
        project_id      = lot.project_id,
        period_id       = lot.period_id,
        generated_file  = lot.generated_file,
        md5sum          = lot.md5sum,
    )

# =============================================================================
# GET /extraction/lots/{lot_id}/download
# =============================================================================

@router.get(
    "/lots/{lot_id}/download",
    summary        = "Télécharger le fichier dump d'un lot MONTHLY",
    response_class = FileResponse,
)
def download_lot_file(
    lot_id:        int     = FPath(..., ge=1),
    db:            Session = Depends(get_db),
    current_admin: AppUser = Depends(get_current_admin),
):
    lot: ExtractionLot = db.query(ExtractionLot).filter(
        ExtractionLot.id == lot_id
    ).first()

    if not lot:
        raise HTTPException(
            status_code=404,
            detail=f"Extraction lot id={lot_id} not found",
        )

    if not lot.generated_file:
        raise HTTPException(
            status_code=404,
            detail=(
                f"No dump file for lot id={lot_id}. "
                "Only completed MONTHLY extractions generate a file."
            ),
        )

    if not os.path.exists(lot.generated_file):
        raise HTTPException(
            status_code=410,
            detail=f"File '{os.path.basename(lot.generated_file)}' no longer exists.",
        )

    headers = {
        "X-Lot-ID":          str(lot.id),
        "X-Project-ID":      str(lot.project_id),
        "X-Period-ID":       str(lot.period_id),
        "X-Extraction-Type": lot.extraction_type.value,
    }
    if lot.md5sum:
        headers["X-MD5-Checksum"] = lot.md5sum

    logger.info(
        f"Download — lot_id={lot_id} file={lot.generated_file} "
        f"admin_id={current_admin.id}"
    )

    return FileResponse(
        path       = lot.generated_file,
        filename   = os.path.basename(lot.generated_file),
        media_type = "application/json",
        headers    = headers,
    )

# =============================================================================
# GET /extraction/lots
# =============================================================================

@router.get("/lots", summary="Lister les lots d'extraction")
def list_lots(
    project_id:    int     = Query(default=None),
    period_id:     int     = Query(default=None),
    db:            Session = Depends(get_db),
    current_admin: AppUser = Depends(get_current_admin),
):
    q = db.query(ExtractionLot)
    if project_id:
        q = q.filter(ExtractionLot.project_id == project_id)
    if period_id:
        q = q.filter(ExtractionLot.period_id == period_id)

    lots = q.order_by(ExtractionLot.created_at.desc()).all()

    return [
        {
            "id":              lot.id,
            "extraction_type": lot.extraction_type.value,
            "status":          lot.status.value,
            "project_id":      lot.project_id,
            "period_id":       lot.period_id,
            "triggered_by":    lot.triggered_by,
            "created_at":      lot.created_at.isoformat() if lot.created_at else None,
            "completed_at":    lot.completed_at.isoformat() if lot.completed_at else None,
            "generated_file":  os.path.basename(lot.generated_file) if lot.generated_file else None,
            "md5sum":          lot.md5sum,
            "has_file":        bool(lot.generated_file and os.path.exists(lot.generated_file)),
            "error_message":   lot.error_message,
        }
        for lot in lots
    ]