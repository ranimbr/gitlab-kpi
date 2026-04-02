"""api/routers/extraction_lots.py """
from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session
from typing import List, Optional
from app.database.session import get_db
from app.api.dependencies import get_current_user
from app.schemas.extraction_lot import ExtractionLotResponse
from app.repositories.extraction_lot_repository import ExtractionLotRepository
from app.models.app_user import AppUser

router = APIRouter(prefix="/extraction-lots", tags=["Extraction Lots"])
repo   = ExtractionLotRepository()

@router.get("", response_model=List[ExtractionLotResponse])
def list_lots(db: Session = Depends(get_db), current_user: AppUser = Depends(get_current_user),
    project_id: Optional[int] = Query(default=None), period_id: Optional[int] = Query(default=None)):
    if project_id and period_id:
        return repo.get_by_period_project(db, period_id, project_id)
    return repo.get_all(db)

@router.get("/{lot_id}", response_model=ExtractionLotResponse)
def get_lot(lot_id: int, db: Session = Depends(get_db), current_user: AppUser = Depends(get_current_user)):
    lot = repo.get_by_id(db, lot_id)
    if not lot:
        raise HTTPException(status_code=404, detail="Extraction lot not found")
    return lot