# main.py
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
setup_logging()
logger = logging.getLogger(__name__)


@asynccontextmanager
async def lifespan(app: FastAPI):

    # ── STARTUP ──────────────────────────────────────────────
    init_db()
    logger.info("Database initialized")

    if settings.SCHEDULER_ENABLED:
        from app.services.scheduler.scheduler import create_scheduler
        scheduler = create_scheduler()
        scheduler.start()
        app.state.scheduler = scheduler
        logger.info("Scheduler started")

    yield

    # ── SHUTDOWN ─────────────────────────────────────────────
    if settings.SCHEDULER_ENABLED and hasattr(app.state, "scheduler"):
        app.state.scheduler.shutdown(wait=False)
        logger.info("Scheduler stopped")

    logger.info("Application shutdown")


app = FastAPI(
    title       = settings.APP_NAME,
    version     = settings.APP_VERSION,
    debug       = settings.DEBUG,
    description = "Dashboard KPI GitLab — PFE Cycle Ingénieur",
    lifespan    = lifespan,
    # redirect_slashes=False supprimé — FastAPI gère les redirections 307
    # automatiquement : /periods → /periods/ sans 404
)

# ALLOWED_ORIGINS depuis settings (plus de wildcard "*")
app.add_middleware(
    CORSMiddleware,
    allow_origins     = settings.ALLOWED_ORIGINS,
    allow_credentials = True,
    allow_methods     = ["*"],
    allow_headers     = ["*"],
)

app.include_router(api_router, prefix="/api/v1")


@app.get("/", response_model=SimpleMessageResponse, tags=["Health"])
async def root():
    return {"message": f"{settings.APP_NAME} v{settings.APP_VERSION} is running"}


@app.get("/health", response_model=SimpleMessageResponse, tags=["Health"])
async def health():
    return {"message": "OK"}
