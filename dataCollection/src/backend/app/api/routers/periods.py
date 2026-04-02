"""api/routers/periods.py """
from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session
from typing import List
from app.database.session import get_db
from app.api.dependencies import get_current_user, get_current_admin
from app.schemas.period import PeriodCreate, PeriodResponse, PeriodCloseResponse
from app.repositories.period_repository import PeriodRepository
from app.models.app_user import AppUser
from app.models.period import PeriodStatusEnum

router = APIRouter(prefix="/periods", tags=["Periods"])
repo   = PeriodRepository()

@router.get("/", response_model=List[PeriodResponse])
def list_periods(db: Session = Depends(get_db), current_user: AppUser = Depends(get_current_user)):
    return repo.get_all(db)

@router.post("/", response_model=PeriodResponse, status_code=201)
def create_period(request: PeriodCreate, db: Session = Depends(get_db), current_admin: AppUser = Depends(get_current_admin)):
    existing = repo.get_by_year_month(db, request.year, request.month)
    if existing:
        raise HTTPException(status_code=400, detail=f"Period {request.year}/{request.month:02d} already exists")
    period = repo.create(db, request.model_dump())
    db.commit(); db.refresh(period)
    return period

@router.get("/current", response_model=PeriodResponse)
def get_current_period(db: Session = Depends(get_db), current_user: AppUser = Depends(get_current_user)):
    period = repo.get_current_period(db)
    if not period:
        raise HTTPException(status_code=404, detail="No period found for current month")
    return period

@router.get("/{period_id}", response_model=PeriodResponse)
def get_period(period_id: int, db: Session = Depends(get_db), current_user: AppUser = Depends(get_current_user)):
    period = repo.get_by_id(db, period_id)
    if not period:
        raise HTTPException(status_code=404, detail="Period not found")
    return period

@router.post("/{period_id}/close", response_model=PeriodCloseResponse)
def close_period(period_id: int, db: Session = Depends(get_db), current_admin: AppUser = Depends(get_current_admin)):
    period = repo.get_by_id(db, period_id)
    if not period:
        raise HTTPException(status_code=404, detail="Period not found")
    if period.status == PeriodStatusEnum.closed:
        raise HTTPException(status_code=400, detail=f"Period {period.year}/{period.month:02d} is already closed")
    repo.close_period(db, period); db.commit(); db.refresh(period)
    return PeriodCloseResponse(message=f"Period {period.year}/{period.month:02d} closed successfully",
        period_id=period.id, year=period.year, month=period.month, closed_at=period.closed_at)