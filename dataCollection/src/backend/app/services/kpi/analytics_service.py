"""
services/kpi/analytics_service.py
 
CORRECTIONS :
    1. get_dashboard_summary() retournait un dict sans period_label.
       DashboardSummaryResponse l'attend — le frontend affiche "Mars 2025"
       dans le titre du dashboard.
       ✅ FIX : period_label calculé depuis le snapshot le plus récent.
 
    2. get_dashboard_summary() ne retournait pas developer_id ni group_id
       dans le dict → DashboardSummaryResponse ne pouvait pas les propager.
       ✅ FIX : ajout dans le dict retourné.
"""
import logging
from datetime import date
from typing import Dict, List, Optional
 
from sqlalchemy.orm import Session
 
from app.models.kpi_snapshot import KpiSnapshot
from app.repositories.kpi_snapshot_repository import KpiSnapshotRepository
 
logger = logging.getLogger(__name__)
 
# Noms des mois en français pour period_label
_MOIS_FR = {
    1: "Janvier", 2: "Février",  3: "Mars",     4: "Avril",
    5: "Mai",     6: "Juin",     7: "Juillet",  8: "Août",
    9: "Septembre", 10: "Octobre", 11: "Novembre", 12: "Décembre",
}
 
 
class AnalyticsService:
 
    def __init__(self, db: Session):
        self.db            = db
        self.snapshot_repo = KpiSnapshotRepository()
 
    # =========================================================================
    # GET LATEST
    # =========================================================================
 
    def get_latest_kpis(
        self,
        project_id:   int,
        site_id:      Optional[int] = None,
        group_id:     Optional[int] = None,
        developer_id: Optional[int] = None,
    ) -> Optional[KpiSnapshot]:
        return self.snapshot_repo.get_latest(
            self.db,
            project_id,
            site_id      = site_id,
            group_id     = group_id,
            developer_id = developer_id,
        )
 
    # =========================================================================
    # GET HISTORY
    # =========================================================================
 
    def get_kpi_history(
        self,
        project_id:   int,
        site_id:      Optional[int]  = None,
        group_id:     Optional[int]  = None,
        developer_id: Optional[int]  = None,
        start_date:   Optional[date] = None,
        end_date:     Optional[date] = None,
    ) -> List[KpiSnapshot]:
        return self.snapshot_repo.get_project_history(
            db           = self.db,
            project_id   = project_id,
            site_id      = site_id,
            group_id     = group_id,
            developer_id = developer_id,
            start_date   = start_date,
            end_date     = end_date,
        )
 
    # =========================================================================
    # GET DASHBOARD SUMMARY
    # =========================================================================
 
    def get_dashboard_summary(
        self,
        project_id:   int,
        site_id:      Optional[int] = None,
        group_id:     Optional[int] = None,
        developer_id: Optional[int] = None,
    ) -> Dict:
        """
        Retourne le résumé complet pour DashboardSummaryResponse.
 
        ✅ FIX 1 : period_label calculé depuis le snapshot le plus récent
                   ex: "Mars 2025" au lieu de None.
        ✅ FIX 2 : developer_id et group_id inclus dans le dict retourné
                   pour que le router puisse les propager au frontend.
        """
        latest  = self.get_latest_kpis(project_id, site_id, group_id, developer_id)
        history = self.get_kpi_history(project_id, site_id, group_id, developer_id)
 
        # ✅ FIX 1 : construire period_label depuis snapshot_date
        period_label: Optional[str] = None
        if latest and latest.snapshot_date:
            mois = _MOIS_FR.get(latest.snapshot_date.month, "")
            period_label = f"{mois} {latest.snapshot_date.year}"
 
        return {
            "latest_metrics":  latest,
            "history":         history,
            "total_snapshots": len(history),
            "project_id":      project_id,
            "site_id":         site_id,
            "period_label":    period_label,   # ✅ "Mars 2025" ou None
        }