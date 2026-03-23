"""
services/kpi/kpi_aggregator.py


"""
import logging
from datetime import datetime, date
from typing import List, Optional

from sqlalchemy.orm import Session

from app.models.developer import Developer
from app.models.kpi_snapshot import KpiSnapshot
from app.models.project import Project
from app.repositories.developer_repository import DeveloperGroupRepository
from app.repositories.kpi_snapshot_repository import KpiSnapshotRepository
from app.repositories.period_repository import PeriodRepository
from app.services.kpi.kpi_calculator import KpiCalculator

logger = logging.getLogger(__name__)


class KpiAggregator:

    def __init__(self, db: Session):
        self.db            = db
        self.calculator    = KpiCalculator(db)
        self.snapshot_repo = KpiSnapshotRepository()
        self.group_repo    = DeveloperGroupRepository()
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
            1. Par site    — snapshot pour le site assigné au projet (Project.site_id)
                             ✅ FIX v2 : récupère le site depuis Project.site_id
                             et non depuis les groupes de développeurs
            2. Global      — agrégat tous sites (site_id=None, developer_id=None)
            3. Par dev     — un snapshot par développeur validé
                             ✅ FIX v1 : utilise calculate_for_developer() pour
                             des valeurs réellement individuelles
        """
        start_date = datetime(year, month, 1)
        end_date   = (
            datetime(year + 1, 1, 1)
            if month == 12
            else datetime(year, month + 1, 1)
        )

        period = self.period_repo.get_by_year_month(self.db, year, month)
        if not period:
            raise ValueError(f"Period {year}/{month:02d} not found")

        snapshots: List[KpiSnapshot] = []

        # ── Récupération du projet et de son site_id ──────────────────────────
        # ✅ FIX v2 : le site est assigné au PROJET (Project.site_id),
        # pas aux groupes de développeurs. C'est l'admin qui assigne le site
        # manuellement via la page "Gestion des Projets".
        project = self.db.query(Project).filter(Project.id == project_id).first()
        if not project:
            raise ValueError(f"Project id={project_id} not found")

        project_site_id = project.site_id  # peut être None si pas encore assigné

        # ── 1. Snapshot par site du projet ────────────────────────────────────
        if project_site_id is not None:
            kpis = self.calculator.calculate_for_site(
                project_id, project_site_id, start_date, end_date
            )
            # S'assurer que site_id est bien dans le dict avant l'upsert
            kpis["site_id"] = project_site_id

            snapshot = self._upsert_with_deltas(
                kpis      = kpis,
                period_id = period.id,
                year      = year,
                month     = month,
                lot_id    = lot_id,
            )
            snapshots.append(snapshot)
            logger.info(
                f"Snapshot site — project={project_id} site={project_site_id} "
                f"mr_rate={kpis.get('mr_rate_per_site', 0):.2f} "
                f"nb_devs={kpis.get('nb_developers', 0)} "
                f"commits={kpis.get('nb_commits_per_project', 0)}"
            )
        else:
            logger.warning(
                f"Project id={project_id} has no site_id assigned — "
                f"skipping site-level snapshot. "
                f"Assign a site in Admin → Projets."
            )

        # ── 2. Snapshot global (tous sites confondus) ─────────────────────────
        global_kpis = self.calculator.calculate_global(
            project_id, start_date, end_date
        )
        # Le snapshot global n'a pas de site_id ni developer_id
        global_kpis["site_id"]      = None
        global_kpis["developer_id"] = None

        global_snapshot = self._upsert_with_deltas(
            kpis      = global_kpis,
            period_id = period.id,
            year      = year,
            month     = month,
            lot_id    = lot_id,
        )
        snapshots.append(global_snapshot)
        logger.info(
            f"Snapshot global — project={project_id} "
            f"commits={global_kpis.get('nb_commits_per_project', 0)} "
            f"nb_devs={global_kpis.get('nb_developers', 0)}"
        )

        # ── 3. Snapshots par développeur individuel ───────────────────────────
        developers = (
            self.db.query(Developer)
            .filter(
                Developer.project_id    == project_id,
                Developer.is_validated.is_(True),
                Developer.is_bot.is_(False),
                Developer.is_active.is_(True),
            )
            .all()
        )

        for developer in developers:
            # ✅ FIX v1 : calculate_for_developer filtre réellement sur developer.id
            # Les valeurs reflètent l'activité INDIVIDUELLE du développeur
            dev_kpis = self.calculator.calculate_for_developer(
                project_id   = project_id,
                developer_id = developer.id,
                start_date   = start_date,
                end_date     = end_date,
            )
            # Propager le site_id du développeur dans le snapshot individuel
            # (peut différer du site_id du projet si le dev a changé de site)
            dev_kpis["site_id"]      = developer.site_id
            dev_kpis["developer_id"] = developer.id

            snapshot = self._upsert_with_deltas(
                kpis         = dev_kpis,
                period_id    = period.id,
                year         = year,
                month        = month,
                lot_id       = lot_id,
                developer_id = developer.id,
            )
            snapshots.append(snapshot)
            logger.debug(
                f"Snapshot dev — project={project_id} dev={developer.id} "
                f"site={developer.site_id} "
                f"mr_rate={dev_kpis.get('mr_rate_per_site', 0):.2f}"
            )

        if developers:
            logger.info(
                f"Snapshots developers — project={project_id} "
                f"count={len(developers)}"
            )

        self.db.flush()
        logger.info(
            f"generate_monthly_snapshots done — project={project_id} "
            f"{year}/{month:02d} total={len(snapshots)} snapshots"
        )
        return snapshots

    # =========================================================================
    # UPSERT + CALCUL DELTAS
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
        """
        Upsert le snapshot puis calcule les deltas vs mois précédent.

        Les 6 deltas sont calculés pour les trend indicators du dashboard :
        delta_X = valeur_mois_actuel - valeur_mois_précédent
            Positif = hausse | Négatif = baisse | NULL = pas de snapshot précédent
        L'interprétation (bon/mauvais) dépend du KPI — gérée côté frontend.
        """
        # ── Upsert du snapshot courant ────────────────────────────────────────
        snapshot = self._upsert_snapshot(
            kpis         = kpis,
            period_id    = period_id,
            year         = year,
            month        = month,
            lot_id       = lot_id,
            developer_id = developer_id,
        )

        # ── Calcul des deltas vs mois précédent ───────────────────────────────
        prev_year, prev_month = (year - 1, 12) if month == 1 else (year, month - 1)
        prev_period = self.period_repo.get_by_year_month(self.db, prev_year, prev_month)

        if prev_period:
            prev_snapshot = self.snapshot_repo.get_for_period(
                db           = self.db,
                project_id   = kpis.get("project_id"),
                period_id    = prev_period.id,
                site_id      = kpis.get("site_id"),
                group_id     = kpis.get("group_id"),
                developer_id = developer_id,
            )

            if prev_snapshot:
                snapshot.delta_mr_rate          = round(
                    snapshot.mr_rate_per_site     - prev_snapshot.mr_rate_per_site, 4
                )
                snapshot.delta_approved_mr_rate = round(
                    snapshot.approved_mr_rate     - prev_snapshot.approved_mr_rate, 4
                )
                snapshot.delta_merged_mr_rate   = round(
                    snapshot.merged_mr_rate       - prev_snapshot.merged_mr_rate, 4
                )
                snapshot.delta_commit_rate      = round(
                    snapshot.commit_rate_per_site - prev_snapshot.commit_rate_per_site, 4
                )
                snapshot.delta_nb_commits       = float(
                    snapshot.nb_commits_per_project - prev_snapshot.nb_commits_per_project
                )
                snapshot.delta_avg_review_time  = round(
                    snapshot.avg_review_time_hours - prev_snapshot.avg_review_time_hours, 2
                )
                logger.debug(
                    f"Deltas — project={kpis.get('project_id')} "
                    f"site={kpis.get('site_id')} dev={developer_id} "
                    f"Δmr={snapshot.delta_mr_rate:+.4f} "
                    f"Δcommits={snapshot.delta_nb_commits:+.0f} "
                    f"Δreview={snapshot.delta_avg_review_time:+.2f}h"
                )
            else:
                # Premier mois disponible → deltas NULL
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
        lot_id:       Optional[int] = None,
        developer_id: Optional[int] = None,
    ) -> KpiSnapshot:
        """Prépare le dict et délègue au repository pour l'upsert."""
        excluded = {"period_start", "period_end"}
        data = {k: v for k, v in kpis.items() if k not in excluded}

        data["period_id"]     = period_id
        data["snapshot_date"] = date(year, month, 1)

        if lot_id is not None:
            data["lot_id"] = lot_id

        # developer_id explicite écrase celui éventuel dans kpis
        if developer_id is not None:
            data["developer_id"] = developer_id

        return self.snapshot_repo.upsert(self.db, data)