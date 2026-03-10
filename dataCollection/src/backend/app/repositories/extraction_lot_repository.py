from sqlalchemy.orm import Session
from typing import Optional, List

from app.models.extraction_lot import (
    ExtractionLot,
    ExtractionTypeEnum,
    ExtractionStatusEnum,
)
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

    def get_latest_monthly(
        self,
        db:         Session,
        period_id:  int,
        project_id: int,
    ) -> Optional[ExtractionLot]:
        """Retourne le dernier lot MONTHLY complété pour une période/projet."""
        return (
            db.query(ExtractionLot)
            .filter(
                ExtractionLot.period_id  == period_id,
                ExtractionLot.project_id == project_id,
                ExtractionLot.type       == ExtractionTypeEnum.MONTHLY,
                ExtractionLot.status     == ExtractionStatusEnum.completed,
            )
            .order_by(ExtractionLot.created_at.desc())
            .first()
        )

    def get_realtime_lots(
        self,
        db:         Session,
        period_id:  int,
        project_id: int,
    ) -> List[ExtractionLot]:
        """Retourne tous les lots REALTIME d'une période/projet."""
        return (
            db.query(ExtractionLot)
            .filter(
                ExtractionLot.period_id  == period_id,
                ExtractionLot.project_id == project_id,
                ExtractionLot.type       == ExtractionTypeEnum.REALTIME,
            )
            .all()
        )

    def monthly_exists(
        self,
        db:         Session,
        period_id:  int,
        project_id: int,
    ) -> bool:
        """
        [NEW] RG : Pas de 2ème dump MONTHLY avec la même période.
        Vérifie si un lot MONTHLY completed existe déjà.
        """
        return (
            db.query(ExtractionLot.id)
            .filter(
                ExtractionLot.period_id  == period_id,
                ExtractionLot.project_id == project_id,
                ExtractionLot.type       == ExtractionTypeEnum.MONTHLY,
                ExtractionLot.status     == ExtractionStatusEnum.completed,
            )
            .first()
        ) is not None

    def delete_realtime_lots(
        self,
        db:         Session,
        period_id:  int,
        project_id: int,
    ) -> int:
        """
        [FIX] Supprime tous les lots REALTIME d'une période/projet
        via cascade SQLAlchemy (commits + MRs liés supprimés automatiquement
        grâce à cascade='all, delete-orphan' sur le model).
        Retourne le nombre de lots supprimés.
        """
        lots  = self.get_realtime_lots(db, period_id, project_id)
        count = len(lots)
        for lot in lots:
            db.delete(lot)   # cascade supprime commits + MRs liés
        db.flush()
        return count

    def update_status(
        self,
        db:     Session,
        lot:    ExtractionLot,
        status: ExtractionStatusEnum,
    ) -> ExtractionLot:
        lot.status = status
        return lot