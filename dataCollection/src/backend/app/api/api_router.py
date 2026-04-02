"""
api/api_router.py

AJOUTS :
    - export router (GET /export/kpis/excel et GET /export/kpis/pdf)
    - import_logs (developers) exposé via le router developers existant
    - Ordre des routes optimisé (routes fixes AVANT les routes paramétrées)
"""
from fastapi import APIRouter

from app.api.routers import (
    admin_users,
    alerts,
    analytics,
    audit_logs,
    auth,
    dashboards,
    developers,
    extraction,
    extraction_lots,
    gitlab_configs,
    kpi_definitions,
    kpi_thresholds,
    kpis,
    periods,
    projects,
    sites,
)
from app.api.routers.export import router as export_router

api_router = APIRouter()

api_router.include_router(auth.router)
api_router.include_router(admin_users.router)
api_router.include_router(gitlab_configs.router)
api_router.include_router(sites.router)
api_router.include_router(projects.router)
api_router.include_router(developers.router)
api_router.include_router(periods.router)
api_router.include_router(extraction.router)
api_router.include_router(extraction_lots.router)
api_router.include_router(kpis.router)
api_router.include_router(kpi_thresholds.router)
api_router.include_router(kpi_definitions.router)
api_router.include_router(analytics.router)
api_router.include_router(dashboards.router)
api_router.include_router(alerts.router)
api_router.include_router(audit_logs.router)
api_router.include_router(export_router)