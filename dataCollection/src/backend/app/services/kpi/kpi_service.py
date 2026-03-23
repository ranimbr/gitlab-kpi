"""
services/kpi/kpi_service.py

"""
import logging
from datetime import date, datetime
from typing import Optional

from sqlalchemy.orm import Session

from app.models.kpi_snapshot import KpiSnapshot
from app.repositories.kpi_snapshot_repository import KpiSnapshotRepository
from app.repositories.period_repository import PeriodRepository
from app.services.kpi.kpi_calculator import KpiCalculator

logger = logging.getLogger(__name__)


class KpiService:
    """
    Calcule et persiste les KPIs après chaque extraction.
    Orchestrateur : période → calcul → upsert snapshot.
    """

    async def generate_snapshot(
        self,
        db:           Session,
        project_id:   int,
        period_id:    int,
        lot_id:       int,
        site_id:      Optional[int] = None,
        group_id:     Optional[int] = None,
        developer_id: Optional[int] = None,
    ) -> KpiSnapshot:

        period_repo   = PeriodRepository()
        snapshot_repo = KpiSnapshotRepository()
        period        = period_repo.get_by_id(db, period_id)

        if not period:
            raise ValueError(f"Period id={period_id} not found")

        start_dt = datetime(period.year, period.month, 1)
        end_dt   = (
            datetime(period.year + 1, 1, 1)
            if period.month == 12
            else datetime(period.year, period.month + 1, 1)
        )

        calculator = KpiCalculator(db)
        metrics    = calculator.calculate_project_kpis(
            project_id = project_id,
            start_date = start_dt,
            end_date   = end_dt,
            site_id    = site_id,
        )

        # Nettoyage des clés non persistables (calculées par KpiCalculator)
        excluded = {"period_start", "period_end", "site_id", "project_id"}
        data = {k: v for k, v in metrics.items() if k not in excluded}

        # Clés FK
        data["project_id"]    = project_id
        data["period_id"]     = period_id
        data["lot_id"]        = lot_id
        data["site_id"]       = site_id
        data["group_id"]      = group_id
        data["developer_id"]  = developer_id
        # ✅ FIX : début de la période, pas date.today()
        # Cohérent avec KpiAggregator._upsert_snapshot()
        data["snapshot_date"] = date(period.year, period.month, 1)

        snapshot = snapshot_repo.upsert(db, data)
        db.flush()
        db.commit()
        db.refresh(snapshot)

        logger.info(
            f"KpiSnapshot saved — lot_id={lot_id} project_id={project_id} "
            f"period={period.year}/{period.month:02d} site_id={site_id} | "
            f"commits={data.get('nb_commits_per_project')} "
            f"devs={data.get('nb_developers')} "
            f"approved_rate={data.get('approved_mr_rate', 0):.2%} "
            f"merged_rate={data.get('merged_mr_rate', 0):.2%} "
            f"avg_review={data.get('avg_review_time_hours', 0):.1f}h"
        )

        return snapshot