"""
repositories/extraction_lot_repository.py


"""
from typing import Optional, List

from sqlalchemy.orm import Session

from app.models.extraction_lot import ExtractionLot, ExtractionTypeEnum, ExtractionStatusEnum
from app.repositories.base import BaseRepository


class ExtractionLotRepository(BaseRepository[ExtractionLot]):

    def __init__(self):
        super().__init__(ExtractionLot)

    def get_by_period_project(
        self,
        db:         Session,
        period_id:  int,
        project_id: int,
    ) -> List[ExtractionLot]:
        return (
            db.query(ExtractionLot)
            .filter(
                ExtractionLot.period_id  == period_id,
                ExtractionLot.project_id == project_id,
            )
            .order_by(ExtractionLot.created_at.desc())
            .all()
        )

    def get_by_project(
        self,
        db:         Session,
        project_id: int,
    ) -> List[ExtractionLot]:
        """ liste tous les lots d'un projet donnés (pour le sélecteur de lots)."""
        from sqlalchemy.orm import joinedload
        return (
            db.query(ExtractionLot)
            .options(joinedload(ExtractionLot.period))
            .filter(ExtractionLot.project_id == project_id)
            .order_by(ExtractionLot.created_at.desc())
            .all()
        )


    def get_latest_monthly(
        self,
        db:         Session,
        period_id:  int,
        project_id: int,
    ) -> Optional[ExtractionLot]:
        """
        Retourne le dernier lot MONTHLY complété pour un projet/période.
        """
        return (
            db.query(ExtractionLot)
            .filter(
                ExtractionLot.period_id       == period_id,
                ExtractionLot.project_id      == project_id,
                ExtractionLot.extraction_type == ExtractionTypeEnum.MONTHLY,
                ExtractionLot.status          == ExtractionStatusEnum.completed,
            )
            .order_by(ExtractionLot.created_at.desc())
            .first()
        )

    def get_monthly(
        self,
        db:           Session,
        period_id:    int,
        project_id:   Optional[int] = None,
        developer_id: Optional[int] = None,
    ) -> Optional[ExtractionLot]:
        """
         AJOUT — Retourne le lot MONTHLY existant tous statuts confondus.

        Différence avec get_latest_monthly() :
            get_latest_monthly() → filtre status=completed uniquement
            get_monthly()        → tous statuts (running, failed, completed)

        Utilisé par extraction_service.run_monthly_extraction() en mode Backfill
        pour réutiliser le lot existant au lieu d'en créer un nouveau (évite 409).
        """
        q = db.query(ExtractionLot).filter(
            ExtractionLot.period_id       == period_id,
            ExtractionLot.extraction_type == ExtractionTypeEnum.MONTHLY,
        )
        if project_id:
            q = q.filter(ExtractionLot.project_id == project_id)
        if developer_id:
            q = q.filter(ExtractionLot.developer_id == developer_id)
            
        return q.order_by(ExtractionLot.created_at.desc()).first()

    def get_realtime_lots(
        self,
        db:         Session,
        period_id:  int,
        project_id: int,
    ) -> List[ExtractionLot]:
        """
        Retourne tous les lots REALTIME d'un projet/période (pour cleanup).
        """
        return (
            db.query(ExtractionLot)
            .filter(
                ExtractionLot.period_id       == period_id,
                ExtractionLot.project_id      == project_id,
                ExtractionLot.extraction_type == ExtractionTypeEnum.REALTIME,
            )
            .all()
        )

    def monthly_exists(
        self,
        db:           Session,
        period_id:    int,
        project_id:   Optional[int] = None,
        developer_id: Optional[int] = None,
    ) -> bool:
        """
        Vérifie qu'un lot MONTHLY complété existe déjà.
        Utilisé pour empêcher les doublons en mode normal (non-Backfill).
        """
        q = db.query(ExtractionLot.id).filter(
            ExtractionLot.period_id       == period_id,
            ExtractionLot.extraction_type == ExtractionTypeEnum.MONTHLY,
            ExtractionLot.status          == ExtractionStatusEnum.completed,
        )
        if project_id:
            q = q.filter(ExtractionLot.project_id == project_id)
        if developer_id:
            q = q.filter(ExtractionLot.developer_id == developer_id)
            
        return q.first() is not None

    def realtime_exists_for_dev(
        self,
        db:           Session,
        period_id:    int,
        developer_id: int,
    ) -> bool:
        """
        Vérifie qu'un lot REALTIME complété existe déjà pour ce développeur
        sur cette période. Utilisé pour bloquer les re-runs qui créent des
        valeurs incohérentes (idempotence REALTIME).
        """
        return (
            db.query(ExtractionLot.id)
            .filter(
                ExtractionLot.period_id       == period_id,
                ExtractionLot.developer_id    == developer_id,
                ExtractionLot.status          == ExtractionStatusEnum.completed,
            )
            .first() is not None
        )

    def delete_realtime_lots(
        self,
        db:           Session,
        period_id:    int,
        project_id:   Optional[int] = None,
        developer_id: Optional[int] = None,
    ) -> int:
        """Supprime tous les lots REALTIME d'un projet ou développeur sur une période."""
        q = db.query(ExtractionLot).filter(
            ExtractionLot.period_id == period_id,
            ExtractionLot.extraction_type == ExtractionTypeEnum.REALTIME
        )
        if project_id:
            q = q.filter(ExtractionLot.project_id == project_id)
        if developer_id:
            q = q.filter(ExtractionLot.developer_id == developer_id)
            
        lots = q.all()
        count = len(lots)
        for lot in lots:
            db.delete(lot)
        db.flush()
        return count

    def update_status(
        self,
        db:     Session,
        lot:    ExtractionLot,
        status: ExtractionStatusEnum,
    ) -> ExtractionLot:
        lot.status = status
        db.flush()
        return lot

    def get_by_status(
        self,
        db:     Session,
        status: ExtractionStatusEnum,
    ) -> List[ExtractionLot]:
        """
        Monitoring scheduler : tous les lots dans un état donné.
        """
        return (
            db.query(ExtractionLot)
            .filter(ExtractionLot.status == status)
            .order_by(ExtractionLot.created_at.desc())
            .all()
        )

    def get_pending_lots(self, db: Session) -> List[ExtractionLot]:
        return self.get_by_status(db, ExtractionStatusEnum.pending)

    def get_running_lots(self, db: Session) -> List[ExtractionLot]:
        return self.get_by_status(db, ExtractionStatusEnum.running)