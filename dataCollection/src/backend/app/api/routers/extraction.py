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
    developer_ids:     Optional[List[int]] = None,
    fast_mode:         bool          = False,
    allowed_gitlab_project_ids: Optional[List[int]] = None,
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
            
            # ✅ OPTIMISATION SENIOR : Si on cible des développeurs, on ne scanne QUE leurs projets affectés
            if developer_ids:
                from app.models.project import Project
                from app.models.developer_project import DeveloperProject
                
                dev_projects_query = db.query(Project).join(
                    DeveloperProject, (DeveloperProject.project_id == Project.id)
                ).filter(
                    DeveloperProject.developer_id.in_(developer_ids),
                    Project.gitlab_config_id == gitlab_config_id
                )
                
                # ✅ RESTRICTION CHIRURGICALE (SENIOR) : Filtrer par les projets demandés si spécifiés
                if allowed_gitlab_project_ids:
                    dev_projects_query = dev_projects_query.filter(Project.gitlab_project_id.in_(allowed_gitlab_project_ids))
                
                dev_projects = dev_projects_query.all()
                if dev_projects:
                    projects_to_process = dev_projects
                    logger.info(f"Extraction Ciblée — {len(projects_to_process)} projets trouvés pour les développeurs {developer_ids} (Restriction: {allowed_gitlab_project_ids})")

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
            
            # Calcul de la progression globale (Phase 2 Senior)
            progress_pct = int((idx / total_projects) * 100)
            lot.step_progress  = progress_pct
            lot.current_action = f"Traitement {project.name}..."
            db.add(lot)
            db.flush()
            
            # ── Étape 1 : Commits ─────────────────────────────────────────────
            # ─────────────────────────────────────────────────────────────────────────
            # ✅ FIX SENIOR : Smart Auto-Mapping
            # Si le lot a été créé sans project_id (extraction par Squad),
            # on le rattache automatiquement au premier projet traité pour 
            # garantir la visibilité dans le dashboard (filtres par projet).
            # ─────────────────────────────────────────────────────────────────────────
            if lot.project_id is None:
                lot.project_id = project.id
                db.add(lot)
                db.flush()
                logger.info(f"[lot={lot_id}] Lot auto-rattaché au projet {project.name} (fix #null)")

            _job_progress[lot_id] = {
                "step_index": 1, 
                "step_label": f"{proj_prefix} : Récupération des commits…"
            }
            lot.current_action = _job_progress[lot_id]["step_label"]
            db.add(lot)
            db.flush()
            await service._extract_commits(db, project, lot, client, developer_ids=developer_ids, fast_mode=fast_mode)
            db.flush()
            logger.info(f"[lot={lot_id}] {proj_prefix} — commits extraits")

            # ── Étape 2 : Merge Requests ─────────────────────────────────────
            _job_progress[lot_id] = {
                "step_index": 2, 
                "step_label": f"{proj_prefix} : Récupération des Merge Requests…"
            }
            lot.current_action = _job_progress[lot_id]["step_label"]
            db.add(lot)
            db.flush()
            await service._extract_merge_requests(db, project, lot, client, developer_ids=developer_ids, fast_mode=fast_mode)
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

            # ── Étape 4 : Calcul des KPIs ──────────────────────────────────────
            # On lance le calcul systématiquement pour que le dashboard soit à jour
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
            logger.info(f"[lot={lot_id}] {proj_prefix} — KPI snapshot généré")

        # ── Étape 5 : Agrégation Stratégique (Sites & Squads) ──────────────────
        # ✅ AJOUT SENIOR : On force l'agrégation globale pour peupler le dashboard
        # de pilotage (comparaison Paris/Tunis) immédiatement après l'extraction.
        _job_progress[lot_id] = {
            "step_index": 4, 
            "step_label": "Agrégation stratégique (Sites & Squads)…"
        }
        from app.services.kpi.kpi_aggregator import KpiAggregator
        aggregator = KpiAggregator(db)
        for project in projects_to_process:
            aggregator.generate_monthly_snapshots(
                project_id = project.id,
                year       = lot.period.year,
                month      = lot.period.month,
                lot_id     = lot.id
            )
        logger.info(f"[lot={lot_id}] Agrégation stratégique terminée pour {len(projects_to_process)} projets")

        # MONTHLY uniquement : génération du dump JSON

        if lot.extraction_type == ExtractionTypeEnum.MONTHLY:
            file_path, md5       = service._generate_dump_file(db, lot)
            lot.generated_file   = file_path
            lot.md5sum           = md5
            db.flush()
            logger.info(f"[lot={lot_id}] Dump JSON généré → {file_path}")

        # Marquer le lot comme completed
        lot.status         = ExtractionStatusEnum.completed
        lot.completed_at   = datetime.now(timezone.utc)
        lot.error_message  = None
        lot.step_progress  = 100
        lot.current_action = "Extraction terminée ✓"
        db.commit()

        # ── Terminé ───────────────────────────────────────────────────────────
        _job_progress[lot_id] = {"step_index": 5, "step_label": "Extraction terminée ✓"}
        logger.info(f"Background extraction completed — lot={lot_id}")

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

    # Si un seul développeur est ciblé, on le renseigne dans le lot pour l'audit/stats
    dev_id = None
    if request.developer_ids and len(request.developer_ids) == 1:
        dev_id = request.developer_ids[0]

    lot = ExtractionLot(
        extraction_type = request.extraction_type,
        status          = ExtractionStatusEnum.running,
        period_id       = period.id,
        project_id      = project.id if project else None,
        developer_id    = dev_id,
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
        developer_ids     = request.developer_ids,
        fast_mode         = getattr(request, "fast_mode", False) or (request.developer_ids is not None),
    )

    logger.info(
        f"Extraction launched (background) — lot={lot.id} "
        f"project={project.name if project else 'ALL'} type={lot.extraction_type.value} "
        f"admin={current_admin.id} targets={request.developer_ids}"
    )

    # ── Réponse 202 immédiate (< 500ms) ──────────────────────────────────────
    return {
        "lot_id":         lot.id,
        "status":         "running",
        "project_id":     lot.project_id,
        "developer_ids":  request.developer_ids,
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
        "step_label":       progress.get("step_label", lot.current_action or "En cours…"),
        "step_progress":    lot.step_progress or 0,
        "current_action":   lot.current_action,
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
            "step_label":      _job_progress.get(lot.id, {}).get("step_label", ""),
            "project_id":      lot.project_id,
            "period_id":       lot.period_id,
            "developer_id":    lot.developer_id,
            "developer": {
                "id": lot.developer.id,
                "name": lot.developer.name,
                "gitlab_username": lot.developer.gitlab_username,
                "site_id": lot.developer.primary_site_id,
                "group_ids": lot.developer.group_ids,
                "site_name": lot.developer.site
            } if lot.developer else None,
            "triggered_by":    lot.triggered_by,
            "created_at":      lot.created_at.isoformat() if lot.created_at else None,
            "completed_at":    lot.completed_at.isoformat() if lot.completed_at else None,
            "generated_file":  os.path.basename(lot.generated_file) if lot.generated_file else None,
            "md5sum":          lot.md5sum,
            "has_file":        bool(lot.generated_file and os.path.exists(lot.generated_file)),
            "error_message":   lot.error_message,
            "commit_count":    db.query(Commit).filter(Commit.extraction_lot_id == lot.id).count(),
            "mr_count":        db.query(MergeRequest).filter(MergeRequest.extraction_lot_id == lot.id).count()
        }
        for lot in lots
    ]


@router.post(
    "/simulate-team",
    summary = "Phase 1 : Simuler l'impact d'une extraction pour une équipe",
)
async def simulate_extraction_by_team(
    gitlab_config_id:  int,
    db:                Session       = Depends(get_db),
    current_admin:     AppUser       = Depends(get_current_admin),
    site_id:           Optional[int] = Query(default=None),
    group_id:          Optional[int] = Query(default=None),
    developer_ids:     str           = Query(default=None),
    project_ids:       str           = Query(default=None),
):
    """
    Simule une extraction sans rien lancer.
    Retourne le nombre de devs, projets et une estimation de charge.
    """
    from app.models.developer import Developer
    from app.models.developer_site import DeveloperSite
    from app.models.project import Project

    # ── 1. Résoudre les développeurs (même logique que run_extraction_by_team)
    dev_query = db.query(Developer).filter(
        Developer.is_bot.is_(False),
        Developer.is_active.is_(True),
        Developer.is_validated.is_(True),
    )

    if developer_ids:
        id_list = [int(i.strip()) for i in developer_ids.split(",") if i.strip().isdigit()]
        dev_query = dev_query.filter(Developer.id.in_(id_list))
    elif group_id:
        from app.models.developer_group import developer_group_link
        subq = db.query(developer_group_link.c.developer_id).filter(developer_group_link.c.group_id == group_id).subquery()
        dev_query = dev_query.filter(Developer.id.in_(subq))
    elif site_id:
        subq = db.query(DeveloperSite.developer_id).filter(DeveloperSite.site_id == site_id).subquery()
        dev_query = dev_query.filter(Developer.id.in_(subq))

    devs = dev_query.all()
    dev_count = len(devs)

    # ── 2. Résoudre les projets
    if project_ids:
        proj_id_list = [int(i.strip()) for i in project_ids.split(",") if i.strip().isdigit()]
        projects = db.query(Project).filter(Project.gitlab_project_id.in_(proj_id_list)).all()
    else:
        projects = db.query(Project).filter(Project.gitlab_config_id == gitlab_config_id, Project.is_active.is_(True)).all()
    
    proj_count = len(projects)

    # ── 3. Estimation de charge (Senior Analytics)
    # On estime 2 appels API critiques (Commits + MRs) par couple dev/projet
    # Plus les appels de pagination (facteur 1.5)
    est_api_calls = int(dev_count * proj_count * 3.5)
    
    # Temps estimé : ~1s par appel API + overhead
    est_duration_sec = int(est_api_calls * 1.2)
    
    return {
        "developer_count": dev_count,
        "project_count":   proj_count,
        "estimated_api_calls": est_api_calls,
        "estimated_duration_sec": est_duration_sec,
        "warning": "Volume important détecté" if est_api_calls > 500 else None
    }


@router.post(
    "/by-team",
    status_code = status.HTTP_202_ACCEPTED,
    summary     = "Extraction centrée-developer : lancer l'extraction pour toute une équipe",
)
async def run_extraction_by_team(
    gitlab_config_id:  int,
    background_tasks:  BackgroundTasks,
    db:                Session       = Depends(get_db),
    current_admin:     AppUser       = Depends(get_current_admin),
    site_id:           Optional[int] = Query(default=None, description="Extraire tous les devs du site"),
    group_id:          Optional[int] = Query(default=None, description="Extraire tous les devs du groupe"),
    developer_ids:     str           = Query(default=None, description="Liste d'IDs séparés par virgule (ex: '1,2,3')"),
    project_ids:       str           = Query(default=None, description="Projets GitLab à scanner (ex: '10,11'). Vide = tous les projets actifs."),
    extraction_type:   str           = Query(default="REALTIME", description="REALTIME ou MONTHLY"),
    period_id:         Optional[int] = Query(default=None, description="Requis si extraction_type=MONTHLY"),
    all_developers:    bool          = Query(default=False, description="Extraire tous les devs actifs"),
    fast_mode:         bool          = Query(default=False, description="Mode Rapide : filtrage par auteur GitLab"),
    is_backfill:       bool          = Query(default=False, description="Mode Backfill : permet d'écraser un snapshot mensuel"),
):
    """
    Lance une extraction GitLab ciblée sur une équipe de développeurs.

    **4 modes de sélection :**
    - `all_developers` → tous les développeurs actifs validés
    - `site_id`        → tous les développeurs actifs validés du site
    - `group_id`       → tous les développeurs validés du groupe  
    - `developer_ids`  → liste explicite d'IDs (ex: "1,2,5,8")
    """
    from app.models.developer      import Developer
    from app.models.developer_site import DeveloperSite
    from app.models.gitlab_config  import GitLabConfig

    # ── 1. Valider la config GitLab ──────────────────────────────────────────
    gitlab_config = config_repo.get_by_id(db, gitlab_config_id)
    if not gitlab_config or not gitlab_config.is_active:
        raise HTTPException(
            status_code=400,
            detail="Configuration GitLab inactive ou introuvable.",
        )

    # ── 2. Valider le type d'extraction et la période ─────────────────────────
    try:
        ext_type = ExtractionTypeEnum(extraction_type.upper())
    except ValueError:
        raise HTTPException(status_code=400, detail="extraction_type doit être REALTIME ou MONTHLY.")

    now    = datetime.now(timezone.utc)
    period = None
    if ext_type == ExtractionTypeEnum.MONTHLY:
        if not period_id:
            raise HTTPException(status_code=400, detail="period_id requis pour MONTHLY.")
        period = period_repo.get_by_id(db, period_id)
        if not period:
            raise HTTPException(status_code=404, detail="Période introuvable.")
    else:
        period = period_repo.get_or_create(db, now.year, now.month)
        if not period_repo.is_open(db, period.id):
            raise HTTPException(
                status_code=409,
                detail=f"La période {period.year}/{period.month:02d} est clôturée.",
            )

    # ── 3. Résoudre la liste des développeurs ────────────────────────────────
    dev_query = db.query(Developer).filter(
        Developer.is_bot.is_(False),
        Developer.is_active.is_(True),
        Developer.is_validated.is_(True),
    )

    if all_developers:
        pass # The query already filters for active, validated, non-bot developers
    elif developer_ids:
        # Mode explicite : liste d'IDs
        id_list = []
        for raw in developer_ids.split(","):
            raw = raw.strip()
            if raw.isdigit():
                id_list.append(int(raw))
        if not id_list:
            raise HTTPException(status_code=400, detail="developer_ids invalides.")
        dev_query = dev_query.filter(Developer.id.in_(id_list))

    elif group_id:
        # Mode groupe — FIX M2M : Developer n'a plus de colonne group_id scalaire
        from app.models.developer_group import developer_group_link
        subq = (
            db.query(developer_group_link.c.developer_id)
            .filter(developer_group_link.c.group_id == group_id)
            .subquery()
        )
        dev_query = dev_query.filter(Developer.id.in_(subq))


    elif site_id:
        # Mode site : via la table M2M DeveloperSite
        dev_ids_in_site = (
            db.query(DeveloperSite.developer_id)
            .filter(DeveloperSite.site_id == site_id)
            .subquery()
        )
        dev_query = dev_query.filter(Developer.id.in_(dev_ids_in_site))

    else:
        raise HTTPException(
            status_code=400,
            detail="Spécifiez au moins un critère : all_developers, site_id, group_id ou developer_ids.",
        )

    developers = dev_query.order_by(Developer.name).all()

    if not developers:
        raise HTTPException(
            status_code=404,
            detail="Aucun développeur actif et validé trouvé pour ces critères.",
        )

    # ── 4. Vérification existence MONTHLY (si pas Backfill) ─────────────────
    if ext_type == ExtractionTypeEnum.MONTHLY and not is_backfill:
        existing_names = []
        for dev in developers:
            if lot_repo.monthly_exists(db, period.id, developer_id=dev.id):
                existing_names.append(dev.name)
        
        if existing_names:
            detail = f"Un lot MONTHLY existe déjà pour : {', '.join(existing_names[:5])}"
            if len(existing_names) > 5:
                detail += f" et {len(existing_names)-5} autres."
            raise HTTPException(status_code=409, detail=detail)

    # ── 5. Résoudre les projets GitLab à scanner ──────────────────────────────
    gitlab_project_ids: list[Optional[int]] = [None]  # None = tous les projets actifs
    if project_ids:
        proj_id_list = []
        for raw in project_ids.split(","):
            raw = raw.strip()
            if raw.isdigit():
                proj_id_list.append(int(raw))
        if proj_id_list:
            # Vérifier que ces projets existent et sont liés à la config
            db_projects = project_repo.get_by_gitlab_config(db, gitlab_config_id)
            valid_ids = {p.gitlab_project_id for p in db_projects}
            gitlab_project_ids = [pid for pid in proj_id_list if pid in valid_ids]
            if not gitlab_project_ids:
                raise HTTPException(
                    status_code=400,
                    detail="Aucun des project_ids fournis n'est lié à cette configuration GitLab.",
                )

    # ── 5. Créer un lot par développeur et lancer les background tasks ────────
    launched = []

    for dev in developers:
        # Un lot par développeur (traçabilité individuelle)
        lot = ExtractionLot(
            extraction_type  = ext_type,
            status           = ExtractionStatusEnum.running,
            period_id        = period.id,
            project_id       = None,           # pas limité à un seul projet
            developer_id     = dev.id,
            triggered_by     = current_admin.id,
            gitlab_config_id = gitlab_config_id,
        )
        db.add(lot)
        db.flush()  # obtenir lot.id sans commit global

        _job_progress[lot.id] = {
            "step_index": 0,
            "step_label": f"En attente — {dev.name}",
        }

        # Lancer le background task pour ce développeur
        # On passe gitlab_project_id=None pour scanner tous les projets actifs
        # (le background task filtre sur developer_id)
        background_tasks.add_task(
            _background_extraction,
            lot_id                     = lot.id,
            gitlab_config_id           = gitlab_config_id,
            triggered_by_user          = current_admin.id,
            gitlab_project_id          = None,
            developer_ids              = [dev.id],
            fast_mode                  = fast_mode,
            allowed_gitlab_project_ids = gitlab_project_ids if project_ids else None
        )

        launched.append({
            "lot_id":       lot.id,
            "developer_id": dev.id,
            "developer_name": dev.name,
            "gitlab_username": dev.gitlab_username,
            "status":       "running",
        })

        logger.info(
            f"[by-team] Extraction lancée — dev={dev.name} lot={lot.id} "
            f"admin={current_admin.id}"
        )

    db.commit()

    return {
        "status":          "launched",
        "total_developers": len(launched),
        "period_id":       period.id,
        "extraction_type": ext_type.value,
        "message": (
            f"{len(launched)} extraction(s) lancée(s) en arrière-plan. "
            "Polling individuel via GET /extraction/jobs/{lot_id}."
        ),
        "jobs": launched,
    }