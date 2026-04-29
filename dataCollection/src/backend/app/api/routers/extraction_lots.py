"""api/routers/extraction_lots.py

AMELIORATION SENIOR :
    Les compteurs commit_count et mr_count sont calcules via SQL COUNT
    directement dans le router, puis injectes dans le dict de reponse.
    Pas de lazy loading, pas de proprietes Python fragiles.
    Une seule requete SQL par lot (O(N) mais acceptable pour un PFE).
"""
from fastapi           import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm    import Session, joinedload
from sqlalchemy        import func
from typing            import List, Optional

from app.database.session                       import get_db
from app.api.dependencies                       import get_current_user
from app.schemas.extraction_lot                 import ExtractionLotResponse, BulkDeleteRequest
from app.repositories.extraction_lot_repository import ExtractionLotRepository
from app.models.extraction_lot                  import ExtractionLot
from app.models.app_user                        import AppUser
from app.models.commit                          import Commit
from app.models.merge_request                   import MergeRequest

router = APIRouter(prefix="/extraction-lots", tags=["Extraction Lots"])
repo   = ExtractionLotRepository()


def _base_query(db: Session):
    """Query de base avec toutes les relations eager-loadees."""
    return (
        db.query(ExtractionLot)
        .options(
            joinedload(ExtractionLot.developer),
            joinedload(ExtractionLot.triggered_by_user),
            joinedload(ExtractionLot.project),
            joinedload(ExtractionLot.period),
        )
    )


def _enrich_lot(lot: ExtractionLot, db: Session) -> dict:
    """Convertit un lot ORM en dict avec les compteurs SQL injectes."""
    commit_count = db.query(func.count(Commit.id)).filter(
        Commit.extraction_lot_id == lot.id
    ).scalar() or 0

    mr_count = db.query(func.count(MergeRequest.id)).filter(
        MergeRequest.extraction_lot_id == lot.id
    ).scalar() or 0

    return {
        "id":              lot.id,
        "extraction_type": lot.extraction_type,
        "status":          lot.status,
        "project_id":      lot.project_id,
        "developer_id":    lot.developer_id,
        "period_id":       lot.period_id,
        "triggered_by":    lot.triggered_by,
        "generated_file":  lot.generated_file,
        "md5sum":          lot.md5sum,
        "error_message":   lot.error_message,
        "created_at":      lot.created_at,
        "completed_at":    lot.completed_at,
        "commit_count":    commit_count,
        "mr_count":        mr_count,
        "developer":           lot.developer,
        "triggered_by_user":   lot.triggered_by_user,
    }


@router.get("", response_model=List[ExtractionLotResponse])
def list_lots(
    db:           Session  = Depends(get_db),
    current_user: AppUser  = Depends(get_current_user),
    project_id:   Optional[str] = Query(default=None),
    period_id:    Optional[str] = Query(default=None),
):
    pid   = int(project_id)  if project_id  and project_id.isdigit()  else None
    perid = int(period_id)   if period_id   and period_id.isdigit()   else None

    q = _base_query(db)
    if pid:
        q = q.filter(ExtractionLot.project_id == pid)
    if perid:
        q = q.filter(ExtractionLot.period_id == perid)

    lots = q.order_by(ExtractionLot.created_at.desc()).all()
    return [_enrich_lot(lot, db) for lot in lots]


@router.get("/{lot_id}", response_model=ExtractionLotResponse)
def get_lot(
    lot_id:       int,
    db:           Session = Depends(get_db),
    current_user: AppUser = Depends(get_current_user),
):
    lot = (
        _base_query(db)
        .filter(ExtractionLot.id == lot_id)
        .first()
    )
    if not lot:
        raise HTTPException(status_code=404, detail="Extraction lot not found")
    return _enrich_lot(lot, db)


@router.delete("/{lot_id}")
def delete_lot(
    lot_id:       int,
    db:           Session = Depends(get_db),
    current_user: AppUser = Depends(get_current_user),
):
    """Supprime un lot specifique."""
    lot = db.query(ExtractionLot).filter(ExtractionLot.id == lot_id).first()
    if not lot:
        raise HTTPException(status_code=404, detail="Extraction lot not found")
    db.delete(lot)
    db.commit()
    return {"message": f"Lot {lot_id} supprime avec succes"}


@router.post("/bulk-delete")
def bulk_delete_lots(
    req:          BulkDeleteRequest,
    db:           Session = Depends(get_db),
    current_user: AppUser = Depends(get_current_user),
):
    """Suppression groupee de lots."""
    if not req.lot_ids:
        return {"message": "Aucun lot specifie"}

    count = db.query(ExtractionLot).filter(
        ExtractionLot.id.in_(req.lot_ids)
    ).delete(synchronize_session=False)
    db.commit()
    return {"message": f"{count} lots supprimes avec succes"}