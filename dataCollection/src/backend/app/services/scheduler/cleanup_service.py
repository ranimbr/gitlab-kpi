import logging
from sqlalchemy.orm import Session

from app.repositories.extraction_lot_repository import ExtractionLotRepository

logger = logging.getLogger(__name__)


class CleanupService:
    """
    Nettoie les anciens lots REALTIME après génération du lot MONTHLY.
    Appelé par MonthlyDumpService après chaque extraction mensuelle réussie.
    """

    def __init__(self, db: Session):
        self.db = db
        self.lot_repo = ExtractionLotRepository()

    def delete_realtime_lots(
        self,
        project_id: int,
        period_id: int
    ) -> int:
        """
        Supprime tous les lots REALTIME d'un projet/période.

        IMPORTANT :
        - Aucun commit ici.
        - Le commit est géré par MonthlyDumpService.

        Retourne le nombre de lots supprimés.
        """

        try:
            count = self.lot_repo.delete_realtime_lots(
                db=self.db,
                period_id=period_id,
                project_id=project_id
            )

            logger.info(
                f"[CleanupService] deleted {count} REALTIME lots "
                f"(project_id={project_id}, period_id={period_id})"
            )

            return count

        except Exception as e:
            logger.error(
                f"[CleanupService] cleanup failed "
                f"(project_id={project_id}, period_id={period_id}) : {e}",
                exc_info=True
            )
            raise