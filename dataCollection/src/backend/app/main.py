"""
main.py — Point d'entrée FastAPI

CORRECTIONS :

    1. FIX — setup_logging() appelé sans debug= → toujours INFO même si DEBUG=True
       ✅ FIX : setup_logging(debug=settings.DEBUG, log_file=settings.LOG_FILE)

    2. FIX — import SessionLocal dupliqué dans lifespan :
       importé 2 fois dans deux blocs try séparés → import redondant.
       ✅ FIX : import unique en dehors des blocs try, réutilisé partout.

    3. FIX — seed admin : getattr(settings, "ADMIN_EMAIL") → AttributeError silencieux.
       ✅ FIX : ADMIN_EMAIL et ADMIN_PASSWORD déclarés dans Settings avec default=None
       → accès direct settings.ADMIN_EMAIL (pas de getattr nécessaire).

    4. FIX — seed_kpi_definitions() : la version originale avait une double boucle
       qui ne créait jamais rien (voir seed_data.py pour les détails).
       ✅ FIX appliqué dans seed_data.py — rien à changer ici.
"""
import logging
from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.api.api_router import api_router
from app.core.config import get_settings
from app.core.logging_config import setup_logging
from app.database.init_db import init_db
from app.schemas.kpi import SimpleMessageResponse

settings = get_settings()

# ✅ FIX : debug= et log_file= passés correctement
setup_logging(debug=settings.DEBUG, log_file=settings.LOG_FILE)
logger = logging.getLogger(__name__)


@asynccontextmanager
async def lifespan(app: FastAPI):
    """
    Cycle de vie de l'application FastAPI.

    STARTUP :
        1. Initialisation des tables DB
        2. Seed des KpiDefinitions (CRITIQUE — kpi_definition_id NOT NULL)
        3. Seed admin optionnel (via ADMIN_EMAIL + ADMIN_PASSWORD dans .env)
        4. Démarrage du scheduler mensuel

    SHUTDOWN :
        - Arrêt propre du scheduler
    """
    # ── STARTUP ──────────────────────────────────────────────────────────────
    logger.info(f"Starting {settings.APP_NAME} v{settings.APP_VERSION}")

    # 1. Créer / vérifier les tables DB
    init_db()
    logger.info("Database tables initialized")

    # ✅ FIX : import unique de SessionLocal — réutilisé dans les 2 seeds
    from app.database.session import SessionLocal
    from app.core.seed_data import seed_kpi_definitions, seed_admin_user

    # 2. Seed des KpiDefinitions — CRITIQUE
    #    kpi_definition_id est NOT NULL dans KpiThreshold.
    #    Sans ce seed, create_threshold() plante à la première utilisation.
    try:
        with SessionLocal() as db:
            nb_created = seed_kpi_definitions(db)
            if nb_created > 0:
                logger.info(f"KpiDefinitions seeded — {nb_created} created")
    except Exception as e:
        logger.error(f"KpiDefinitions seed failed: {e}", exc_info=True)
        # Non bloquant — l'app démarre, mais KpiThreshold creation plantera

    # 3. Seed admin optionnel (ADMIN_EMAIL + ADMIN_PASSWORD dans .env)
    # ✅ FIX : accès direct settings.ADMIN_EMAIL (déclaré dans Settings)
    if settings.ADMIN_EMAIL and settings.ADMIN_PASSWORD:
        try:
            with SessionLocal() as db:
                seed_admin_user(db, settings.ADMIN_EMAIL, settings.ADMIN_PASSWORD)
        except Exception as e:
            logger.error(f"Admin user seed failed: {e}", exc_info=True)

    # 4. Démarrer le scheduler mensuel
    if settings.SCHEDULER_ENABLED:
        try:
            from app.services.scheduler.scheduler import create_scheduler
            scheduler = create_scheduler()
            scheduler.start()
            app.state.scheduler = scheduler
            logger.info("Scheduler started — monthly job at last day 20:00 UTC")
        except Exception as e:
            logger.error(f"Scheduler failed to start: {e}", exc_info=True)

    logger.info(
        f"✅ Application ready — "
        f"debug={settings.DEBUG} "
        f"scheduler={settings.SCHEDULER_ENABLED}"
    )

    yield

    # ── SHUTDOWN ─────────────────────────────────────────────────────────────
    if settings.SCHEDULER_ENABLED and hasattr(app.state, "scheduler"):
        app.state.scheduler.shutdown(wait=False)
        logger.info("Scheduler stopped")

    logger.info("Application shutdown complete")


# ── FastAPI App ───────────────────────────────────────────────────────────────

app = FastAPI(
    title          = settings.APP_NAME,
    version        = settings.APP_VERSION,
    debug          = settings.DEBUG,
    description    = (
        "Dashboard KPI GitLab — PFE Cycle Ingénieur\n\n"
        "## KPIs disponibles\n"
        "- **KPI #1** MR Rate par site = NB MRs non-draft / NB développeurs\n"
        "- **KPI #3** Approved MR Rate = NB approuvées / NB créées\n"
        "- **KPI #4** Merged MR Rate   = NB mergées / NB approuvées\n"
        "- **KPI #5** Commit Rate      = NB commits / NB développeurs\n"
        "- **KPI #6** NB Commits       = somme commits du projet\n"
        "- **KPI #7** Avg Review Time  = Σ(approved_at - created_at) / NB approuvées"
    ),
    lifespan       = lifespan,
    strict_slashes = False,
)

# ── CORS (PRIORITY MOVED TO TOP) ──────────────────────────────────────────────
app.add_middleware(
    CORSMiddleware,
    allow_origins     = settings.ALLOWED_ORIGINS,
    allow_credentials = True,
    allow_methods     = ["*"],
    allow_headers     = ["*"],
)

# ── Routes ────────────────────────────────────────────────────────────────────
app.include_router(api_router, prefix="/api/v1")


# ── Health endpoints ──────────────────────────────────────────────────────────

@app.get("/", response_model=SimpleMessageResponse, tags=["Health"])
async def root():
    return {"message": f"{settings.APP_NAME} v{settings.APP_VERSION} is running"}


@app.get("/health", tags=["Health"])
async def health():
    """
    [SENIOR] Health check profond — utilisé par Docker / Kubernetes / monitoring.

    Vérifie :
      ✅ Application démarrée
      ✅ Connectivité base de données (SELECT 1)
      ✅ Version de l'application

    Répond toujours 200 si l'app est fonctionnelle.
    Répond 503 si la base de données est inaccessible.

    Utilisé par :
      - Docker HEALTHCHECK (CMD curl -f http://localhost:8000/health)
      - Kubernetes liveness probe
      - Monitoring (Uptime Robot, Grafana, ...)
    """
    import time
    from datetime import datetime
    from fastapi import Response
    from sqlalchemy import text

    t_start = time.monotonic()
    db_status  = "ok"
    db_latency = None

    # ── DB connectivity check ──
    try:
        from app.database.session import SessionLocal
        with SessionLocal() as db:
            t_db = time.monotonic()
            db.execute(text("SELECT 1"))
            db_latency = round((time.monotonic() - t_db) * 1000, 2)  # ms
    except Exception as e:
        db_status = f"error: {str(e)[:100]}"
        logger.error(f"[health] DB check failed: {e}")

    total_ms = round((time.monotonic() - t_start) * 1000, 2)

    payload = {
        "status":      "ok" if db_status == "ok" else "degraded",
        "version":     settings.APP_VERSION,
        "app_name":    settings.APP_NAME,
        "timestamp":   datetime.utcnow().isoformat() + "Z",
        "database":    {"status": db_status, "latency_ms": db_latency},
        "response_ms": total_ms,
    }

    if db_status != "ok":
        from fastapi.responses import JSONResponse
        return JSONResponse(status_code=503, content=payload)

    return payload