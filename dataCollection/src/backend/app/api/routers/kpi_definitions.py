"""api/routers/kpi_definitions.py """
import logging
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from typing import List
from app.database.session import get_db
from app.api.dependencies import get_current_user, get_current_admin
from app.schemas.kpi_definition import KpiDefinitionCreate, KpiDefinitionUpdate, KpiDefinitionResponse
from app.repositories.kpi_definition_repository import KpiDefinitionRepository
from app.models.app_user import AppUser

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/kpi-definitions", tags=["KPI Definitions"])
repo   = KpiDefinitionRepository()

@router.get("", response_model=List[KpiDefinitionResponse])
def list_kpi_definitions(db: Session = Depends(get_db), current_user: AppUser = Depends(get_current_user)):
    return repo.get_active(db)

@router.get("/{kpi_id}", response_model=KpiDefinitionResponse)
def get_kpi_definition(kpi_id: int, db: Session = Depends(get_db), current_user: AppUser = Depends(get_current_user)):
    kpi = repo.get_by_id(db, kpi_id)
    if not kpi:
        raise HTTPException(404, "KPI definition not found")
    return kpi

@router.post("", response_model=KpiDefinitionResponse, status_code=201)
def create_kpi_definition(request: KpiDefinitionCreate, db: Session = Depends(get_db), current_admin: AppUser = Depends(get_current_admin)):
    if repo.code_exists(db, request.code):
        raise HTTPException(409, f"KPI code '{request.code}' already exists")
    kpi = repo.create(db, request.model_dump())
    db.commit(); db.refresh(kpi)
    return kpi

@router.put("/{kpi_id}", response_model=KpiDefinitionResponse)
def update_kpi_definition(kpi_id: int, request: KpiDefinitionUpdate, db: Session = Depends(get_db), current_admin: AppUser = Depends(get_current_admin)):
    kpi = repo.get_by_id(db, kpi_id)
    if not kpi:
        raise HTTPException(404, "KPI definition not found")
    repo.update(db, kpi, request.model_dump(exclude_unset=True))
    db.commit(); db.refresh(kpi)
    return kpi
