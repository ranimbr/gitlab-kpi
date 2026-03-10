# services/kpi/kpi_service.py
import logging
from datetime import date, datetime
from typing import Optional

from sqlalchemy.orm import Session

from app.models.kpi_snapshot import KpiSnapshot
from app.repositories.period_repository import PeriodRepository
from app.repositories.kpi_snapshot_repository import KpiSnapshotRepository
from app.services.kpi.kpi_calculator import KpiCalculator

logger = logging.getLogger(__name__)


class KpiService:
    """
    Calcule et persiste les 7 KPIs après chaque extraction.
    Utilisé par le router /extraction/run après chaque run REALTIME ou MONTHLY.

    ✅ CORRECTION POINT 4 — Délégation à KpiCalculator pour éviter la duplication
    de logique entre KpiService._compute_metrics() et KpiCalculator.calculate_project_kpis().
    KpiService est maintenant un orchestrateur pur : période → calcul → upsert.
    """

    async def generate_snapshot(
        self,
        db:         Session,
        project_id: int,
        period_id:  int,
        lot_id:     int,
        site:       Optional[str] = None,
    ) -> KpiSnapshot:

        period_repo   = PeriodRepository()
        snapshot_repo = KpiSnapshotRepository()
        period        = period_repo.get_by_id(db, period_id)

        if period:
            start_dt = datetime(period.year, period.month, 1)
            end_dt   = (
                datetime(period.year + 1, 1, 1)
                if period.month == 12
                else datetime(period.year, period.month + 1, 1)
            )
        else:
            raise ValueError(f"Period id={period_id} not found")

        # ✅ CORRECTION POINT 4 — Délégation à KpiCalculator (plus de _compute_metrics)
        calculator = KpiCalculator(db)
        metrics    = calculator.calculate_project_kpis(
            project_id = project_id,
            start_date = start_dt,
            end_date   = end_dt,
            site       = site,
        )

        # Nettoyage des clés non persistables retournées par calculate_project_kpis
        excluded = {"period_start", "period_end", "site", "project_id"}
        data = {k: v for k, v in metrics.items() if k not in excluded}

        # ✅ CORRECTION POINT 3 — lot_id persisté dans le snapshot
        data["project_id"]    = project_id
        data["period_id"]     = period_id
        data["lot_id"]        = lot_id
        data["site"]          = site
        data["snapshot_date"] = date.today()

        snapshot = snapshot_repo.upsert(db, data)
        db.flush()
        db.commit()
        db.refresh(snapshot)

        logger.info(
            f"KpiSnapshot saved — lot_id={lot_id} project_id={project_id} "
            f"period={period.year}/{period.month:02d} site={site} | "
            f"commits={data.get('nb_commits_per_project')} "
            f"devs={data.get('nb_developers')} "
            f"approved_rate={data.get('approved_mr_rate', 0):.2%} "
            f"merged_rate={data.get('merged_mr_rate', 0):.2%} "
            f"avg_review={data.get('avg_review_time_hours', 0):.1f}h"
        )

        return snapshot