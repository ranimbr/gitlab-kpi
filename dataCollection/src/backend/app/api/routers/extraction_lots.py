"""api/routers/extraction_lots.py   
"""
from fastapi           import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm    import Session, joinedload
from sqlalchemy        import func
from typing            import List, Optional
from datetime          import datetime, timezone

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
        "period":              lot.period,
        "project":             lot.project,
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


@router.get("/period/{period_id}/global-dump")
def get_global_period_dump(
    period_id:    int,
    db:           Session = Depends(get_db),
    current_user: AppUser = Depends(get_current_user),
):
    """
    ✅ NOUVEAU [SENIOR] : Export Global Mensuel.
    Agrège TOUS les commits et MRs de TOUS les projets pour la période donnée.
    """
    from app.models.period import Period

    period = db.query(Period).filter(Period.id == period_id).first()
    if not period:
        raise HTTPException(status_code=404, detail="Période introuvable")

    # On récupère tous les lots COMPLETED de cette période
    lots = db.query(ExtractionLot).filter(
        ExtractionLot.period_id == period_id,
        ExtractionLot.status == "completed"
    ).all()

    all_commits = []
    all_mrs     = []

    for lot in lots:
        p_name = lot.project.name if lot.project else "Projet Inconnu"
        
        # Commits
        lot_commits = db.query(Commit).filter(Commit.extraction_lot_id == lot.id).all()
        for c in lot_commits:
            all_commits.append({
                "sha":             c.gitlab_commit_id,
                "title":           c.title,
                "authored_date":   c.authored_date.isoformat() if c.authored_date else None,
                "project":         p_name,
                "developer":       c.developer.name if c.developer else c.author_name,
                "additions":       c.additions,
                "deletions":       c.deletions
            })

        # MRs
        lot_mrs = db.query(MergeRequest).filter(MergeRequest.extraction_lot_id == lot.id).all()
        for m in lot_mrs:
            all_mrs.append({
                "gitlab_id":       m.gitlab_mr_id,
                "title":           m.title,
                "state":           m.state,
                "project":         p_name,
                "author":          m.developer.name if m.developer else m.author_name,
                "created_at":      m.created_at_gitlab.isoformat() if m.created_at_gitlab else None,
                "merged_at":       m.merged_at.isoformat() if m.merged_at else None
            })

    return {
        "period":        f"{period.year}/{period.month:02d}",
        "generated_at":  datetime.now(timezone.utc).isoformat(),
        "stats": {
            "total_projects": len(lots),
            "total_commits":  len(all_commits),
            "total_mrs":      len(all_mrs)
        },
        "commits": all_commits,
        "merge_requests": all_mrs
    }