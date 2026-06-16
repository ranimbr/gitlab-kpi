"""
api/api_router.py
"""
from fastapi import APIRouter

from app.api.routers import (
    admin_users,
    admin_scheduler,
    alerts,
    analytics,
    audit_logs,
    auth,
    dashboards,
    developers,
    extraction,
    extraction_lots,
    gitlab_configs,
    intelligence,
    kpi_definitions,
    kpi_thresholds,
    kpis,
    menu_items,
    periods,
    profiles,
    projects,
    roles,
    sites,
)
from app.api.routers.export import router as export_router

# INDICATEUR DE VERSION - MODIFIÉ POUR DÉBOGGER
print("[API ROUTER] Module loaded - VERSION 2026-06-09-00:13")

api_router = APIRouter()

api_router.include_router(auth.router)
api_router.include_router(admin_users.router)
api_router.include_router(admin_scheduler.router)
api_router.include_router(gitlab_configs.router)
api_router.include_router(intelligence.router)
api_router.include_router(sites.router)
api_router.include_router(projects.router)
api_router.include_router(developers.router)
api_router.include_router(developers.group_router)
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
# Profile & Menu Management
api_router.include_router(profiles.router)
api_router.include_router(menu_items.router)
# Dynamic Role & Permission Management
api_router.include_router(roles.router)