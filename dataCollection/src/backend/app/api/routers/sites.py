"""api/routers/sites.py — inchangé."""
import logging
from fastapi import APIRouter, Depends, Request
from sqlalchemy.orm import Session
from typing import List
from app.database.session import get_db
from app.api.dependencies import get_current_user, get_current_admin
from app.schemas.site import SiteCreate, SiteUpdate, SiteResponse
from app.services.admin.site_service import SiteService
from app.models.app_user import AppUser

logger  = logging.getLogger(__name__)
router  = APIRouter(prefix="/sites", tags=["Sites"])
service = SiteService()

@router.get("/", response_model=List[SiteResponse])
def list_sites(db: Session = Depends(get_db), current_user: AppUser = Depends(get_current_user), active_only: bool = True):
    return service.get_all_sites(db, active_only)

@router.get("/{site_id}", response_model=SiteResponse)
def get_site(site_id: int, db: Session = Depends(get_db), current_user: AppUser = Depends(get_current_user)):
    return service.get_site(db, site_id)

@router.post("/", response_model=SiteResponse, status_code=201)
def create_site(request: SiteCreate, req: Request, db: Session = Depends(get_db), current_admin: AppUser = Depends(get_current_admin)):
    return service.create_site(db=db, payload=request, created_by=current_admin.id, ip_address=req.client.host if req.client else None)

@router.put("/{site_id}", response_model=SiteResponse)
def update_site(site_id: int, request: SiteUpdate, req: Request, db: Session = Depends(get_db), current_admin: AppUser = Depends(get_current_admin)):
    return service.update_site(db=db, site_id=site_id, payload=request, updated_by=current_admin.id, ip_address=req.client.host if req.client else None)

@router.delete("/{site_id}", status_code=204)
def delete_site(site_id: int, req: Request, db: Session = Depends(get_db), current_admin: AppUser = Depends(get_current_admin)):
    service.delete_site(db=db, site_id=site_id, deleted_by=current_admin.id, ip_address=req.client.host if req.client else None)