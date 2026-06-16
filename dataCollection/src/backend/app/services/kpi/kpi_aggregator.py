"""
services/kpi/kpi_aggregator.py

"""
import logging
from datetime import datetime, date
from typing import List, Optional

from sqlalchemy.orm import Session
from sqlalchemy import or_, and_

from app.models.developer import Developer
from app.models.developer_project import DeveloperProject
from app.models.developer_site import DeveloperSite
from app.models.kpi_snapshot import KpiSnapshot
from app.models.project_site import ProjectSite
from app.models.extraction_lot import ExtractionLot
from app.repositories.kpi_snapshot_repository import KpiSnapshotRepository
from app.repositories.period_repository import PeriodRepository
from app.services.kpi.kpi_calculator import KpiCalculator
from app.utils.date_utils import get_period_date_range_exclusive
from app.utils.mission_utils import get_certified_developers_for_mission

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
        # ── Résolution de la plage de dates du mois (Source Unique de Vérité) ──
        # get_period_date_range_exclusive retourne [Jan 1 ... Feb 1)
        # Conforme au pattern < end_date utilisé partout dans KpiCalculator.
        start_date, end_date = get_period_date_range_exclusive(year, month)

        period = self.period_repo.get_by_year_month(self.db, year, month)
        if not period:
            raise ValueError(f"Period {year}/{month:02d} not found")

        #  Harmonisation Mission-Strict (FIX 1: Matérialisation unique)
        eligible_ids = get_certified_developers_for_mission(
            db=self.db, project_id=project_id, period_id=period.id,
            start_date=start_date.date(), end_date=end_date.date()
        )

        # ── Nettoyage des snapshots agrégés périmés (site / global / groupe) ──
        # Les snapshots de niveau site/global/groupe ne sont pas couverts par
        # _prune_stale_developer_snapshots. Sans ce nettoyage, chaque appel à
        # generate_monthly_snapshots accumule de nouveaux snapshots en doublons.
        self.db.query(KpiSnapshot).filter(
            KpiSnapshot.project_id   == project_id,
            KpiSnapshot.period_id    == period.id,
            KpiSnapshot.developer_id.is_(None),   # site, global et groupe uniquement
        ).delete(synchronize_session=False)
        self.db.flush()

        #  Élagage des snapshots de développeurs obsolètes (SCD Type 2 Rebalancing)
        # Supprime les snapshots individuels qui ne correspondent plus au site actuel du dev.
        self._prune_stale_developer_snapshots(project_id, period.id, eligible_ids)

        snapshots = []

        #  Résolution des sites impactés pour cette période
        project_site_ids = self._get_project_site_ids(project_id, period.id)

        # ── 1. Snapshot par site du projet ────────────────────────────────────
        if project_site_ids:
            for site_id in project_site_ids:
                kpis = self.calculator.calculate_for_site(
                    project_id, site_id, start_date, end_date, eligible_ids=eligible_ids
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
        global_kpis = self.calculator.calculate_global(project_id, start_date, end_date, eligible_ids=eligible_ids)
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
                    project_id, group_id, start_date, end_date, eligible_ids=eligible_ids
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

        # Récupération des objets Developer à partir des IDs matérialisés
        developers = self.db.query(Developer).filter(Developer.id.in_(eligible_ids)).all()

        # Collecter les snapshots individuels pour le classement par site
        dev_snapshots_by_site: dict = {}  # site_id → [(score, snapshot)]

        for developer in developers:
            dev_kpis = self.calculator.calculate_for_developer(
                project_id=project_id, developer_id=developer.id,
                start_date=start_date, end_date=end_date, eligible_ids=eligible_ids
            )

            primary_site_id = self._get_primary_site_for_developer(developer.id, period_date=start_date.date())
            primary_group_id = self._get_primary_group_for_developer(developer.id, period_date=start_date.date())
            
            dev_kpis["site_id"]      = primary_site_id
            dev_kpis["group_id"]     = primary_group_id
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

    def recalculate_period(self, period_id: int):
        """
        [SENIOR] Recalcule tous les KPIs pour une période donnée.
        Utile lors d'un changement de logique métier (ex: Contribution Pure).
        Identifie automatiquement tous les projets actifs ou ayant des données.
        """
        period = self.period_repo.get_by_id(self.db, period_id)
        if not period:
            logger.error(f"Cannot recalculate: Period id={period_id} not found")
            return

        # 1. Identifier tous les projets impliqués
        # Via DeveloperProject (Missions RH)
        import calendar
        p_start = date(period.year, period.month, 1)
        last_d  = calendar.monthrange(period.year, period.month)[1]
        end_p   = date(period.year, period.month, last_d)

        project_ids = {
            r[0] for r in self.db.query(DeveloperProject.project_id)
            .filter(
                or_(
                    DeveloperProject.period_id == period_id,
                    and_(
                        DeveloperProject.period_id.is_(None),
                        or_(DeveloperProject.start_date.is_(None), DeveloperProject.start_date <= end_p),
                        or_(DeveloperProject.end_date.is_(None), DeveloperProject.end_date >= p_start)
                    )
                )
            )
            .all()
        }

        # Via ExtractionLot (Données brutes existantes)
        lot_projects = {
            r[0] for r in self.db.query(ExtractionLot.project_id)
            .filter(ExtractionLot.period_id == period_id)
            .all()
        }
        project_ids.update(lot_projects)

        # Via Snapshots existants (Nettoyage/Mise à jour)
        snap_projects = {
            r[0] for r in self.db.query(KpiSnapshot.project_id)
            .filter(KpiSnapshot.period_id == period_id)
            .all()
        }
        project_ids.update(snap_projects)

        if not project_ids:
            logger.warning(f"No projects found to recalculate for period {period.year}/{period.month:02d}")
            return

        logger.info(
            f"RECALCULATE_PERIOD_START | period={period.year}/{period.month:02d} "
            f"| projects_count={len(project_ids)}"
        )

        from app.services.extraction.extraction_service import ExtractionService
        from app.services.extraction.extraction_filters import build_period_window
        from app.models.extraction_lot import ExtractionTypeEnum
        from app.utils.mission_utils import get_certified_developers_for_mission
        
        extraction_service = ExtractionService()
        _, _, p_start, p_end = build_period_window(period)

        for p_id in sorted(list(project_ids)):
            try:
                # 1. Recalculer les snapshots KPIs
                self.generate_monthly_snapshots(
                    project_id=p_id,
                    year=period.year,
                    month=period.month
                )

                # 2. [SENIOR] Synchroniser les lots pour refléter la certification (Source of Truth)
                # On cherche le lot mensuel pour ce projet/période
                lot = self.db.query(ExtractionLot).filter(
                    ExtractionLot.project_id == p_id,
                    ExtractionLot.period_id == period_id,
                    ExtractionLot.extraction_type == ExtractionTypeEnum.MONTHLY
                ).first()
                
                if lot:
                    # Re-définir la cohorte éligible certifiée
                    eligible_ids = get_certified_developers_for_mission(
                        db=self.db, project_id=p_id, period_id=period_id,
                        start_date=p_start.date(), end_date=p_end.date()
                    )
                    
                    # Déclencher la certification stricte (Purifie le Lot)
                    extraction_service._certify_lot_commits(self.db, lot, lot.project, eligible_ids, p_start, p_end)
                    extraction_service._certify_lot_mrs(self.db, lot, lot.project, eligible_ids, p_start, p_end)
                    
            except Exception as e:
                logger.error(f"Failed to recalculate project {p_id} for period {period_id}: {str(e)}")

        self.db.commit()
        logger.info(f"RECALCULATE_PERIOD_DONE | period_id={period_id}")

    def recalculate_developer_history(self, developer_id: int, changed_fields: List[str] = None):
        """
        [SENIOR++++] Recalcul ciblé de l'historique suite à une modification de profil.
        Recalcule les snapshots individuels ET les agrégats des sites impactés.
        """
        logger.info(f"RECALCULATE_DEV_HISTORY | dev_id={developer_id} | changes={changed_fields}")
        
        from app.models.period import Period
        import calendar

        # 1. Identifier les périodes où le développeur a une mission (périodique ou continue) ou des snapshots
        periods = self.db.query(Period).all()
        overlapping_periods = set()

        for p in periods:
            p_start = date(p.year, p.month, 1)
            last_d  = calendar.monthrange(p.year, p.month)[1]
            end_p   = date(p.year, p.month, last_d)

            has_mission = self.db.query(DeveloperProject).filter(
                DeveloperProject.developer_id == developer_id,
                or_(
                    DeveloperProject.period_id == p.id,
                    and_(
                        DeveloperProject.period_id.is_(None),
                        or_(DeveloperProject.start_date.is_(None), DeveloperProject.start_date <= end_p),
                        or_(DeveloperProject.end_date.is_(None), DeveloperProject.end_date >= p_start)
                    )
                )
            ).first() is not None

            if has_mission:
                overlapping_periods.add(p.id)
        
        snapshot_periods = {
            r[0] for r in self.db.query(KpiSnapshot.period_id)
            .filter(KpiSnapshot.developer_id == developer_id)
            .all()
        }
        
        target_period_ids = sorted(list(overlapping_periods | snapshot_periods), reverse=True)
        
        if not target_period_ids:
            logger.info(f"No historical periods found for dev {developer_id}. Skipping recalculation.")
            return

        for p_id in target_period_ids:
            period = self.period_repo.get_by_id(self.db, p_id)
            if not period: continue
            
            p_start = date(period.year, period.month, 1)
            last_d  = calendar.monthrange(period.year, period.month)[1]
            end_p   = date(period.year, period.month, last_d)

            # Identifier les projets concernés pour ce dev sur cette période
            project_ids = {
                r[0] for r in self.db.query(DeveloperProject.project_id)
                .filter(
                    DeveloperProject.developer_id == developer_id,
                    or_(
                        DeveloperProject.period_id == p_id,
                        and_(
                            DeveloperProject.period_id.is_(None),
                            or_(DeveloperProject.start_date.is_(None), DeveloperProject.start_date <= end_p),
                            or_(DeveloperProject.end_date.is_(None), DeveloperProject.end_date >= p_start)
                        )
                    )
                )
                .all()
            }
            
            # Fallback sur les snapshots existants
            snap_projects = {
                r[0] for r in self.db.query(KpiSnapshot.project_id)
                .filter(KpiSnapshot.developer_id == developer_id, KpiSnapshot.period_id == p_id)
                .all()
            }
            project_ids.update(snap_projects)

            for prj_id in project_ids:
                try:
                    # On relance le calcul complet du projet pour cette période
                    # Cela mettra à jour le dev, mais AUSSI le site (très important !)
                    self.generate_monthly_snapshots(
                        project_id=prj_id,
                        year=period.year,
                        month=period.month
                    )
                except Exception as e:
                    logger.error(f"Error recalculating dev {developer_id} history for period {p_id} project {prj_id}: {e}")

        self.db.commit()
        logger.info(f"RECALCULATE_DEV_HISTORY_DONE | dev_id={developer_id}")

    # =========================================================================
    # HELPERS PRIVÉS
    # =========================================================================

    def _get_project_site_ids(self, project_id: int, period_id: int) -> List[int]:
        """
        Résolution des sites officiellement rattachés au projet.
        Utilise la table ProjectSite (M2M) comme référence absolue pour l'affichage.
        """
        from app.models.project_site import ProjectSite

        # 1. Priorité absolue : Configuration Admin (ProjectSite)
        site_ids = (
            self.db.query(ProjectSite.site_id)
            .filter(ProjectSite.project_id == project_id)
            .all()
        )
        if site_ids:
            return [row[0] for row in site_ids]

        # 2. Fallback historique (pour compatibilité avec les anciens projets non configurés)
        fallback_ids = (
            self.db.query(DeveloperSite.site_id)
            .join(DeveloperProject, DeveloperSite.developer_id == DeveloperProject.developer_id)
            .filter(DeveloperProject.project_id == project_id)
            .filter(DeveloperProject.is_active.is_(True))
            .distinct()
            .all()
        )
        return [row[0] for row in fallback_ids]

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
            .filter(DeveloperProject.is_active.is_(True))
            .distinct()
            .all()
        )
        return [row[0] for row in group_ids]

    def _get_primary_site_for_developer(self, developer_id: int, period_date: Optional[date] = None) -> Optional[int]:
        """
         Récupère le site primaire d'un développeur via DeveloperSite (M2M).
        Respecte la validité temporelle (SCD Type 2) si period_date est fournie.
        """
        query = self.db.query(DeveloperSite.site_id).filter(
            DeveloperSite.developer_id == developer_id,
            DeveloperSite.is_primary.is_(True)
        )
        
        if period_date:
            #  Filtrage temporel strict
            query = query.filter(
                DeveloperSite.start_date <= period_date,
                (DeveloperSite.end_date >= period_date) | (DeveloperSite.is_active.is_(True))
            )
        
        row = query.first()
        if row:
            return row.site_id
            
        # Fallback ultra-résilient (si aucune date ou aucun match strict)
        row = self.db.query(DeveloperSite.site_id).filter(
            DeveloperSite.developer_id == developer_id,
            DeveloperSite.is_primary.is_(True)
        ).order_by(DeveloperSite.is_active.desc(), DeveloperSite.start_date.desc()).first()
        
        return row.site_id if row else None

    def _get_primary_group_for_developer(self, developer_id: int, period_date: Optional[date] = None) -> Optional[int]:
        """
         Résolution intelligente du groupe d'un développeur à un instant T.
        Respecte la validité temporelle (SCD Type 2) si period_date est fournie.
        """
        from app.models.developer_group import DeveloperGroupLink
        
        query = self.db.query(DeveloperGroupLink.group_id).filter(
            DeveloperGroupLink.developer_id == developer_id,
            DeveloperGroupLink.is_primary.is_(True)
        )
        
        if period_date:
            #  Filtrage temporel strict
            query = query.filter(
                DeveloperGroupLink.start_date <= period_date,
                (DeveloperGroupLink.end_date >= period_date) | (DeveloperGroupLink.is_active.is_(True))
            )
        
        row = query.first()
        if row:
            return row.group_id
            
        # Fallback ultra-résilient
        row = self.db.query(DeveloperGroupLink.group_id).filter(
            DeveloperGroupLink.developer_id == developer_id,
            DeveloperGroupLink.is_primary.is_(True)
        ).order_by(DeveloperGroupLink.is_active.desc(), DeveloperGroupLink.start_date.desc()).first()
        
        return row.group_id if row else None

    def _prune_stale_developer_snapshots(self, project_id: int, period_id: int, eligible_dev_ids: List[int]):
        """
         Nettoyage des snapshots individuels incohérents.
        Si un développeur a changé de site, ses anciens snapshots individuels pour
        cette période/projet doivent être supprimés pour éviter de fausser les agrégats.
        Aussi, supprime les snapshots des développeurs désactivés ou non éligibles.
        """
        if not eligible_dev_ids:
            deleted_count = self.db.query(KpiSnapshot).filter(
                KpiSnapshot.project_id == project_id,
                KpiSnapshot.period_id == period_id,
                KpiSnapshot.developer_id.isnot(None)
            ).delete(synchronize_session=False)
            if deleted_count > 0:
                logger.info(f"[AUTO-PRUNE] Removed all {deleted_count} developer snapshots for project_id={project_id} period_id={period_id} (No eligible devs)")
            self.db.flush()
            return

        # Supprimer les snapshots des développeurs qui ne sont plus éligibles (ex: désactivés, RH status changé)
        deleted_count = self.db.query(KpiSnapshot).filter(
            KpiSnapshot.project_id == project_id,
            KpiSnapshot.period_id == period_id,
            KpiSnapshot.developer_id.isnot(None),
            ~KpiSnapshot.developer_id.in_(eligible_dev_ids)
        ).delete(synchronize_session=False)
        if deleted_count > 0:
            logger.info(f"[AUTO-PRUNE] Removed {deleted_count} snapshots for non-eligible developers in project_id={project_id} period_id={period_id}")

        # Résolution de la date de la période pour le filtrage
        period = self.period_repo.get_by_id(self.db, period_id)
        period_date = date(period.year, period.month, 1) if period else None

        for dev_id in eligible_dev_ids:
            current_site_id = self._get_primary_site_for_developer(dev_id, period_date=period_date)
            current_group_id = self._get_primary_group_for_developer(dev_id, period_date=period_date)
            
            # Supprimer tout snapshot pour ce dev/projet/période qui n'est pas cohérent (Site ou Groupe obsolète)
            q = self.db.query(KpiSnapshot).filter(
                KpiSnapshot.project_id == project_id,
                KpiSnapshot.period_id == period_id,
                KpiSnapshot.developer_id == dev_id
            )
            
            conditions = []

            # Condition Site — NULL-safe: NULL != value retourne NULL en SQL, pas TRUE.
            # On utilise `or_(col != val, col IS NULL)` pour capturer les orphelins.
            if current_site_id is not None:
                conditions.append(
                    or_(KpiSnapshot.site_id != current_site_id,
                        KpiSnapshot.site_id.is_(None))
                )
            else:
                conditions.append(KpiSnapshot.site_id.isnot(None))

            # Condition Groupe — même fix NULL-safe
            if current_group_id is not None:
                conditions.append(
                    or_(KpiSnapshot.group_id != current_group_id,
                        KpiSnapshot.group_id.is_(None))
                )
            else:
                conditions.append(KpiSnapshot.group_id.isnot(None))

            # Si l'une des dimensions ne matche plus, on supprime
            q = q.filter(or_(*conditions))
                
            deleted_count = q.delete(synchronize_session=False)
            if deleted_count > 0:
                logger.info(f"[AUTO-PRUNE] Removed {deleted_count} stale snapshots for dev_id={dev_id} (Site/Group change)")
        
        self.db.flush()

    # =========================================================================
    # AUTO-HEALING & RECONCILIATION (SENIOR++++)
    # =========================================================================

    def _reconcile_orphaned_data(self, project_id: int, start_date: datetime, end_date: datetime, period_id: int):
        """
         DEEP RECONCILIATION ENGINE
        Détecte et corrige les anomalies de données avant le calcul des KPIs.
        1. Identifie les commits/MRs sans liens (Orphelins).
        2. Résout l'identité via Fuzzy Matching contre la mission RH.
        3. Ancre les données au lot de référence.
        """
        from app.models.commit import Commit
        from app.models.extraction_lot import ExtractionLot, ExtractionStatusEnum
        from app.models.merge_request import MergeRequest
        from app.models.developer import Developer
        from app.models.developer_project import DeveloperProject
        from app.services.extraction.developer_identity import resolve_developer_id_fuzzy

        # 1. Identifier le lot de référence (le dernier lot réussi pour ce projet/période)
        ref_lot = self.db.query(ExtractionLot).filter(
            ExtractionLot.project_id == project_id,
            ExtractionLot.period_id == period_id,
            ExtractionLot.status == ExtractionStatusEnum.completed
        ).order_by(ExtractionLot.id.desc()).first()

        if not ref_lot:
            return

        # 2. Charger la liste des développeurs certifiés (Source RH)
        from app.utils.mission_utils import get_certified_developers_for_mission
        eligible_ids = get_certified_developers_for_mission(
            db=self.db, project_id=project_id, period_id=period_id,
            start_date=start_date.date(), end_date=end_date.date()
        )
        if not eligible_ids:
            return

        mission_devs = self.db.query(Developer).filter(Developer.id.in_(eligible_ids)).all()

        # 3. Réconciliation des Commits
        orphans = self.db.query(Commit).filter(
            Commit.project_id == project_id,
            Commit.authored_date >= start_date,
            Commit.authored_date <  end_date,
            (Commit.extraction_lot_id.is_(None) | Commit.developer_id.is_(None))
        ).all()

        if orphans:
            count = 0
            for c in orphans:
                matched_id = resolve_developer_id_fuzzy(self.db, c.author_email, c.author_name, mission_devs)
                if matched_id:
                    c.developer_id = matched_id
                    c.extraction_lot_id = ref_lot.id
                    count += 1
            logger.info(f"[AUTO-HEAL] Reconciled {count}/{len(orphans)} orphan commits for lot={ref_lot.id}")

        # 4. Réconciliation des MRs
        orphan_mrs = self.db.query(MergeRequest).filter(
            MergeRequest.project_id == project_id,
            MergeRequest.created_at_gitlab >= start_date,
            MergeRequest.created_at_gitlab <  end_date,
            (MergeRequest.extraction_lot_id.is_(None) | MergeRequest.developer_id.is_(None))
        ).all()

        if orphan_mrs:
            count_mr = 0
            for mr in orphan_mrs:
                #  MergeRequest doesn't have author_email, use None for fuzzy matching
                matched_id = resolve_developer_id_fuzzy(self.db, None, mr.author_name, mission_devs)
                if matched_id:
                    mr.developer_id = matched_id
                    mr.extraction_lot_id = ref_lot.id
                    count_mr += 1
            logger.info(f"[AUTO-HEAL] Reconciled {count_mr}/{len(orphan_mrs)} orphan MRs for lot={ref_lot.id}")

        self.db.flush()

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