"""
api/routers/extraction.py

ARCHITECTURE ASYNC — Solution professionnelle sans timeout.

PRINCIPE :
  POST /extraction/run  → crée le lot, lance un background task, répond 202
                          en < 500ms, peu importe la durée de l'extraction.
  GET  /extraction/jobs/{lot_id} → le frontend poll toutes les 2s pour
                          suivre la progression réelle (step_index 0→5).

AVANTAGES :
  - Aucun timeout côté frontend possible (le POST répond immédiatement).
  - Progression réelle affichée (pas d'animation fake).
  - Extraction de 30s ou 30min : aucune différence pour l'utilisateur.
  - Si le réseau coupe pendant le poll, il suffit de relancer le poll
    — le job continue en arrière-plan.
"""
import logging
import os
from datetime import datetime, timezone
from typing import Dict, Optional

from fastapi import APIRouter, BackgroundTasks, Depends, HTTPException, Path as FPath, Query, status
from fastapi.responses import FileResponse
from sqlalchemy.orm import Session

from app.api.dependencies import get_current_admin, get_current_user
from app.database.session import get_db
from app.models.app_user import AppUser
from app.models.extraction_lot import ExtractionLot, ExtractionStatusEnum, ExtractionTypeEnum
from app.repositories.extraction_lot_repository import ExtractionLotRepository
from app.repositories.gitlab_config_repository import GitLabConfigRepository
from app.repositories.period_repository import PeriodRepository
from app.repositories.project_repository import ProjectRepository
from app.schemas.extraction_lot import ExtractionLotCreate
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
    developer_id:      Optional[int] = None,
) -> None:
    """
    Cœur de l'extraction — tourne en arrière-plan, durée illimitée.

    Utilise sa propre session DB (la session de la requête est fermée
    dès que le endpoint a répondu 202).

    Met à jour _job_progress[lot_id] à chaque étape pour que le frontend
    puisse afficher la progression réelle via GET /extraction/jobs/{lot_id}.
    """
    # Import local pour éviter les imports circulaires et alléger le démarrage
    from app.database.session import SessionLocal
    from app.services.gitlab.gitlab_client import GitLabClient, GitLabAPIError
    from sqlalchemy.exc import SQLAlchemyError

    db = SessionLocal()
    _job_progress[lot_id] = {"step_index": 0, "step_label": "Connexion à GitLab…"}

    try:
        # ── Rechargement des objets dans la nouvelle session ──────────────────
        lot = db.query(ExtractionLot).filter(ExtractionLot.id == lot_id).first()
        if not lot:
            raise ValueError(f"Lot id={lot_id} introuvable dans le background task.")

        # ── Liste des projets à traiter ───────────────────────────────────────
        projects_to_process = []
        if gitlab_project_id:
            p = project_repo.get_by_gitlab_id(db, gitlab_project_id)
            if p: projects_to_process.append(p)
        else:
            # Extraction globale (par instance ou par développeur)
            projects_to_process = project_repo.get_by_gitlab_config(db, gitlab_config_id)
            # Optionnel : si developer_id est présent, on pourrait filtrer sur les projets
            # où le développeur a déjà été vu. Pour l'instant, on scanne tous les projets actifs.
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
            
            # ── Étape 1 : Commits ─────────────────────────────────────────────
            _job_progress[lot_id] = {
                "step_index": 1, 
                "step_label": f"{proj_prefix} : Récupération des commits…"
            }
            # Note: il faut mettre à jour ExtractionService pour accepter developer_id
            await service._extract_commits(db, project, lot, client, developer_id=developer_id)
            db.flush()
            logger.info(f"[lot={lot_id}] {proj_prefix} — commits extraits")

            # ── Étape 2 : Merge Requests ─────────────────────────────────────
            _job_progress[lot_id] = {
                "step_index": 2, 
                "step_label": f"{proj_prefix} : Récupération des Merge Requests…"
            }
            await service._extract_merge_requests(db, project, lot, client, developer_id=developer_id)
            db.flush()
            logger.info(f"[lot={lot_id}] {proj_prefix} — MRs extraites")

            # ── Étape 3 : Relink développeurs + mise à jour projet ───────────
            _job_progress[lot_id] = {
                "step_index": 3, 
                "step_label": f"{proj_prefix} : Finalisation…"
            }
            relinked = service._relink_commits_to_developers(db, project.id)
            service._update_project_last_commit(db, project.id)
            db.flush()

            # ── Étape 4 : Calcul KPI snapshot (si MONTHLY) ──────────────────
            if lot.extraction_type == ExtractionTypeEnum.MONTHLY:
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
                )

        # MONTHLY uniquement : génération du dump JSON
        if lot.extraction_type == ExtractionTypeEnum.MONTHLY:
            file_path, md5       = service._generate_dump_file(db, lot)
            lot.generated_file   = file_path
            lot.md5sum           = md5
            db.flush()
            logger.info(f"[lot={lot_id}] Dump JSON généré → {file_path}")

        # Marquer le lot comme completed AVANT le calcul KPI
        lot.status        = ExtractionStatusEnum.completed
        lot.completed_at  = datetime.now(timezone.utc)
        lot.error_message = None
        db.commit()
        logger.info(f"[lot={lot_id}] Étape 3/4 — données commitées")

        # ── Étape 4 : Calcul KPI snapshot ────────────────────────────────────
        _job_progress[lot_id] = {"step_index": 4, "step_label": "Calcul des KPIs…"}
        kpi_service = KpiService()
        await kpi_service.generate_snapshot(
            db         = db,
            project_id = project.id,
            period_id  = lot.period_id,
            lot_id     = lot.id,
        )
        logger.info(f"[lot={lot_id}] Étape 4/4 — KPI snapshot généré")

        # ── Terminé ───────────────────────────────────────────────────────────
        _job_progress[lot_id] = {"step_index": 5, "step_label": "Extraction terminée ✓"}
        logger.info(
            f"Background extraction completed — lot={lot_id} "
            f"project={project.name} type={lot.extraction_type.value}"
        )

    except (GitLabAPIError, SQLAlchemyError, ValueError, Exception) as e:
        db.rollback()
        error_msg = str(e)[:1000]

        _job_progress[lot_id] = {
            "step_index": -1,
            "step_label": f"Erreur : {error_msg}",
        }

        # Mettre à jour le statut du lot en base
        try:
            lot = db.query(ExtractionLot).filter(ExtractionLot.id == lot_id).first()
            if lot:
                lot.status        = ExtractionStatusEnum.failed
                lot.completed_at  = datetime.now(timezone.utc)
                lot.error_message = error_msg
                db.add(lot)
                db.commit()
        except Exception as inner:
            logger.error(f"[lot={lot_id}] Impossible de mettre à jour le statut failed: {inner}")

        logger.error(
            f"Background extraction FAILED — lot={lot_id}: {error_msg}",
            exc_info=True,
        )

    finally:
        db.close()


# =============================================================================
# POST /extraction/run — répond 202 en < 500ms
# =============================================================================

@router.post(
    "/run",
    status_code = status.HTTP_202_ACCEPTED,
    summary     = "Lancer une extraction GitLab (réponse immédiate 202)",
)
async def run_extraction(
    request:          ExtractionLotCreate,
    background_tasks: BackgroundTasks,
    db:               Session = Depends(get_db),
    current_admin:    AppUser = Depends(get_current_admin),
):
    """
    Lance une extraction GitLab en **arrière-plan**.

    Répond **202 Accepted** en < 500ms avec le `lot_id`.
    Le client doit ensuite poller **GET /extraction/jobs/{lot_id}**
    toutes les 2 secondes pour suivre la progression.

    - **REALTIME** : période doit être ouverte (RG-01).
    - **MONTHLY**  : clôture la période + dump JSON + KPI snapshot.
    - **is_backfill** : recalcule les KPIs sur une période déjà extraite.
    """
    # ── Résolution de la configuration GitLab ────────────────────────────────
    gitlab_config_id = request.gitlab_config_id
    project          = None
    
    if request.project_id:
        project = project_repo.get_by_id(db, request.project_id)
        if not project:
            raise HTTPException(status_code=404, detail="Projet introuvable.")
        if project.gitlab_config_id:
            gitlab_config_id = project.gitlab_config_id

    if not gitlab_config_id:
        raise HTTPException(
            status_code=400,
            detail="Configuration GitLab manquante (fournir gitlab_config_id ou un projet lié).",
        )

    gitlab_config = config_repo.get_by_id(db, gitlab_config_id)
    if not gitlab_config or not gitlab_config.is_active:
        raise HTTPException(
            status_code=400,
            detail="Configuration GitLab inactive ou introuvable.",
        )

    # ── Création du lot ──────────────────────────────────────────────────────
    now    = datetime.now(timezone.utc)
    period = None
    
    if request.extraction_type == ExtractionTypeEnum.MONTHLY:
        if not request.period_id:
            raise HTTPException(status_code=400, detail="period_id requis pour MONTHLY.")
        period = period_repo.get_by_id(db, request.period_id)
    else:
        period = period_repo.get_or_create(db, now.year, now.month)
        if not period_repo.is_open(db, period.id):
            raise HTTPException(
                status_code=409,
                detail=f"La période {period.year}/{period.month:02d} est clôturée.",
            )

    # Check existence pour MONTHLY (si project_id fourni)
    if request.extraction_type == ExtractionTypeEnum.MONTHLY and project:
        is_backfill  = getattr(request, "is_backfill", False)
        existing_lot = lot_repo.get_monthly(db, period.id, project.id)
        if existing_lot and not is_backfill:
            raise HTTPException(
                status_code=409,
                detail=f"Un lot MONTHLY existe déjà pour ce projet et cette période.",
            )

    lot = ExtractionLot(
        extraction_type = request.extraction_type,
        status          = ExtractionStatusEnum.running,
        period_id       = period.id,
        project_id      = project.id if project else None,
        developer_id    = request.developer_id,
        triggered_by    = current_admin.id,
        gitlab_config_id = gitlab_config_id,
    )
    db.add(lot)
    db.commit()
    db.refresh(lot)

    # ── Lancement du background task ─────────────────────────────────────────
    # Le lot est déjà committé en base → visible par le background task
    # dès qu'il crée sa propre session.
    background_tasks.add_task(
        _background_extraction,
        lot_id            = lot.id,
        gitlab_config_id  = gitlab_config.id,
        triggered_by_user = current_admin.id,
        gitlab_project_id = project.gitlab_project_id if project else None,
        developer_id      = request.developer_id,
    )

    logger.info(
        f"Extraction launched (background) — lot={lot.id} "
        f"project={project.name} type={lot.extraction_type.value} "
        f"admin={current_admin.id}"
    )

    # ── Réponse 202 immédiate (< 500ms) ──────────────────────────────────────
    return {
        "lot_id":         lot.id,
        "status":         "running",
        "project_id":     lot.project_id,
        "developer_id":   lot.developer_id,
        "period_id":      lot.period_id,
        "extraction_type": lot.extraction_type.value,
        "message":        "Extraction démarrée en arrière-plan. Suivez la progression via GET /extraction/jobs/{lot_id}.",
    }


# =============================================================================
# GET /extraction/jobs/{lot_id} — endpoint de polling (toutes les 2s)
# =============================================================================

@router.get(
    "/jobs/{lot_id}",
    summary = "Statut et progression d'un job d'extraction (polling)",
)
def get_job_status(
    lot_id:       int     = FPath(..., ge=1),
    db:           Session = Depends(get_db),
    current_user: AppUser = Depends(get_current_user),
):
    """
    Retourne le statut courant d'un lot d'extraction.

    Champs clés :
    - **status** : `running` | `completed` | `failed`
    - **step_index** : 0 à 5 (étape courante du worker)
    - **step_label** : libellé de l'étape en cours
    - **error_message** : message d'erreur si status=failed

    Le frontend doit poller cet endpoint toutes les **2 secondes**
    jusqu'à ce que status soit `completed` ou `failed`.
    """
    lot = db.query(ExtractionLot).filter(ExtractionLot.id == lot_id).first()
    if not lot:
        raise HTTPException(status_code=404, detail=f"Lot id={lot_id} introuvable.")

    progress = _job_progress.get(lot_id, {})

    return {
        "lot_id":           lot.id,
        "status":           lot.status.value,          # running | completed | failed
        "step_index":       progress.get("step_index", 0),
        "step_label":       progress.get("step_label", "En cours…"),
        "project_id":       lot.project_id,
        "period_id":        lot.period_id,
        "extraction_type":  lot.extraction_type.value,
        "error_message":    lot.error_message,
        "completed_at":     lot.completed_at.isoformat() if lot.completed_at else None,
        "generated_file":   os.path.basename(lot.generated_file) if lot.generated_file else None,
        "md5sum":           lot.md5sum,
        # Champ "message" pour la ResultCard du frontend
        "message": (
            f"Extraction {lot.extraction_type.value} terminée avec succès"
            if lot.status == ExtractionStatusEnum.completed else None
        ),
    }


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
            detail=f"Lot id={lot_id} introuvable.",
        )

    if not lot.generated_file:
        raise HTTPException(
            status_code=404,
            detail=(
                f"Aucun fichier dump pour le lot id={lot_id}. "
                "Seules les extractions MONTHLY complètes génèrent un fichier."
            ),
        )

    if not os.path.exists(lot.generated_file):
        raise HTTPException(
            status_code=410,
            detail=f"Fichier '{os.path.basename(lot.generated_file)}' introuvable sur le disque.",
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
        f"Download — lot_id={lot_id} file={lot.generated_file} admin_id={current_admin.id}"
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
            "step_index":      _job_progress.get(lot.id, {}).get("step_index", -1),
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