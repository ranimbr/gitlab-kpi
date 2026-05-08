"""
api/routers/audit_logs.py

"""
import logging
from datetime import datetime
from typing import List, Optional

from fastapi import APIRouter, Depends, Query
from sqlalchemy.orm import Session

from app.api.dependencies import get_current_admin
from app.database.session import get_db
from app.models.app_user import AppUser
from app.schemas.audit_log import AuditLogFilterParams, AuditLogResponse
from app.services.admin.audit_service import AuditService

logger  = logging.getLogger(__name__)
router  = APIRouter(prefix="/audit-logs", tags=["Audit Logs"])
service = AuditService()


@router.get("", response_model=List[AuditLogResponse])
def list_audit_logs(
    db:            Session          = Depends(get_db),
    current_admin: AppUser          = Depends(get_current_admin),
    user_id:       Optional[int]    = Query(default=None),
    action:        Optional[str]    = Query(default=None),
    entity_type:   Optional[str]    = Query(default=None),
    entity_id:     Optional[int]    = Query(default=None),
    created_after:  Optional[datetime] = Query(default=None),
    created_before: Optional[datetime] = Query(default=None),
    page:          int              = Query(default=1, ge=1),
    limit:         int              = Query(default=50, ge=1, le=1000),
):
    """
    Journal d'audit — lecture seule, admin uniquement.
    ✅ FIX : tous les filtres sont combinés avec AND (plus if/elif).
    Pagination via page + limit.
    """
    # ✅ FIX : utilise AuditService.get_filtered() qui combine TOUS les filtres
    filters = AuditLogFilterParams(
        user_id        = user_id,
        action         = action,
        entity_type    = entity_type,
        entity_id      = entity_id,
        created_after  = created_after,
        created_before = created_before,
        page           = page,
        limit          = limit,
    )
    return service.get_filtered(db, filters)


@router.get("/count")
def count_audit_logs(
    db:            Session       = Depends(get_db),
    current_admin: AppUser       = Depends(get_current_admin),
    user_id:       Optional[int] = Query(default=None),
    action:        Optional[str] = Query(default=None),
    entity_type:   Optional[str] = Query(default=None),
):
    """Compte total des entrées — pour la pagination frontend."""
    filters = AuditLogFilterParams(
        user_id     = user_id,
        action      = action,
        entity_type = entity_type,
    )
    return {"total": service.count_filtered(db, filters)}
