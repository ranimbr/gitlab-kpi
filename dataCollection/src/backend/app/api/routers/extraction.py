import os
import logging

from fastapi import APIRouter, Depends, HTTPException, Path as FPath, status
from fastapi.responses import FileResponse
from sqlalchemy.orm import Session

from app.database.session import get_db
from app.api.dependencies import get_current_admin, get_current_user
from app.schemas.extraction_lot import (
    ExtractionLotCreate,
    ExtractionRunResponse,
    ExtractionType,
)
from app.repositories.gitlab_config_repository import GitLabConfigRepository
from app.repositories.project_repository import ProjectRepository
from app.repositories.extraction_lot_repository import ExtractionLotRepository
from app.services.extraction.extraction_service import ExtractionService
from app.services.kpi.kpi_service import KpiService
from app.models.app_user import AppUser
from app.models.extraction_lot import ExtractionLot

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
    response_model=ExtractionRunResponse,
    status_code=status.HTTP_200_OK,
    summary="Lancer une extraction GitLab (REALTIME ou MONTHLY)",
)
async def run_extraction(
    request:       ExtractionLotCreate,
    db:            Session = Depends(get_db),
    current_admin: AppUser = Depends(get_current_admin),
):
    """
    Lance une extraction GitLab pour un projet donné.

    - **REALTIME** : extraction manuelle — la période doit être ouverte (RG-01).
      Génère un snapshot KPI immédiat (non bloquant).

    - **MONTHLY** : extraction mensuelle officielle — clôture la période,
      génère le fichier dump + md5sum (RG-04), génère les snapshots KPI.
      Impossible si un lot MONTHLY existe déjà pour cette période (RG).
    """

    # ── Validation projet ────────────────────────────────────────────────────
    project = project_repo.get_by_id(db, request.project_id)
    if not project:
        raise HTTPException(
            status_code=404,
            detail="Project not found",
        )

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
    if request.extraction_type == ExtractionType.REALTIME:

        lot = await service.run_realtime_extraction(
            db                = db,
            gitlab_project_id = project.gitlab_project_id,
            gitlab_config     = gitlab_config,
            triggered_by_user = current_admin.id,
        )

        # Snapshot KPI non bloquant — l'extraction reste un succès même si
        # la génération du snapshot échoue
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
    # MONTHLY
    # =========================================================================
    elif request.extraction_type == ExtractionType.MONTHLY:

        if not request.period_id:
            raise HTTPException(
                status_code=400,
                detail="period_id is required for MONTHLY extraction",
            )

        lot = await service.run_monthly_extraction(
            db            = db,
            project_id    = request.project_id,
            period_id     = request.period_id,
            gitlab_config = gitlab_config,
        )

        # Snapshot KPI MONTHLY — obligatoire pour le Dashboard KPI historique
        try:
            await kpi_service.generate_snapshot(
                db         = db,
                project_id = project.id,
                period_id  = lot.period_id,
                lot_id     = lot.id,
            )
            logger.info(
                f"KPI snapshot generated after MONTHLY — "
                f"project_id={project.id} period_id={lot.period_id}"
            )
        except Exception as e:
            # Le lot est committed — snapshot régénérable via /analytics/generate-snapshot
            logger.error(
                f"KPI snapshot failed after MONTHLY — "
                f"project_id={project.id} period_id={lot.period_id}: {e}"
            )

        message = "Extraction MONTHLY completed — KPI snapshot generated"

    else:
        raise HTTPException(
            status_code=400,
            detail="Invalid extraction type",
        )

    return ExtractionRunResponse(
        message        = message,
        lot_id         = lot.id,
        type           = lot.type.value,
        project_id     = lot.project_id,
        period_id      = lot.period_id,
        generated_file = lot.generated_file,
        md5sum         = lot.md5sum,
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
    lot_id:        int     = FPath(..., ge=1, description="ID du lot d'extraction"),
    db:            Session = Depends(get_db),
    current_admin: AppUser = Depends(get_current_admin),
):
    """
    Télécharge le fichier dump JSON généré lors de l'extraction MONTHLY.

    - Réservé aux **admins**.
    - Retourne le fichier en `application/json`.
    - Header **`X-MD5-Checksum`** : md5sum du fichier pour vérification RG-04.
    - Header **`X-Lot-ID`** : ID du lot pour traçabilité.

    Codes d'erreur :
    - `404` : lot introuvable ou pas de fichier généré (lot REALTIME ou échoué).
    - `410` : fichier supprimé du serveur (archivage).
    """
    lot: ExtractionLot = (
        db.query(ExtractionLot)
        .filter(ExtractionLot.id == lot_id)
        .first()
    )

    if not lot:
        raise HTTPException(
            status_code=404,
            detail=f"Extraction lot id={lot_id} not found",
        )

    if not lot.generated_file:
        raise HTTPException(
            status_code=404,
            detail=(
                f"No dump file available for lot id={lot_id}. "
                f"Only completed MONTHLY extractions generate a dump file."
            ),
        )

    if not os.path.exists(lot.generated_file):
        raise HTTPException(
            status_code=410,
            detail=(
                f"File '{os.path.basename(lot.generated_file)}' "
                f"no longer exists on the server (may have been archived)."
            ),
        )

    # ── RG-04 : md5sum retourné dans les headers pour vérification côté client ──
    headers = {
        "X-Lot-ID":        str(lot.id),
        "X-Project-ID":    str(lot.project_id),
        "X-Period-ID":     str(lot.period_id),
        "X-Extraction-Type": lot.type.value,
    }
    if lot.md5sum:
        headers["X-MD5-Checksum"] = lot.md5sum

    logger.info(
        f"Download requested — lot_id={lot_id} "
        f"file={lot.generated_file} "
        f"by admin_id={current_admin.id}"
    )

    return FileResponse(
        path       = lot.generated_file,
        filename   = os.path.basename(lot.generated_file),
        media_type = "application/json",
        headers    = headers,
    )


# =============================================================================
# GET /extraction/lots — Liste des lots (admin)
# =============================================================================

@router.get(
    "/lots",
    summary = "Lister tous les lots d'extraction",
)
def list_lots(
    project_id:    int            = None,
    period_id:     int            = None,
    db:            Session        = Depends(get_db),
    current_admin: AppUser        = Depends(get_current_admin),
):
    """
    Liste les lots d'extraction avec filtres optionnels project_id / period_id.
    Réservé aux admins.
    """
    q = db.query(ExtractionLot)

    if project_id:
        q = q.filter(ExtractionLot.project_id == project_id)
    if period_id:
        q = q.filter(ExtractionLot.period_id == period_id)

    lots = q.order_by(ExtractionLot.created_at.desc()).all()

    return [
        {
            "id":             lot.id,
            "type":           lot.type.value,
            "status":         lot.status.value,
            "project_id":     lot.project_id,
            "period_id":      lot.period_id,
            "triggered_by":   lot.triggered_by,
            "created_at":     lot.created_at.isoformat() if lot.created_at else None,
            "generated_file": os.path.basename(lot.generated_file) if lot.generated_file else None,
            "md5sum":         lot.md5sum,
            "has_file":       lot.generated_file is not None and os.path.exists(lot.generated_file),
        }
        for lot in lots
    ]