from datetime import datetime, date
from typing import List

from sqlalchemy.orm import Session

from app.services.kpi.kpi_calculator import KpiCalculator
from app.repositories.kpi_snapshot_repository import KpiSnapshotRepository
from app.repositories.developer_repository import DeveloperGroupRepository
from app.repositories.period_repository import PeriodRepository
from app.models.kpi_snapshot import KpiSnapshot


class KpiAggregator:
    """
    Génère les snapshots KPI mensuels.

    Commit géré par MonthlyDumpService.
    """

    def __init__(self, db: Session):

        self.db = db

        self.calculator = KpiCalculator(db)
        self.snapshot_repo = KpiSnapshotRepository()
        self.group_repo = DeveloperGroupRepository()
        self.period_repo = PeriodRepository()

    # ─────────────────────────────────────────────

    def generate_monthly_snapshots(
        self,
        project_id: int,
        year: int,
        month: int,
    ) -> List[KpiSnapshot]:

        start_date = datetime(year, month, 1)

        if month == 12:
            end_date = datetime(year + 1, 1, 1)
        else:
            end_date = datetime(year, month + 1, 1)

        period = self.period_repo.get_by_year_month(
            self.db,
            year,
            month,
        )

        if not period:
            raise ValueError(
                f"Period {year}/{month:02d} not found"
            )

        snapshots: List[KpiSnapshot] = []

        # ─── SNAPSHOT PAR SITE ───

        sites = self.group_repo.get_all_sites(
            self.db,
            project_id,
        )

        for site in sites:

            kpis = self.calculator.calculate_for_site(
                project_id,
                site,
                start_date,
                end_date,
            )

            snapshot = self._upsert_snapshot(
                kpis,
                period.id,
                start_date,
            )

            snapshots.append(snapshot)

        # ─── SNAPSHOT GLOBAL ───

        global_kpis = self.calculator.calculate_global(
            project_id,
            start_date,
            end_date,
        )

        global_snapshot = self._upsert_snapshot(
            global_kpis,
            period.id,
            start_date,
        )

        snapshots.append(global_snapshot)

        self.db.flush()

        return snapshots

    # ─────────────────────────────────────────────

    def _upsert_snapshot(
        self,
        kpis: dict,
        period_id: int,
        start_date: datetime,
    ) -> KpiSnapshot:

        excluded = {"period_start", "period_end"}

        data = {
            k: v
            for k, v in kpis.items()
            if k not in excluded
        }

        data["period_id"] = period_id

        data["snapshot_date"] = date(
            start_date.year,
            start_date.month,
            1,
        )

        snapshot = self.snapshot_repo.upsert(
            self.db,
            data,
        )

        self.db.flush()

        return snapshot