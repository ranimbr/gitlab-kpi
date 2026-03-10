from datetime import date
from typing import Optional, List, Dict

from sqlalchemy.orm import Session

from app.repositories.kpi_snapshot_repository import KpiSnapshotRepository
from app.models.kpi_snapshot import KpiSnapshot


class AnalyticsService:
    """
    Fournit les données analytiques pour les dashboards.
    Lit exclusivement depuis les KpiSnapshots persistés.
    """

    def __init__(self, db: Session):
        self.db            = db
        self.snapshot_repo = KpiSnapshotRepository()

    # ─────────────────────────────────────────────────────────────────────────

    def get_latest_kpis(
        self,
        project_id: int,
        site:       Optional[str] = None,
    ) -> Optional[KpiSnapshot]:
        """
        [FIX] Retourne l'objet KpiSnapshot directement (pas un dict).
        Pydantic sérialise via from_attributes=True.
        """
        return self.snapshot_repo.get_latest(self.db, project_id, site)

    # ─────────────────────────────────────────────────────────────────────────

    def get_kpi_history(
        self,
        project_id:  int,
        site:        Optional[str]  = None,
        start_date:  Optional[date] = None,
        end_date:    Optional[date] = None,
    ) -> List[KpiSnapshot]:
        """
        [FIX] Retourne une liste de KpiSnapshot directement (pas des dicts).
        """
        return self.snapshot_repo.get_project_history(
            db         = self.db,
            project_id = project_id,
            site       = site,
            start_date = start_date,
            end_date   = end_date,
        )

    # ─────────────────────────────────────────────────────────────────────────

    def get_dashboard_summary(
        self,
        project_id: int,
        site:       Optional[str] = None,
    ) -> Dict:
        """
        Retourne le résumé complet pour le Dashboard KPI frontend.
        Structure : { latest_metrics, history, total_snapshots }
        """
        latest  = self.get_latest_kpis(project_id, site)
        history = self.get_kpi_history(project_id, site)

        return {
            "latest_metrics":  latest,        # KpiSnapshot | None
            "history":         history,        # List[KpiSnapshot]
            "total_snapshots": len(history),
        }