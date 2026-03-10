from fastapi import APIRouter

from app.api.routers import auth
from app.api.routers import admin_users
from app.api.routers import gitlab_configs
from app.api.routers import projects
from app.api.routers import developers
from app.api.routers import periods
from app.api.routers import extraction
from app.api.routers import extraction_lots
from app.api.routers import kpis
from app.api.routers import kpi_thresholds   # ✅ AJOUT
from app.api.routers import analytics
from app.api.routers import dashboards

api_router = APIRouter()

api_router.include_router(auth.router)
api_router.include_router(admin_users.router)
api_router.include_router(gitlab_configs.router)
api_router.include_router(projects.router)
api_router.include_router(developers.router)
api_router.include_router(periods.router)
api_router.include_router(extraction.router)
api_router.include_router(extraction_lots.router)
api_router.include_router(kpis.router)
api_router.include_router(kpi_thresholds.router)  # ✅ AJOUT
api_router.include_router(analytics.router)
api_router.include_router(dashboards.router)