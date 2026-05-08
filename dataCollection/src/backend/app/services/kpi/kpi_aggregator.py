"""
services/kpi/kpi_aggregator.py

"""
import logging
from datetime import datetime, date
from typing import List, Optional

from sqlalchemy.orm import Session

from app.models.developer import Developer
from app.models.developer_project import DeveloperProject
from app.models.developer_site import DeveloperSite
from app.models.kpi_snapshot import KpiSnapshot
from app.models.project_site import ProjectSite
from app.models.extraction_lot import ExtractionLot
from app.repositories.kpi_snapshot_repository import KpiSnapshotRepository
from app.repositories.period_repository import PeriodRepository
from app.services.kpi.kpi_calculator import KpiCalculator

logger = logging.getLogger(__name__)


class KpiAggregator:

    def __init__(self, db: Session):
        self.db            = db
        self.calculator    = KpiCalculator(db)
        self.snapshot_repo = KpiSnapshotRepository()
        self.period_repo   = PeriodRepository()

    # =========================================================================
    # POINT D'ENTRÉE PRINCIPAL
    # =========================================================================

    def generate_monthly_snapshots(
        self,
        project_id: int,
        year:       int,
        month:      int,
        lot_id:     Optional[int] = None,
    ) -> List[KpiSnapshot]:
        """
        Génère tous les snapshots KPI pour un projet et une période donnée.

        Niveaux générés :
            1. Par site    — un snapshot par site associé au projet (ProjectSite M2M)
            2. Global      — agrégat tous sites confondus
            3. Par dev     — un snapshot par développeur validé
                             + calcul du score et du classement dans le site
        """
        start_date = datetime(year, month, 1)
        end_date   = (
            datetime(year + 1, 1, 1) if month == 12
            else datetime(year, month + 1, 1)
        )

        period = self.period_repo.get_by_year_month(self.db, year, month)
        if not period:
            raise ValueError(f"Period {year}/{month:02d} not found")

        snapshots: List[KpiSnapshot] = []


        # Sites du projet via ProjectSite (M2M) — Filtrés par présence réelle ce mois-ci
        project_site_ids = self._get_project_site_ids(project_id, period.id)

        # ── 1. Snapshot par site du projet ────────────────────────────────────
        if project_site_ids:
            for site_id in project_site_ids:
                kpis = self.calculator.calculate_for_site(
                    project_id, site_id, start_date, end_date
                )
                kpis["site_id"] = site_id
                snapshot = self._upsert_with_deltas(
                    kpis=kpis, period_id=period.id,
                    year=year, month=month, lot_id=lot_id,
                )
                snapshots.append(snapshot)
                logger.info(
                    "Snapshot site — project=%d site=%d mr_rate=%.2f nb_devs=%d",
                    project_id, site_id,
                    kpis.get("mr_rate_per_site", 0),
                    kpis.get("nb_developers", 0),
                )
        else:
            logger.warning(
                "Project id=%d has no sites assigned — "
                "skipping site-level snapshots. Assign sites in Admin → Projets.",
                project_id,
            )

        # ── 2. Snapshot global ────────────────────────────────────────────────
        global_kpis = self.calculator.calculate_global(project_id, start_date, end_date)
        global_kpis["site_id"]      = None
        global_kpis["developer_id"] = None

        global_snapshot = self._upsert_with_deltas(
            kpis=global_kpis, period_id=period.id,
            year=year, month=month, lot_id=lot_id,
        )
        snapshots.append(global_snapshot)

        # ── 2.5 Snapshot par groupe ───────────────────────────────────────────
        project_group_ids = self._get_project_group_ids(project_id, period.id)
        if project_group_ids:
            for group_id in project_group_ids:
                kpis = self.calculator.calculate_for_group(
                    project_id, group_id, start_date, end_date
                )
                kpis["group_id"] = group_id
                snapshot = self._upsert_with_deltas(
                    kpis=kpis, period_id=period.id,
                    year=year, month=month, lot_id=lot_id,
                )
                snapshots.append(snapshot)
                logger.info(
                    "Snapshot group — project=%d group=%d mr_rate=%.2f nb_devs=%d",
                    project_id, group_id,
                    kpis.get("mr_rate_per_site", 0),
                    kpis.get("nb_developers", 0),
                )

        # On filtre strictement par les lots d'extraction du mois (Registre RH)
        # S'il n'y a pas de lots individuels, on prend tous les développeurs assignés au projet pour ce mois.
        has_individual_lots = self.db.query(ExtractionLot).filter(
            ExtractionLot.period_id == period.id,
            ExtractionLot.project_id == project_id,
            ExtractionLot.developer_id.isnot(None)
        ).first() is not None

        if has_individual_lots:
            valid_dev_ids_subquery = (
                self.db.query(ExtractionLot.developer_id)
                .filter(
                    ExtractionLot.period_id == period.id,
                    ExtractionLot.project_id == project_id,
                    ExtractionLot.developer_id.isnot(None)
                )
                .subquery()
            )
            developers_query = self.db.query(Developer).filter(Developer.id.in_(valid_dev_ids_subquery))
        else:
            # Fallback : Cohorte définie dans DeveloperProject pour ce mois
            developers_query = (
                self.db.query(Developer)
                .join(DeveloperProject, Developer.id == DeveloperProject.developer_id)
                .filter(
                    DeveloperProject.project_id == project_id,
                    DeveloperProject.period_id  == period.id,
                    DeveloperProject.is_active.is_(True)
                )
            )

        developers = (
            developers_query
            .filter(
                Developer.is_validated.is_(True),
                Developer.is_bot.is_(False),
                Developer.is_active.is_(True),
            )
            .all()
        )

        # Diagnostic logs pour le Senior Engineer
        all_active_project_devs = (
            self.db.query(Developer.name)
            .join(DeveloperProject, DeveloperProject.developer_id == Developer.id)
            .filter(DeveloperProject.project_id == project_id, DeveloperProject.is_active == True)
            .all()
        )
        if len(all_active_project_devs) > len(developers):
            ghosts = len(all_active_project_devs) - len(developers)
            logger.warning(
                "GHOST_DEVS_DETECTED: %d devs are active in DB but missing from RH lots for %d/%02d. They will be ignored.",
                ghosts, year, month
            )

        # Collecter les snapshots individuels pour le classement par site
        dev_snapshots_by_site: dict = {}  # site_id → [(score, snapshot)]

        for developer in developers:
            dev_kpis = self.calculator.calculate_for_developer(
                project_id=project_id, developer_id=developer.id,
                start_date=start_date, end_date=end_date,
            )

            primary_site_id = self._get_primary_site_for_developer(developer.id)
            dev_kpis["site_id"]      = primary_site_id
            dev_kpis["developer_id"] = developer.id

            snapshot = self._upsert_with_deltas(
                kpis=dev_kpis, period_id=period.id,
                year=year, month=month, lot_id=lot_id,
                developer_id=developer.id,
            )
            snapshots.append(snapshot)

            score = dev_kpis.get("developer_score", 0.0) or 0.0
            if primary_site_id is not None:
                dev_snapshots_by_site.setdefault(primary_site_id, []).append(
                    (score, snapshot)
                )

        # ── Calcul du classement dans chaque site ────────────────────────────
        for site_id, score_snapshot_list in dev_snapshots_by_site.items():
            sorted_list = sorted(score_snapshot_list, key=lambda x: x[0], reverse=True)
            for rank, (_, snap) in enumerate(sorted_list, start=1):
                snap.score_rank_in_site = rank

        if developers:
            logger.info(
                "Snapshots developers — project=%d count=%d",
                project_id, len(developers),
            )

        self.db.flush()

        # ── Log structuré final ───────────────────────────────────────────────
        logger.info(
            "KPI_GENERATION_DONE",
            extra={
                "project_id":      project_id,
                "period":          f"{year}/{month:02d}",
                "sites_count":     len(project_site_ids),
                "devs_count":      len(developers),
                "snapshots_total": len(snapshots),
            },
        )
        return snapshots

    # =========================================================================
    # HELPERS PRIVÉS
    # =========================================================================

    def _get_project_site_ids(self, project_id: int, period_id: int) -> List[int]:
        """
        ✅ [SENIOR ARCHITECTURE] Résolution dynamique des sites filtrés par période.
        Supporte les extractions par lots (individuels) et les extractions globales.
        """
        # 1. Tenter via les lots d'extraction (Précision maximale)
        site_ids = (
            self.db.query(DeveloperSite.site_id)
            .join(ExtractionLot, ExtractionLot.developer_id == DeveloperSite.developer_id)
            .filter(ExtractionLot.period_id == period_id)
            .filter(ExtractionLot.project_id == project_id)
            .distinct()
            .all()
        )
        
        if site_ids:
            return [row[0] for row in site_ids]
            
        # 2. Fallback : Tous les sites des développeurs actifs sur le projet ce mois-ci
        # (Cas des extractions globales sans lots individuels)
        site_ids = (
            self.db.query(DeveloperSite.site_id)
            .join(DeveloperProject, DeveloperSite.developer_id == DeveloperProject.developer_id)
            .filter(DeveloperProject.project_id == project_id)
            .filter(DeveloperProject.period_id  == period_id)
            .filter(DeveloperProject.is_active.is_(True))
            .distinct()
            .all()
        )
        return [row[0] for row in site_ids]

    def _get_project_group_ids(self, project_id: int, period_id: int) -> List[int]:
        """
        Trouve tous les groupes impliqués dans ce projet ce mois-ci.
        """
        from app.models.developer_group import developer_group_link
        
        # 1. Via les lots
        group_ids = (
            self.db.query(developer_group_link.c.group_id)
            .join(ExtractionLot, ExtractionLot.developer_id == developer_group_link.c.developer_id)
            .filter(ExtractionLot.period_id == period_id)
            .filter(ExtractionLot.project_id == project_id)
            .distinct()
            .all()
        )
        if group_ids:
            return [row[0] for row in group_ids]
            
        # 2. Fallback
        group_ids = (
            self.db.query(developer_group_link.c.group_id)
            .join(DeveloperProject, developer_group_link.c.developer_id == DeveloperProject.developer_id)
            .filter(DeveloperProject.project_id == project_id)
            .filter(DeveloperProject.period_id  == period_id)
            .filter(DeveloperProject.is_active.is_(True))
            .distinct()
            .all()
        )
        return [row[0] for row in group_ids]

    def _get_primary_site_for_developer(self, developer_id: int) -> Optional[int]:
        """
        Récupère le site primaire d'un développeur via DeveloperSite (M2M).
        Fallback : premier site trouvé si aucun site primaire défini.
        """
        row = (
            self.db.query(DeveloperSite.site_id)
            .filter(
                DeveloperSite.developer_id == developer_id,
                DeveloperSite.is_primary.is_(True),
            )
            .first()
        )
        if row:
            return row.site_id
        # Fallback
        row = (
            self.db.query(DeveloperSite.site_id)
            .filter(DeveloperSite.developer_id == developer_id)
            .first()
        )
        return row.site_id if row else None

    # =========================================================================
    # UPSERT + DELTAS
    # =========================================================================

    def _upsert_with_deltas(
        self,
        kpis:         dict,
        period_id:    int,
        year:         int,
        month:        int,
        lot_id:       Optional[int] = None,
        developer_id: Optional[int] = None,
    ) -> KpiSnapshot:
        snapshot = self._upsert_snapshot(kpis, period_id, year, month, lot_id, developer_id)

        prev_year, prev_month = (year - 1, 12) if month == 1 else (year, month - 1)
        prev_period = self.period_repo.get_by_year_month(self.db, prev_year, prev_month)

        if prev_period:
            prev_snapshot = self.snapshot_repo.get_for_period(
                db=self.db,
                project_id=kpis.get("project_id"),
                period_id=prev_period.id,
                site_id=kpis.get("site_id"),
                group_id=kpis.get("group_id"),
                developer_id=developer_id,
            )
            if prev_snapshot:
                snapshot.delta_mr_rate          = round(
                    snapshot.mr_rate_per_site     - prev_snapshot.mr_rate_per_site,     4)
                snapshot.delta_approved_mr_rate = round(
                    snapshot.approved_mr_rate     - prev_snapshot.approved_mr_rate,     4)
                snapshot.delta_merged_mr_rate   = round(
                    snapshot.merged_mr_rate       - prev_snapshot.merged_mr_rate,       4)
                snapshot.delta_commit_rate      = round(
                    snapshot.commit_rate_per_site - prev_snapshot.commit_rate_per_site, 4)
                #  FIX : suppression du float() inutile — nb_commits_per_project est Integer
                snapshot.delta_nb_commits       = (
                    snapshot.nb_commits_per_project - prev_snapshot.nb_commits_per_project
                )
                snapshot.delta_avg_review_time  = round(
                    snapshot.avg_review_time_hours - prev_snapshot.avg_review_time_hours, 2)
            else:
                snapshot.delta_mr_rate          = None
                snapshot.delta_approved_mr_rate = None
                snapshot.delta_merged_mr_rate   = None
                snapshot.delta_commit_rate      = None
                snapshot.delta_nb_commits       = None
                snapshot.delta_avg_review_time  = None

        self.db.flush()
        return snapshot

    def _upsert_snapshot(
        self,
        kpis:         dict,
        period_id:    int,
        year:         int,
        month:        int,
        lot_id:       Optional[int],
        developer_id: Optional[int],
    ) -> KpiSnapshot:
        excluded = {"period_start", "period_end"}
        data = {k: v for k, v in kpis.items() if k not in excluded}
        data["period_id"]     = period_id
        data["snapshot_date"] = date(year, month, 1)
        if lot_id is not None:
            data["lot_id"] = lot_id
        if developer_id is not None:
            data["developer_id"] = developer_id
        return self.snapshot_repo.upsert(self.db, data)