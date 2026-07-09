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

@router.get("/{period_id}/validate")
def validate_period_closure(
    period_id:     int, 
    db:            Session = Depends(get_db), 
    current_admin: AppUser = Depends(get_current_admin)
):
    """
    [SENIOR GRADE] Checklist de pré-clôture.
    Vérifie l'état des extractions pour cette période.
    """
    from app.models.extraction_lot import ExtractionLot, ExtractionStatusEnum
    
    # 1. Vérifier les jobs en cours
    running_jobs = db.query(ExtractionLot).filter(
        ExtractionLot.period_id == period_id,
        ExtractionLot.status.in_([ExtractionStatusEnum.pending, ExtractionStatusEnum.running])
    ).count()

    # 2. Vérifier les échecs
    failed_jobs = db.query(ExtractionLot).filter(
        ExtractionLot.period_id == period_id,
        ExtractionLot.status == ExtractionStatusEnum.failed
    ).count()

    # 3. Vérifier la couverture (simplifié)
    completed_jobs = db.query(ExtractionLot).filter(
        ExtractionLot.period_id == period_id,
        ExtractionLot.status == ExtractionStatusEnum.completed
    ).count()

    can_close = (running_jobs == 0)
    
    return {
        "can_close":      can_close,
        "running_jobs":   running_jobs,
        "failed_jobs":    failed_jobs,
        "completed_jobs": completed_jobs,
        "warnings":       ["Des jobs ont échoué"] if failed_jobs > 0 else []
    }


@router.post("", response_model=PeriodResponse, status_code=201)
def create_period(request: PeriodCreate, db: Session = Depends(get_db), current_admin: AppUser = Depends(get_current_admin)):
    existing = repo.get_by_year_month(db, request.year, request.month)
    if existing:
        raise HTTPException(status_code=400, detail=f"Period {request.year}/{request.month:02d} already exists")
    period = repo.create(db, request.model_dump())
    db.commit(); db.refresh(period)
    return period


from typing import List, Optional

@router.get("/current", response_model=Optional[PeriodResponse])
def get_current_period(db: Session = Depends(get_db), current_user: AppUser = Depends(get_current_user)):
    period = repo.get_current_period(db)
    if not period:
        return None
    return period


@router.get("/{period_id}", response_model=PeriodResponse)
def get_period(period_id: int, db: Session = Depends(get_db), current_user: AppUser = Depends(get_current_user)):
    period = repo.get_by_id(db, period_id)
    if not period:
        raise HTTPException(status_code=404, detail="Period not found")
    return period


@router.post("/{period_id}/close", response_model=PeriodCloseResponse)
def close_period(
    period_id:     int, 
    db:            Session = Depends(get_db), 
    current_admin: AppUser = Depends(get_current_admin)
):
    period = repo.get_by_id(db, period_id)
    if not period:
        raise HTTPException(status_code=404, detail="Period not found")
    if period.status == PeriodStatusEnum.closed:
        raise HTTPException(status_code=400, detail=f"Period {period.year}/{period.month:02d} already closed")
    
    # [SENIOR] Auto-Validation avant clôture
    from app.models.extraction_lot import ExtractionLot, ExtractionStatusEnum
    running = db.query(ExtractionLot).filter(
        ExtractionLot.period_id == period_id,
        ExtractionLot.status.in_([ExtractionStatusEnum.pending, ExtractionStatusEnum.running])
    ).count()
    
    if running > 0:
        raise HTTPException(status_code=400, detail=f"Impossible de clôturer : {running} jobs sont encore en cours.")

    # Résumé pour l'audit
    summary = {
        "validated_at":   datetime.now().isoformat(),
        "running_at_close": 0,
        "failed_at_close": db.query(ExtractionLot).filter(ExtractionLot.period_id == period_id, ExtractionLot.status == ExtractionStatusEnum.failed).count()
    }

    repo.close_period(db, period, closed_by_id=current_admin.id, closure_summary=summary)
    db.commit(); db.refresh(period)
    
    return PeriodCloseResponse(
        message=f"Period {period.year}/{period.month:02d} closed successfully",
        period_id=period.id, 
        year=period.year, 
        month=period.month, 
        closed_at=period.closed_at,
        closed_by_id=current_admin.id,
        closure_summary=summary
    )


@router.get("", response_model=List[PeriodResponse])
def list_periods(db: Session = Depends(get_db), current_user: AppUser = Depends(get_current_user)):
    # On enrichit manuellement le nom du closer pour éviter des N+1 complexes dans ce repo simple
    periods = repo.get_all(db)
    for p in periods:
        if p.closed_by:
            p.closed_by_name = p.closed_by.full_name or p.closed_by.username
    return periods


@router.delete("/{period_id}/lots", status_code=200)
def delete_period_lots(
    period_id:     int,
    db:            Session = Depends(get_db),
    current_admin: AppUser = Depends(get_current_admin)
):
    """
    [ADMIN ONLY] Supprime TOUS les lots d'extraction d'une période ouverte.

    Règles de sécurité :
    - Interdit si la période est clôturée (archive scellée).
    - Interdit si des jobs sont en cours (pending / running) → risque de corruption.
    - Seul un administrateur peut effectuer cette action.
    """
    from app.models.extraction_lot import ExtractionLot, ExtractionStatusEnum

    period = repo.get_by_id(db, period_id)
    if not period:
        raise HTTPException(status_code=404, detail="Période introuvable.")

    if period.status == PeriodStatusEnum.closed:
        raise HTTPException(
            status_code=400,
            detail=f"La période {period.year}/{period.month:02d} est clôturée. Impossible de modifier ses lots."
        )

    # Bloquer si jobs actifs (pending ou running)
    active = db.query(ExtractionLot).filter(
        ExtractionLot.period_id == period_id,
        ExtractionLot.status.in_([ExtractionStatusEnum.pending, ExtractionStatusEnum.running])
    ).count()
    if active > 0:
        raise HTTPException(
            status_code=400,
            detail=f"Impossible de vider : {active} job(s) sont encore en cours d'exécution sur cette période."
        )

    # Suppression de tous les lots
    lots = db.query(ExtractionLot).filter(ExtractionLot.period_id == period_id).all()
    deleted_count = len(lots)
    for lot in lots:
        db.delete(lot)
    db.commit()

    return {
        "message": f"{deleted_count} lot(s) supprimé(s) pour la période {period.year}/{period.month:02d}.",
        "deleted_count": deleted_count,
        "period_id": period_id
    }


@router.delete("/{period_id}", status_code=204)
def delete_period(
    period_id:     int,
    db:            Session = Depends(get_db),
    current_admin: AppUser = Depends(get_current_admin)
):
    """
    [ADMIN ONLY] Supprime une période ouverte.

    Règles de sécurité :
    - Interdit si la période est clôturée (archive scellée).
    - Interdit si la période possède des lots d'extraction (données liées).
    - Seul un administrateur peut effectuer cette action.
    """
    from app.models.extraction_lot import ExtractionLot

    period = repo.get_by_id(db, period_id)
    if not period:
        raise HTTPException(status_code=404, detail="Période introuvable.")

    # Règle 1 : impossible de supprimer une période clôturée
    if period.status == PeriodStatusEnum.closed:
        raise HTTPException(
            status_code=400,
            detail=f"La période {period.year}/{period.month:02d} est clôturée (archive scellée). Suppression impossible."
        )

    # Règle 2 : impossible de supprimer si des lots d'extraction existent
    lots_count = db.query(ExtractionLot).filter(ExtractionLot.period_id == period_id).count()
    if lots_count > 0:
        raise HTTPException(
            status_code=400,
            detail=f"La période {period.year}/{period.month:02d} contient {lots_count} lot(s) d'extraction. Videz-les avant de supprimer la période."
        )

    repo.delete(db, period_id)
    db.commit()