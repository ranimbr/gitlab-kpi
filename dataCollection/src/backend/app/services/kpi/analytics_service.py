"""
services/kpi/analytics_service.py

"""
import logging
from datetime import date, datetime
from typing import Dict, List, Optional

from sqlalchemy import func, distinct
from sqlalchemy.orm import Session

from app.models.developer import Developer
from app.models.developer_project import DeveloperProject
from app.models.developer_site import DeveloperSite
from app.models.kpi_snapshot import KpiSnapshot
from app.models.commit import Commit
from app.models.merge_request import MergeRequest
from app.models.comment import Comment
from app.repositories.developer_repository import DeveloperRepository
from app.repositories.kpi_snapshot_repository import KpiSnapshotRepository
from app.repositories.period_repository import PeriodRepository

logger = logging.getLogger(__name__)

_MOIS_FR = {
    1: "Janvier", 2: "Février",  3: "Mars",     4: "Avril",
    5: "Mai",     6: "Juin",     7: "Juillet",  8: "Août",
    9: "Septembre", 10: "Octobre", 11: "Novembre", 12: "Décembre",
}


class AnalyticsService:

    def __init__(self, db: Session):
        self.db            = db
        self.snapshot_repo = KpiSnapshotRepository()
        self.dev_repo      = DeveloperRepository()
        self.period_repo   = PeriodRepository()

    def _get_project_site_ids(self, project_id: int) -> List[int]:
        """IDs de tous les sites rattachés à ce projet via ProjectSite (M2M)."""
        from app.models.project_site import ProjectSite
        return [
            row.site_id
            for row in self.db.query(ProjectSite.site_id)
            .filter(ProjectSite.project_id == project_id)
            .all()
        ]

    def get_latest_kpis(self, project_id, site_id=None, group_id=None, developer_id=None, lot_id=None, period_id=None):
        if lot_id:
            return self._calculate_virtual_snapshot_for_lot(
                project_id, lot_id, site_id, group_id, developer_id
            )
        
        if period_id:
            return self.snapshot_repo.get_by_project_period_site(
                self.db, project_id, period_id, site_id=site_id, group_id=group_id, developer_id=developer_id
            )

        return self.snapshot_repo.get_latest(
            self.db, project_id, site_id=site_id, group_id=group_id, developer_id=developer_id
        )

    def get_kpi_history(
        self, project_id, site_id=None, group_id=None, developer_id=None,
        start_date=None, end_date=None,
    ) -> List[KpiSnapshot]:
        return self.snapshot_repo.get_project_history(
            db=self.db, project_id=project_id, site_id=site_id,
            group_id=group_id, developer_id=developer_id,
            start_date=start_date, end_date=end_date,
        )

    def get_dashboard_summary(
        self,
        project_id:   Optional[int] = None,
        site_id:      Optional[int] = None,
        group_id:     Optional[int] = None,
        developer_id: Optional[int] = None,
        lot_id:       Optional[int] = None,
        period_id:    Optional[int] = None,
    ) -> Dict:
        """
        Génère le résumé complet pour le dashboard :
        - KPIs les plus récents (ou d'une période précise)
        - Historique pour les graphiques
        """
        if lot_id:
            # Mode Senior : Isolation par lot d'extraction (Session-First)
            latest = self._calculate_virtual_snapshot_for_lot(
                project_id, lot_id, site_id, group_id, developer_id
            )
            history = []
            period_label = f"Session #{lot_id}"
        elif project_id is None:
            # ✅ NOUVEAU : Mode Senior Global (Tous les projets)
            # On aggrège les KPIs par période
            logger.info(f"Dashboard Summary: Aggregating global data (period_id={period_id}, site_id={site_id}, developer_id={developer_id})")
            latest = self._get_aggregated_global_snapshot(period_id, site_id, developer_id=developer_id)
            history = self._get_global_history(site_id, developer_id=developer_id)
            logger.info(f"Dashboard Summary: Aggregated global data success. History count: {len(history)}")
            period_label = "Tous les projets"
            if period_id and latest:
                period_label += f" — {latest.period_label if hasattr(latest, 'period_label') else ''}"
        else:
            # Mode Classique (Projet spécifique)
            if period_id:
                latest = self.snapshot_repo.get_by_project_period_site(
                    self.db, project_id, period_id, site_id, group_id, developer_id
                )
            else:
                latest = self.get_latest_kpis(project_id, site_id, group_id, developer_id)
            
            history = self.get_kpi_history(project_id, site_id, group_id, developer_id)
            
            # ✅ [SENIOR] Dynamic Headcount & Velocity Recalculation
            # Permet de refléter les changements d'organisation (site/groupe) sans ré-extraction.
            if latest and not developer_id:
                pid = latest.period_id if hasattr(latest, 'period_id') else period_id
                if pid:
                    nb_devs = self.dev_repo.count_active_for_period(
                        self.db, project_id, pid, site_id, group_id
                    )
                    latest.nb_developers = nb_devs
                    
                    # Recalcul des ratios de vitesse (Commits/Dev, MRs/Dev)
                    if nb_devs > 0:
                        latest.commit_rate_per_site = round(float(latest.total_commits or 0) / nb_devs, 2)
                        latest.mr_rate_per_site = round(float(latest.total_mrs_created or 0) / nb_devs, 2)
                    else:
                        latest.commit_rate_per_site = 0.0
                        latest.mr_rate_per_site = 0.0

            period_label = None
            if latest and latest.snapshot_date:
                mois         = _MOIS_FR.get(latest.snapshot_date.month, "")
                period_label  = f"{mois} {latest.snapshot_date.year}"

        return {
            "latest_metrics":  latest,
            "history":         history,
            "total_snapshots": len(history),
            "project_id":      project_id,
            "site_id":         site_id,
            "group_id":        group_id,
            "developer_id":    developer_id,
            "period_label":    period_label,
        }

    def _get_aggregated_global_snapshot(self, period_id: Optional[int] = None, site_id: Optional[int] = None, developer_id: Optional[int] = None) -> Optional[KpiSnapshot]:
        """Aggrège les snapshots de tous les projets pour une période donnée."""
        
        # 1. Identifier la période si non fournie (dernière période avec snapshots)
        if not period_id:
            last_period = (
                self.db.query(KpiSnapshot.period_id)
                .order_by(KpiSnapshot.snapshot_date.desc())
                .first()
            )
            if not last_period: return None
            period_id = last_period[0]

        # 1b. [SENIOR] Calcul Dynamique du Headcount (Virtualization Layer)
        # On ne se base plus sur les liens statiques mais sur le moteur SCD Type 2
        nb_devs_total = self.dev_repo.count_active_for_period(
            self.db, project_id=None, period_id=period_id, site_id=site_id
        )

        # 2. Aggréger les snapshots de niveau 'Project' (dev_id=NULL, group_id=NULL)
        # On fait la moyenne des taux et la somme des volumes
        q = self.db.query(
            func.avg(KpiSnapshot.mr_rate_per_site).label("mr_rate"),
            func.avg(KpiSnapshot.approved_mr_rate).label("approved_rate"),
            func.avg(KpiSnapshot.merged_mr_rate).label("merged_rate"),
            func.avg(KpiSnapshot.commit_rate_per_site).label("commit_rate"),
            func.sum(KpiSnapshot.total_commits).label("total_commits"),
            func.sum(KpiSnapshot.total_mrs_created).label("total_mrs"),
            func.sum(KpiSnapshot.total_mrs_approved).label("total_mrs_approved"),
            func.sum(KpiSnapshot.total_mrs_merged).label("total_mrs_merged"),
            func.sum(KpiSnapshot.total_comments).label("total_comments"),
            func.sum(KpiSnapshot.total_reviews).label("total_reviews"),
            func.sum(KpiSnapshot.total_mrs_draft).label("total_mrs_draft"),
            func.avg(KpiSnapshot.avg_review_time_hours).label("avg_review"),
            func.sum(KpiSnapshot.review_time_hours).label("total_review_time"),
            func.avg(KpiSnapshot.developer_score).label("developer_score"),
        ).filter(
            KpiSnapshot.period_id == period_id,
            KpiSnapshot.group_id.is_(None)
        )
        
        if developer_id:
            q = q.filter(KpiSnapshot.developer_id == developer_id)
            if site_id: q = q.filter(KpiSnapshot.site_id == site_id)
        else:
            q = q.filter(KpiSnapshot.developer_id.is_(None))
            if site_id:
                q = q.filter(KpiSnapshot.site_id == site_id)
            else:
                q = q.filter(KpiSnapshot.site_id.is_(None))

        stats = q.one_or_none()
        if not stats or stats.total_commits is None: return None

        # Créer un snapshot virtuel
        # ✅ [SENIOR] Dynamic Velocity Calculation
        # On recalcule les ratios globaux basés sur le headcount virtuel
        c_rate = round(float(stats.total_commits or 0) / nb_devs_total, 2) if nb_devs_total > 0 else 0.0
        m_rate = round(float(stats.total_mrs or 0) / nb_devs_total, 2) if nb_devs_total > 0 else 0.0

        snap = KpiSnapshot(
            project_id=0, site_id=site_id, period_id=period_id,
            mr_rate_per_site       = m_rate,
            approved_mr_rate       = round(float(stats.approved_rate or 0), 4),
            merged_mr_rate         = round(float(stats.merged_rate or 0), 4),
            commit_rate_per_site   = c_rate,
            nb_commits_per_project = int(stats.total_commits or 0),
            total_commits          = int(stats.total_commits or 0),
            total_mrs_created      = int(stats.total_mrs or 0),
            total_mrs_approved     = int(stats.total_mrs_approved or 0),
            total_mrs_merged       = int(stats.total_mrs_merged or 0),
            total_comments         = int(stats.total_comments or 0),
            total_reviews          = int(stats.total_reviews or 0),
            total_mrs_draft        = int(stats.total_mrs_draft or 0),
            avg_review_time_hours  = round(float(stats.avg_review or 0), 1),
            review_time_hours      = float(stats.total_review_time or 0),
            developer_score        = float(stats.developer_score or 0) if developer_id else None,
            nb_developers          = nb_devs_total, 
            
            # ✅ AJOUT : Initialiser les métriques Enterprise pour éviter validation fail (None -> int)
            bus_factor             = 0,
            sprint_velocity        = 0.0,
            code_churn_rate        = 0.0,
            
            snapshot_date          = date.today()
        )
        logger.info(f"Global Aggregation for period {period_id}: commits={snap.total_commits}, mrs={snap.total_mrs_created}")
        return snap

    def _get_global_history(self, site_id: Optional[int] = None, developer_id: Optional[int] = None) -> List[KpiSnapshot]:
        """Historique aggrégé de tous les projets par période."""
        if developer_id:
            # Pour un développeur, on récupère les IDs de périodes où il a des snapshots (peu importe le projet)
            period_ids = self.db.query(KpiSnapshot.period_id).filter(KpiSnapshot.developer_id == developer_id).distinct().all()
        else:
            q = self.db.query(KpiSnapshot.period_id).filter(KpiSnapshot.project_id.is_(None))
            if site_id:
                q = q.filter(KpiSnapshot.site_id == site_id, KpiSnapshot.developer_id.is_(None))
            else:
                q = q.filter(KpiSnapshot.site_id.is_(None), KpiSnapshot.developer_id.is_(None))
            period_ids = q.distinct().all()
        
        history = []
        for (pid,) in period_ids:
            snap = self._get_aggregated_global_snapshot(pid, site_id, developer_id=developer_id)
            if snap:
                # Ajouter le label de période manuellement pour le frontend
                period = self.period_repo.get_by_id(self.db, pid)
                if period:
                    snap.period_label = f"{_MOIS_FR.get(period.month, '')} {period.year}"
                history.append(snap)
        return history

    def get_developer_kpi_summary(
        self,
        developer_id: int,
        project_id:   int,
        period_id:    Optional[int] = None,
        lot_id:       Optional[int] = None,
    ) -> Dict:
        """
        ✅ AJOUT : vue KPI individuelle pour la page profil développeur.
        ✅ [FIX] Support period_id pour données historiques
        """
        developer = self.dev_repo.get_by_id(self.db, developer_id)
        if not developer:
            return {}
        
        if lot_id:
            snapshot = self._calculate_virtual_snapshot_for_lot(
                project_id, lot_id, developer_id=developer_id, site_id=None, group_id=None
            )
        else:
            # Dernier snapshot individuel
            if project_id is None:
                snapshot = (
                    self.db.query(KpiSnapshot)
                    .filter(KpiSnapshot.developer_id == developer_id)
                )
                # ✅ [FIX] Filtrer par period_id si spécifié
                if period_id:
                    snapshot = snapshot.filter(KpiSnapshot.period_id == period_id)
                snapshot = snapshot.order_by(KpiSnapshot.snapshot_date.desc()).first()
            else:
                snapshot = self.snapshot_repo.get_latest(
                    self.db, project_id, developer_id=developer_id, period_id=period_id
                )

        # Site primaire du développeur
        primary_site = (
            self.db.query(DeveloperSite)
            .filter(DeveloperSite.developer_id == developer_id, DeveloperSite.is_primary.is_(True))
            .first()
        )

        period_label = None
        if snapshot and snapshot.snapshot_date:
            mois         = _MOIS_FR.get(snapshot.snapshot_date.month, "")
            period_label = f"{mois} {snapshot.snapshot_date.year}"

        return {
            "developer_id":       developer_id,
            "developer_name":     developer.name,
            "gitlab_username":    developer.gitlab_username,
            "avatar_url":         developer.avatar_url,
            "primary_site_id":    primary_site.site_id if primary_site else None,
            "snapshot":           snapshot,
            "period_label":       period_label or "—",
            "developer_score":    snapshot.developer_score      if snapshot else None,
            "score_rank_in_site": snapshot.score_rank_in_site   if snapshot else None,
            "last_active_at":     developer.last_active_at,
            "is_active_this_month": snapshot is not None and snapshot.total_commits > 0,
        }

    def get_leaderboard(
        self,
        project_id: Optional[int],
        period_id:  int,
        site_id:    Optional[int] = None,
        group_id:   Optional[int] = None,
        limit:      int           = 20,
        lot_id:     Optional[int] = None,
    ) -> Dict:
        """
        ✅ AJOUT : support lot_id pour l'isolation par session.
        """
        if lot_id:
            return self._calculate_dynamic_leaderboard_for_lot(
                project_id, lot_id, site_id, group_id, limit
            )

        # ✅ NOUVEAU [SENIOR] : Support de la vue Globale (Tous les projets)
        # Si project_id est None, on agrège les stats de chaque développeur
        if project_id is None:
            return self._get_global_developer_leaderboard(
                period_id=period_id, site_id=site_id, group_id=group_id, limit=limit
            )

        snapshots = self.snapshot_repo.get_developers_ranking(
            db=self.db, project_id=project_id, period_id=period_id,
            kpi_field="developer_score", site_id=site_id, group_id=group_id, limit=limit,
        )

        period = self.period_repo.get_by_id(self.db, period_id)
        period_label = "—"
        if period:
            mois         = _MOIS_FR.get(period.month, "")
            period_label = f"{mois} {period.year}"

        # ✅ [SENIOR] FIX 3 : Batch fetch developers
        dev_ids = [snap.developer_id for snap in snapshots if snap.developer_id]
        from app.models.developer import Developer
        devs = self.db.query(Developer).filter(Developer.id.in_(dev_ids)).all()
        dev_map = {d.id: d for d in devs}

        entries = []
        for rank, snap in enumerate(snapshots, start=1):
            dev = dev_map.get(snap.developer_id)
            # Compute approved_rate as a ratio (0-1) for the frontend
            approved_rate = None
            if snap.total_mrs_created and snap.total_mrs_created > 0:
                approved_rate = snap.total_mrs_approved / snap.total_mrs_created
            entries.append({
                "rank":                  rank,
                "developer_id":          snap.developer_id,
                "developer_name":        dev.name             if dev else "—",
                "gitlab_username":       dev.gitlab_username  if dev else None,
                "avatar_url":            dev.avatar_url       if dev else None,
                "commit_count":          snap.total_commits,
                "total_commits":         snap.total_commits, # Alias pour compatibilité frontend
                "mr_count":              snap.total_mrs_created,
                "total_mrs_created":     snap.total_mrs_created, # Alias pour compatibilité frontend
                "approved_mr_count":     snap.total_mrs_approved,
                "approved_rate":         approved_rate,
                "approved_mr_rate":      approved_rate, # Alias pour compatibilité frontend
                "avg_review_time_hours": snap.avg_review_time_hours,
                "avg_review_hours":      snap.avg_review_time_hours,
                "developer_score":       snap.developer_score,
                "score_delta":           snap.delta_commit_rate,
                "rank_delta":            None,
            })

        return {
            "site_id":      site_id,
            "group_id":     group_id,
            "period_label": period_label,
            "total_devs":   len(entries),
            "entries":      entries,
        }

    def _get_global_developer_leaderboard(
        self,
        period_id: int,
        site_id:   Optional[int] = None,
        group_id:  Optional[int] = None,
        limit:     int           = 50,
    ) -> Dict:
        """
        [SENIOR] Calcule les KPIs agrégés pour chaque développeur sur TOUS les projets.
        Utile pour le tracking "Dev-Centric" demandé par le management.
        """
        from sqlalchemy import func
        from app.models.developer import Developer
        
        # 1. Requête d'agrégation groupée par développeur
        q = self.db.query(
            KpiSnapshot.developer_id,
            func.sum(KpiSnapshot.total_commits).label("total_commits"),
            func.sum(KpiSnapshot.total_mrs_created).label("total_mrs"),
            func.sum(KpiSnapshot.total_mrs_approved).label("total_mrs_approved"),
            func.avg(KpiSnapshot.avg_review_time_hours).label("avg_review"),
            func.avg(KpiSnapshot.developer_score).label("avg_score"),
        ).filter(
            KpiSnapshot.period_id == period_id,
            KpiSnapshot.developer_id.isnot(None),
            KpiSnapshot.project_id != 0 # On ignore les snapshots virtuels globaux
        )
        
        if site_id:
            q = q.filter(KpiSnapshot.site_id == site_id)
        if group_id:
            q = q.filter(KpiSnapshot.group_id == group_id)
            
        # Tri par score moyen (performance globale)
        q = q.group_by(KpiSnapshot.developer_id).order_by(func.avg(KpiSnapshot.developer_score).desc()).limit(limit)
        
        rows = q.all()
        
        period = self.period_repo.get_by_id(self.db, period_id)
        period_label = f"{_MOIS_FR.get(period.month, '')} {period.year}" if period else "—"
        
        # ✅ [SENIOR] FIX 3 : Batch fetch developers
        dev_ids = [r.developer_id for r in rows if r.developer_id]
        from app.models.developer import Developer
        devs = self.db.query(Developer).filter(Developer.id.in_(dev_ids)).all()
        dev_map = {d.id: d for d in devs}

        entries = []
        for rank, r in enumerate(rows, start=1):
            dev = dev_map.get(r.developer_id)
            if not dev: continue
            
            approved_rate = None
            if r.total_mrs and r.total_mrs > 0:
                approved_rate = r.total_mrs_approved / r.total_mrs
                
            entries.append({
                "rank":                  rank,
                "developer_id":          r.developer_id,
                "developer_name":        dev.name,
                "gitlab_username":       dev.gitlab_username,
                "avatar_url":            dev.avatar_url,
                "commit_count":          int(r.total_commits or 0),
                "total_commits":         int(r.total_commits or 0),
                "mr_count":              int(r.total_mrs or 0),
                "total_mrs_created":     int(r.total_mrs or 0),
                "approved_mr_count":     int(r.total_mrs_approved or 0),
                "approved_rate":         approved_rate,
                "approved_mr_rate":      approved_rate,
                "avg_review_hours":      round(float(r.avg_review or 0), 1),
                "developer_score":       round(float(r.avg_score or 0), 4),
                "score_delta":           None, 
                "rank_delta":            None,
            })
            
        return {
            "site_id":      site_id,
            "group_id":     group_id,
            "period_label": f"Global — {period_label}",
            "total_devs":   len(entries),
            "entries":      entries,
        }

    def get_developer_insights(
        self,
        developer_id: int,
        project_id:   int,
        period_id:    Optional[int] = None,
    ) -> Dict:
        """
        ✅ NOUVEAU (Phase 3) : Génère des analyses comparatives (Insights) pour le manager.
        Compare les KPIs du développeur avec la moyenne du site.
        """
        # 1. Récupérer le snapshot individuel
        # Correction [SENIOR] : project_id=None (global) -> project_id=0 dans la DB
        p_id = 0 if project_id is None else project_id
        
        q = self.db.query(KpiSnapshot).filter(
            KpiSnapshot.project_id   == p_id,
            KpiSnapshot.developer_id == developer_id
        )
        if period_id:
            q = q.filter(KpiSnapshot.period_id == period_id)
        
        dev_snap = q.order_by(KpiSnapshot.snapshot_date.desc()).first()

        if not dev_snap:
            return {"error": "Aucune donnée KPI trouvée pour ce développeur."}

        # 2. Récupérer le snapshot moyen du site correspondant pour la même période
        site_snap = self.snapshot_repo.get_by_project_period_site(
            self.db, p_id, dev_snap.period_id, site_id=dev_snap.site_id
        )

        insights = []
        strengths = []
        weaknesses = []

        if site_snap:
            # Comparaison MR Rate
            diff_mr = dev_snap.mr_rate_per_site - site_snap.mr_rate_per_site
            if diff_mr > 0.5:
                strengths.append(f"Vélocité supérieure à la moyenne du site (+{diff_mr:.1f} MR/mois)")
            elif diff_mr < -0.5:
                weaknesses.append(f"Volume de livraison inférieur à la moyenne du site ({diff_mr:.1f} MR/mois)")

            # Comparaison Qualité (Approbation)
            diff_app = (dev_snap.approved_mr_rate - site_snap.approved_mr_rate) * 100
            if diff_app > 10:
                strengths.append(f"Excellente qualité de code ({diff_app:+.0f}% d'approbation vs site)")
            elif diff_app < -15:
                weaknesses.append(f"Taux de rejet des MR supérieur à la moyenne ({diff_app:.0f}% vs site)")

            # Comparaison Temps de Revue
            diff_rev = dev_snap.avg_review_time_hours - site_snap.avg_review_time_hours
            if diff_rev < -5:
                strengths.append(f"Réactivité exemplaire dans les revues (plus rapide de {abs(diff_rev):.1f}h)")
            elif diff_rev > 10:
                weaknesses.append(f"Goulot d'étranglement potentiel : temps de revue élevé ({diff_rev:+.1f}h vs site)")

        # Synthèse textuelle simple pour le manager
        summary = "Profil équilibré"
        if len(strengths) > len(weaknesses):
            summary = "Élément moteur de la squad"
        elif len(weaknesses) > len(strengths):
            summary = "Accompagnement senior recommandé"

        return {
            "developer_snap": dev_snap,
            "site_average":   site_snap,
            "insights":       {
                "strengths":  strengths,
                "weaknesses": weaknesses,
                "summary":    summary
            },
            "period_label": f"{_MOIS_FR.get(dev_snap.snapshot_date.month, '')} {dev_snap.snapshot_date.year}"
        }

    def get_site_comparison_for_lot(self, project_id: int, lot_id: int, kpi_field: str = "mr_rate_per_site") -> List[KpiSnapshot]:
        """
        Calcule une comparaison inter-sites en temps réel pour un lot d'extraction spécifique.
        Essentiel pour la page Analyse KPI en mode session.
        """
        from sqlalchemy import distinct
        from app.models.site import Site

        from app.models.developer_site import DeveloperSite
        from app.models.developer import Developer
        
        # 1. Identifier les sites ayant eu une activité dans ce lot (via les développeurs)
        site_ids = (
            self.db.query(distinct(DeveloperSite.site_id))
            .join(Developer, Developer.id == DeveloperSite.developer_id)
            .join(Commit, Commit.developer_id == Developer.id)
            .filter(Commit.project_id == project_id, Commit.extraction_lot_id == lot_id)
            .all()
        )
        site_ids = [r[0] for r in site_ids]

        # Compléter avec les sites présents via les MRs (via les développeurs)
        mr_site_ids = (
            self.db.query(distinct(DeveloperSite.site_id))
            .join(Developer, Developer.id == DeveloperSite.developer_id)
            .join(MergeRequest, MergeRequest.developer_id == Developer.id)
            .filter(MergeRequest.project_id == project_id, MergeRequest.extraction_lot_id == lot_id)
            .all()
        )
        for r in mr_site_ids:
            if r[0] not in site_ids:
                site_ids.append(r[0])

        # 2. Pre-fetch Site names [SENIOR]
        from app.models.site import Site
        sites_objs = self.db.query(Site).filter(Site.id.in_(site_ids)).all()
        site_map = {s.id: s.name for s in sites_objs}

        # 3. Calculer un snapshot virtuel pour chaque site
        results = []
        for sid in site_ids:
            snap = self._calculate_virtual_snapshot_for_lot(
                project_id, lot_id, site_id=sid, group_id=None, developer_id=None
            )
            if snap:
                snap.site_name = site_map.get(sid) or f"Site {sid}"
                results.append(snap)

        # 3. Tri par le KPI demandé (facultatif, le router le fait aussi)
        results.sort(key=lambda x: getattr(x, kpi_field, 0), reverse=True)
        return results

    def get_site_comparison_global(self, period_id: int, kpi_field: str = "total_commits", site_id: Optional[int] = None) -> List[KpiSnapshot]:
        """
         NOUVEAU [SENIOR] : Agrégation inter-projets par site.
        Calcule la performance de chaque site sur TOUS les projets pour une période donnée.
        Permet la "Vision Globale" réelle demandée par le management.
        Si site_id est fourni, retourne uniquement les données pour ce site.
        """
        from app.models.site import Site
        
        # Validation [SENIOR]
        allowed_fields = {
            "mr_rate_per_site", "approved_mr_rate", "merged_mr_rate",
            "commit_rate_per_site", "nb_commits_per_project", "total_commits", "avg_review_time_hours",
        }
        if kpi_field not in allowed_fields:
            raise ValueError(f"kpi_field '{kpi_field}' non autorisé.")

        # 1. Aggréger les volumes et moyennes
        q = self.db.query(
            KpiSnapshot.site_id,
            func.sum(KpiSnapshot.total_commits).label("total_commits"),
            func.sum(KpiSnapshot.total_mrs_created).label("total_mrs"),
            func.sum(KpiSnapshot.total_mrs_approved).label("total_mrs_approved"),
            func.sum(KpiSnapshot.total_mrs_merged).label("total_mrs_merged"),
            func.avg(KpiSnapshot.mr_rate_per_site).label("avg_mr_rate"),
            func.avg(KpiSnapshot.approved_mr_rate).label("avg_approved_rate"),
            func.avg(KpiSnapshot.merged_mr_rate).label("avg_merged_rate"),
            func.avg(KpiSnapshot.avg_review_time_hours).label("avg_review_time"),
            # func.sum(KpiSnapshot.nb_developers).label("total_devs"), # Remplacé par calcul unique
            func.sum(KpiSnapshot.total_reviews).label("total_reviews"),
            func.sum(KpiSnapshot.total_comments).label("total_comments"),
        ).filter(
            KpiSnapshot.period_id == period_id,
            KpiSnapshot.project_id != 0,
            KpiSnapshot.site_id.isnot(None),
            KpiSnapshot.developer_id.is_(None),
            KpiSnapshot.group_id.is_(None)
        )
        
        # Filter by site_id if provided
        if site_id is not None:
            q = q.filter(KpiSnapshot.site_id == site_id)
        
        q = q.group_by(KpiSnapshot.site_id)

        rows = q.all()
        
        # 2. Récupérer les comptes uniques de développeurs par site pour cette période
        # (On ne peut pas faire ça simplement dans le même GROUP BY sans join complexe)
        from app.models.period import Period
        period = self.db.query(Period).filter(Period.id == period_id).first()
        if not period:
            return []
            
        start_date = datetime(period.year, period.month, 1)
        if period.month == 12:
            end_date = datetime(period.year + 1, 1, 1)
        else:
            end_date = datetime(period.year, period.month + 1, 1)

        # 2. Récupérer les comptes uniques de développeurs par site pour cette période (EN UNE SEULE REQUÊTE)
        site_dev_counts_rows = (
            self.db.query(DeveloperSite.site_id, func.count(distinct(Developer.id)))
            .join(Developer, DeveloperSite.developer_id == Developer.id)
            .join(DeveloperProject, DeveloperProject.developer_id == Developer.id)
            .filter(
                # Filtre Site : période d'affectation au site chevauche le mois
                DeveloperSite.start_date < end_date,
                (DeveloperSite.end_date >= start_date) | (DeveloperSite.is_active == True),
                # Filtre Projet : mission active durant le mois
                DeveloperProject.start_date < end_date,
                (DeveloperProject.end_date >= start_date) | (DeveloperProject.is_active == True)
            )
            .group_by(DeveloperSite.site_id)
            .all()
        )
        site_dev_counts = {sid: cnt for sid, cnt in site_dev_counts_rows}

        # ✅ [SENIOR] FIX 3 : Batch fetch sites
        from app.models.site import Site
        site_ids_needed = [r.site_id for r in rows if r.site_id]
        sites_objs = self.db.query(Site).filter(Site.id.in_(site_ids_needed)).all()
        site_map = {s.id: s for s in sites_objs}

        results = []
        for r in rows:
            site_obj = site_map.get(r.site_id)
            nb_devs = site_dev_counts.get(r.site_id, 0)
            snap = KpiSnapshot(
                project_id=0,
                site_id=r.site_id,
                period_id=period_id,
                total_commits=int(r.total_commits or 0),
                nb_commits_per_project=int(r.total_commits or 0),
                total_mrs_created=int(r.total_mrs or 0),
                total_mrs_approved=int(r.total_mrs_approved or 0),
                total_mrs_merged=int(r.total_mrs_merged or 0),
                mr_rate_per_site=round(float(r.avg_mr_rate or 0), 2),
                approved_mr_rate=round(float(r.avg_approved_rate or 0), 4),
                merged_mr_rate=round(float(r.avg_merged_rate or 0), 4),
                avg_review_time_hours=round(float(r.avg_review_time or 0), 1),
                nb_developers=nb_devs,
                total_reviews=int(r.total_reviews or 0),
                total_comments=int(r.total_comments or 0),
                total_mrs_draft=0,
                review_time_hours=round(float(r.avg_review_time or 0) * int(r.total_mrs_approved or 0), 1),
                bus_factor=0,
                sprint_velocity=0.0,
                code_churn_rate=0.0,
                commit_rate_per_site=round(float(r.total_commits or 0) / float(nb_devs) if nb_devs and nb_devs > 0 else 0, 2),
                snapshot_date=date.today()
            )
            snap.site_name = site_obj.name if site_obj else f"Site {r.site_id}"
            results.append(snap)

        # Tri par le KPI demandé
        results.sort(key=lambda x: getattr(x, kpi_field, 0), reverse=True)
        return results

    def _calculate_virtual_snapshot_for_lot(
        self, project_id: int, lot_id: int, 
        site_id: Optional[int], group_id: Optional[int], developer_id: Optional[int]
    ) -> Optional[KpiSnapshot]:
        """
        Calcule les KPIs en temps réel pour un lot d'extraction spécifique.
        C'est l'approche "Senior" pour l'isolation des données demandée.
        """
        # ✅ [ENTERPRISE PARITY] — Définition Unifiée d'un "Commit Libre" (4 critères)
        # IDENTIQUE à commit_repository.py, extraction_lots.py et kpi_calculator.py
        filters_comm = [
            Commit.is_merge_commit.is_(False),
            func.lower(Commit.title).notlike("merge branch %"),
            func.lower(Commit.title).notlike("merge pull request %"),
            func.lower(Commit.title).notlike("merge %"),
        ]
        filters_mr   = [
            MergeRequest.is_draft.is_(False)
        ]
        
        if project_id:
            filters_comm.append(Commit.project_id == project_id)
            filters_mr.append(MergeRequest.project_id == project_id)

        if lot_id:
            filters_comm.append(Commit.extraction_lot_id == lot_id)
            filters_mr.append(MergeRequest.extraction_lot_id == lot_id)
        
        if developer_id:
            filters_comm.append(Commit.developer_id == developer_id)
            filters_mr.append(MergeRequest.developer_id == developer_id)
            
        if site_id:
            filters_comm.append(Commit.site_id == site_id)
            filters_mr.append(MergeRequest.site_id == site_id)
            
        if group_id:
            filters_comm.append(Commit.group_id == group_id)
            filters_mr.append(MergeRequest.group_id == group_id)
            
        # 1. Total Commits (STRICT MISSION FILTER)
        total_commits = (
            self.db.query(func.count(Commit.id))
            .join(Developer, Commit.developer_id == Developer.id)
            .join(
                DeveloperProject,
                (DeveloperProject.developer_id == Commit.developer_id) &
                (DeveloperProject.project_id   == Commit.project_id) &
                (DeveloperProject.is_active    == True)
            )
            .filter(*filters_comm)
            .filter(Developer.is_bot.is_(False))
            .scalar() or 0
        )
        
        # 2. Total MRs (STRICT MISSION FILTER)
        total_mrs = (
            self.db.query(func.count(MergeRequest.id))
            .join(Developer, MergeRequest.developer_id == Developer.id)
            .join(
                DeveloperProject,
                (DeveloperProject.developer_id == MergeRequest.developer_id) &
                (DeveloperProject.project_id   == MergeRequest.project_id) &
                (DeveloperProject.is_active    == True)
            )
            .filter(*filters_mr)
            .filter(Developer.is_validated.is_(True), Developer.is_bot.is_(False))
            .scalar() or 0
        )
        
        # 3. Approved MRs (STRICT MISSION FILTER)
        approved_mrs = (
            self.db.query(func.count(MergeRequest.id))
            .join(Developer, MergeRequest.developer_id == Developer.id)
            .join(
                DeveloperProject,
                (DeveloperProject.developer_id == MergeRequest.developer_id) &
                (DeveloperProject.project_id   == MergeRequest.project_id) &
                (DeveloperProject.is_active    == True)
            )
            .filter(*filters_mr, MergeRequest.approved == True)
            .filter(Developer.is_validated.is_(True), Developer.is_bot.is_(False))
            .scalar() or 0
        )
        
        # 4. Merged MRs (STRICT MISSION FILTER)
        merged_mrs = (
            self.db.query(func.count(MergeRequest.id))
            .join(Developer, MergeRequest.developer_id == Developer.id)
            .join(
                DeveloperProject,
                (DeveloperProject.developer_id == MergeRequest.developer_id) &
                (DeveloperProject.project_id   == MergeRequest.project_id) &
                (DeveloperProject.is_active    == True)
            )
            .filter(*filters_mr, MergeRequest.state == "merged")
            .filter(Developer.is_validated.is_(True), Developer.is_bot.is_(False))
            .scalar() or 0
        )
        
        # 5. Review Time (STRICT MISSION FILTER)
        avg_review = (
            self.db.query(func.avg(MergeRequest.review_time_hours))
            .join(Developer, MergeRequest.developer_id == Developer.id)
            .join(
                DeveloperProject,
                (DeveloperProject.developer_id == MergeRequest.developer_id) &
                (DeveloperProject.project_id   == MergeRequest.project_id) &
                (DeveloperProject.is_active    == True)
            )
            .filter(*filters_mr, MergeRequest.approved == True)
            .filter(Developer.is_validated.is_(True), Developer.is_bot.is_(False))
            .scalar() or 0.0
        )
        
        # 6. NB Developers (Basé sur les auteurs certifiés ayant contribué)
        nb_devs = (
            self.db.query(func.count(distinct(Commit.developer_id)))
            .join(Developer, Commit.developer_id == Developer.id)
            .join(
                DeveloperProject,
                (DeveloperProject.developer_id == Commit.developer_id) &
                (DeveloperProject.project_id   == Commit.project_id) &
                (DeveloperProject.is_active    == True)
            )
            .filter(*filters_comm)
            .filter(Developer.is_validated.is_(True), Developer.is_bot.is_(False))
            .scalar() or 0
        )
        
        # Ratios
        approved_rate = round(approved_mrs / total_mrs, 4) if total_mrs > 0 else 0.0
        merged_rate   = round(merged_mrs / approved_mrs, 4) if approved_mrs > 0 else 0.0
        mr_rate       = round(total_mrs / nb_devs, 2) if nb_devs > 0 else 0.0
        
        # ✅ Score SENIOR normalisé (0.0 -> 1.0)
        # On utilise les mêmes poids que KpiCalculator
        commit_rate_score = min(float(total_commits) / 10.0, 1.0)
        mr_rate_score     = min(float(total_mrs)     / 5.0,  1.0)
        # On recalcule l'approved_rate sans arrondis pour le score
        a_rate_raw        = float(approved_mrs) / float(total_mrs) if total_mrs > 0 else 0.0
        review_score      = 1.0 / (1.0 + float(avg_review or 0) / 24.0)

        dev_score = (
            0.25 * commit_rate_score +
            0.25 * mr_rate_score     +
            0.30 * min(a_rate_raw, 1.0) +
            0.20 * review_score
        )

        snapshot = KpiSnapshot(
            project_id=project_id,
            lot_id=lot_id,
            site_id=site_id,
            group_id=group_id,
            developer_id=developer_id,
            total_commits=total_commits,
            total_mrs_created=total_mrs,
            total_mrs_approved=approved_mrs,
            total_mrs_merged=merged_mrs,
            approved_mr_rate=approved_rate,
            merged_mr_rate=merged_rate,
            mr_rate_per_site=mr_rate,
            avg_review_time_hours=round(float(avg_review), 1) if avg_review else 0.0,
            nb_developers=nb_devs,
            developer_score=round(float(dev_score), 4),
            snapshot_date=date.today()
        )
        return snapshot

    def _calculate_dynamic_leaderboard_for_lot(
        self, project_id: int, lot_id: int,
        site_id: Optional[int], group_id: Optional[int], limit: int
    ) -> Dict:
        """
        Calcul dynamique du leaderboard pour un lot d'extraction.
        Permet une isolation parfaite des performances par session.
        """
        from sqlalchemy import func
        from app.models.developer import Developer
        
        # 1. Aggréger les stats par développeur pour ce lot
        # Note: On simplifie en se basant sur les commits et MRs
        # ✅ [ENTERPRISE PARITY] — Définition Unifiée d'un "Commit Libre" (4 critères)
        q_comm = self.db.query(
                Commit.developer_id,
                func.count(Commit.id).label("commit_count"),
                func.sum(Commit.total_changes).label("total_changes")
            ).filter(
                Commit.is_merge_commit.is_(False),
                func.lower(Commit.title).notlike("merge branch %"),
                func.lower(Commit.title).notlike("merge pull request %"),
                func.lower(Commit.title).notlike("merge %"),
            )
        
        if project_id:
            q_comm = q_comm.filter(Commit.project_id == project_id)
        if lot_id:
            q_comm = q_comm.filter(Commit.extraction_lot_id == lot_id)
            
        query = q_comm.group_by(Commit.developer_id).subquery()
        
        q_mr = self.db.query(
                MergeRequest.developer_id,
                func.count(MergeRequest.id).label("mr_count"),
                func.count(func.nullif(MergeRequest.approved, False)).label("approved_count"),
                func.avg(MergeRequest.review_time_hours).label("avg_review")
            ).filter(MergeRequest.is_draft.is_(False))
            
        if project_id:
            q_mr = q_mr.filter(MergeRequest.project_id == project_id)
        if lot_id:
            q_mr = q_mr.filter(MergeRequest.extraction_lot_id == lot_id)

        mr_query = q_mr.group_by(MergeRequest.developer_id).subquery()
        
        # Jointure pour obtenir le classement (AVEC CERTIFICATION DE MISSION)
        results = (
            self.db.query(Developer, query.c.commit_count, mr_query.c.mr_count, mr_query.c.approved_count, mr_query.c.avg_review)
            .join(
                DeveloperProject,
                (DeveloperProject.developer_id == Developer.id) &
                (DeveloperProject.project_id   == project_id) &
                (DeveloperProject.is_active    == True)
            )
            .outerjoin(query, Developer.id == query.c.developer_id)
            .outerjoin(mr_query, Developer.id == mr_query.c.developer_id)
            .filter(
                Developer.is_active == True,
                Developer.is_bot == False
            )
            .filter((query.c.commit_count > 0) | (mr_query.c.mr_count > 0))
            .order_by((func.coalesce(query.c.commit_count, 0) + func.coalesce(mr_query.c.mr_count, 0) * 2).desc())
            .limit(limit)
            .all()
        )
        
        entries = []
        for rank, (dev, commit_count, mr_count, approved_count, avg_review) in enumerate(results, start=1):
            commit_count = commit_count or 0
            mr_count = mr_count or 0
            approved_count = approved_count or 0
            # ✅ Calcul du Score SENIOR Normalisé (0.0 -> 1.0)
            c_score = min(float(commit_count) / 10.0, 1.0)
            m_score = min(float(mr_count)     / 5.0,  1.0)
            a_rate  = (approved_count / mr_count) if mr_count > 0 else 0.0
            r_score = 1.0 / (1.0 + float(avg_review or 0) / 24.0)
            
            d_score = (0.25 * c_score) + (0.25 * m_score) + (0.30 * min(a_rate, 1.0)) + (0.20 * r_score)

            entries.append({
                "rank":                  rank,
                "developer_id":          dev.id,
                "developer_name":        dev.name,
                "gitlab_username":       dev.gitlab_username,
                "avatar_url":            dev.avatar_url,
                "commit_count":          commit_count,
                "mr_count":              mr_count,
                "approved_mr_count":     approved_count,
                "approved_rate":         a_rate,
                "avg_review_time_hours": round(float(avg_review or 0), 1),
                "avg_review_hours":      round(float(avg_review or 0), 1),
                "developer_score":       round(float(d_score), 4),
                "score_delta":           None,
                "rank_delta":            None,
            })
            
        return {
            "site_id":      site_id,
            "group_id":     group_id,
            "period_label": f"Session #{lot_id}",
            "total_devs":   len(entries),
            "entries":      entries,
        }

    def get_comparative_trends(
        self,
        project_id: Optional[int],
        site_ids:   Optional[List[int]] = None,
        group_ids:  Optional[List[int]] = None,
        start_date: Optional[date]      = None,
        end_date:   Optional[date]      = None,
    ) -> List[Dict]:
        """
        [SENIOR] Récupère les tendances historiques pour plusieurs entités (Sites ou Groupes).
        Permet la comparaison multi-courbes demandée par le management.
        Si project_id est None, retourne les données de tous les projets.
        """
        from app.models.site import Site
        from app.models.developer_group import DeveloperGroup
        from app.models.project import Project

        # Si project_id est None (tous les projets), on ne filtre pas par project_id
        if project_id is None:
            query = self.db.query(KpiSnapshot)
        else:
            query = self.db.query(KpiSnapshot).filter(KpiSnapshot.project_id == project_id)

        # Filtre sur les entités (On compare soit des sites, soit des groupes)
        if site_ids:
            query = query.filter(KpiSnapshot.site_id.in_(site_ids), KpiSnapshot.group_id.is_(None), KpiSnapshot.developer_id.is_(None))
        elif group_ids:
            query = query.filter(KpiSnapshot.group_id.in_(group_ids), KpiSnapshot.developer_id.is_(None))
        else:
            # Par défaut, tous les sites associés au projet (ou tous les sites si project_id est None)
            if project_id is not None:
                project_site_ids = self._get_project_site_ids(project_id)
                query = query.filter(KpiSnapshot.site_id.in_(project_site_ids), KpiSnapshot.group_id.is_(None), KpiSnapshot.developer_id.is_(None))
            else:
                # Pour tous les projets, on prend tous les sites sans filtre
                query = query.filter(KpiSnapshot.group_id.is_(None), KpiSnapshot.developer_id.is_(None))

        if start_date:
            query = query.filter(KpiSnapshot.snapshot_date >= start_date)
        if end_date:
            query = query.filter(KpiSnapshot.snapshot_date <= end_date)

        snapshots = query.order_by(KpiSnapshot.snapshot_date.asc()).all()

        # Mapper pour labels
        sites_map  = {s.id: s.name for s in self.db.query(Site).all()}
        groups_map = {g.id: g.name for g in self.db.query(DeveloperGroup).all()}

        results = []
        for s in snapshots:
            label = sites_map.get(s.site_id) if s.site_id else (groups_map.get(s.group_id) if s.group_id else "Global")
            
            # ✅ [SENIOR] Dynamic Headcount Virtualization Engine
            # On ignore le chiffre statique de la base et on recalcule le réel "Point-in-Time"
            nb_devs = self.dev_repo.count_active_for_period(
                self.db, project_id, s.period_id, s.site_id, s.group_id
            )
            
            # Recalcul des ratios de vitesse
            dyn_velocity = round(float(s.total_commits or 0) / nb_devs, 2) if nb_devs > 0 else 0.0
            dyn_mr_rate  = round(float(s.total_mrs_created or 0) / nb_devs, 2) if nb_devs > 0 else 0.0

            results.append({
                "period_id":     s.period_id,
                "snapshot_date": s.snapshot_date.isoformat(),
                "period_label":  f"{_MOIS_FR.get(s.snapshot_date.month, '')} {s.snapshot_date.year}",
                "entity_id":     s.site_id or s.group_id or 0,
                "entity_name":   label,
                "metrics": {
                    "velocity":      dyn_velocity,
                    "mr_rate":       dyn_mr_rate,
                    "quality_score": s.approved_mr_rate,
                    "merged_rate":   s.merged_mr_rate,
                    "review_time":   s.avg_review_time_hours,
                    "total_commits": s.total_commits,
                    "total_mrs":     s.total_mrs_created,
                    "nb_developers": nb_devs,
                }
            })
        return results

    # ✅ [REMOVED] get_project_diagnostic_metrics - Non fonctionnelle
    # def get_project_diagnostic_metrics(
    #     self,
    #     project_id: int,
    #     period_id: Optional[int] = None,
    #     site_id: Optional[int] = None,
    #     group_id: Optional[int] = None,
    # ) -> Dict:
    #     """
    #     Calculates diagnostic analytics for a project:
    #     1. Correlation between Merge Request size (additions, deletions, total_changes)
    #        and review time / comment count.
    #     2. Congestion/load metrics per reviewer.
    #     """
    #     from sqlalchemy import or_, func
    #     from app.models.developer import Developer
    #     from app.models.developer_site import DeveloperSite
    #     from app.models.developer_group import DeveloperGroupLink
    #     from app.models.merge_request import MergeRequest
    #     from app.models.comment import Comment
    #
    #     # Get period if provided
    #     period = None
    #     if period_id:
    #         period = self.period_repo.get_by_id(self.db, period_id)
    #         if not period:
    #             return {
    #                 "mr_size_vs_review": [],
    #                 "reviewer_load": []
    #             }
    #
    #     # ── 1. Query for MR Size vs Review Time ──
    #     q_mr = self.db.query(
    #         MergeRequest.id.label("mr_id"),
    #         MergeRequest.title.label("title"),
    #         MergeRequest.additions.label("additions"),
    #         MergeRequest.deletions.label("deletions"),
    #         MergeRequest.total_changes.label("total_changes"),
    #         MergeRequest.review_time_hours.label("review_time_hours"),
    #         MergeRequest.user_notes_count.label("user_notes_count"),
    #         MergeRequest.reviewer_id.label("reviewer_id"),
    #         Developer.name.label("author_name")
    #     ).outerjoin(Developer, MergeRequest.developer_id == Developer.id)
    #
    #     # Get certified developers for this project/period (Mission-Strict)
    #     from app.utils.mission_utils import get_certified_developers_for_mission
    #     certified_ids = get_certified_developers_for_mission(
    #         db=self.db,
    #         project_id=project_id,
    #         period_id=period_id,
    #     )
    #
    #     q_mr = q_mr.filter(MergeRequest.project_id == project_id)
    #     q_mr = q_mr.filter(MergeRequest.is_draft.is_(False))
    #     # Filter out bot actions
    #     q_mr = q_mr.filter(or_(Developer.is_bot.is_(False), Developer.is_bot.is_(None)))
    #     q_mr = q_mr.filter(MergeRequest.developer_id.in_(certified_ids))
    #
    #     if period:
    #         q_mr = q_mr.filter(
    #             MergeRequest.created_at_gitlab >= period.start_date,
    #             MergeRequest.created_at_gitlab <= period.end_date
    #         )
    #
    #     if site_id:
    #         q_mr = q_mr.join(
    #             DeveloperSite,
    #             DeveloperSite.developer_id == MergeRequest.developer_id
    #         ).filter(DeveloperSite.site_id == site_id)
    #         if period:
    #             q_mr = q_mr.filter(
    #                 DeveloperSite.start_date <= func.date(MergeRequest.created_at_gitlab),
    #                 or_(
    #                     DeveloperSite.end_date.is_(None),
    #                     DeveloperSite.end_date >= func.date(MergeRequest.created_at_gitlab)
    #                 )
    #             )
    #         else:
    #             q_mr = q_mr.filter(DeveloperSite.is_active.is_(True))
    #
    #     if group_id:
    #         q_mr = q_mr.join(
    #             DeveloperGroupLink,
    #             DeveloperGroupLink.developer_id == MergeRequest.developer_id
    #         ).filter(DeveloperGroupLink.group_id == group_id)
    #         if period:
    #             q_mr = q_mr.filter(
    #                 DeveloperGroupLink.start_date <= func.date(MergeRequest.created_at_gitlab),
    #                 or_(
    #                     DeveloperGroupLink.end_date.is_(None),
    #                     DeveloperGroupLink.end_date >= func.date(MergeRequest.created_at_gitlab)
    #                 )
    #             )
    #         else:
    #             q_mr = q_mr.filter(DeveloperGroupLink.is_active.is_(True))
    #
    #     mrs_data = q_mr.all()
    #     mr_size_review_correlation_list = []
    #     total_changes_sum = 0
    #     review_time_sum = 0
    #     mrs_count = len(mrs_data)
    #
    #     for row in mrs_data:
    #         total_chg = row.total_changes if row.total_changes else ((row.additions or 0) + (row.deletions or 0))
    #         rev_time = float(row.review_time_hours) if row.review_time_hours is not None else 0.0
    #         total_changes_sum += total_chg
    #         review_time_sum += rev_time
    #
    #         item = {
    #             "mr_id": row.mr_id,
    #             "title": row.title,
    #             "additions": row.additions or 0,
    #             "deletions": row.deletions or 0,
    #             "total_changes": total_chg,
    #             "lines_changed": total_chg,
    #             "review_time_hours": round(rev_time, 2),
    #             "user_notes_count": row.user_notes_count or 0,
    #             "author_name": row.author_name or "Unknown",
    #             "reviewer_count": 1 if row.reviewer_id else 0
    #         }
    #         mr_size_review_correlation_list.append(item)
    #
    #     # ── 2. Query for Reviewer Load / Congestion ──
    #     q_rev = self.db.query(
    #         MergeRequest.reviewer_id.label("reviewer_id"),
    #         Developer.name.label("reviewer_name"),
    #         func.count(MergeRequest.id).label("mr_count"),
    #         func.avg(MergeRequest.review_time_hours).label("avg_review_time_hours")
    #     ).join(Developer, MergeRequest.reviewer_id == Developer.id)
    #
    #     q_rev = q_rev.filter(MergeRequest.project_id == project_id)
    #     q_rev = q_rev.filter(MergeRequest.is_draft.is_(False))
    #     q_rev = q_rev.filter(MergeRequest.reviewer_id.isnot(None))
    #     q_rev = q_rev.filter(Developer.is_bot.is_(False))
    #     q_rev = q_rev.filter(MergeRequest.developer_id.in_(certified_ids))
    #     q_rev = q_rev.filter(MergeRequest.reviewer_id.in_(certified_ids))
    #
    #     if period:
    #         q_rev = q_rev.filter(
    #             MergeRequest.created_at_gitlab >= period.start_date,
    #             MergeRequest.created_at_gitlab <= period.end_date
    #         )
    #
    #     if site_id:
    #         q_rev = q_rev.join(
    #             DeveloperSite,
    #             DeveloperSite.developer_id == MergeRequest.reviewer_id
    #         ).filter(DeveloperSite.site_id == site_id)
    #         if period:
    #             q_rev = q_rev.filter(
    #                 DeveloperSite.start_date <= func.date(MergeRequest.created_at_gitlab),
    #                 or_(
    #                     DeveloperSite.end_date.is_(None),
    #                     DeveloperSite.end_date >= func.date(MergeRequest.created_at_gitlab)
    #                 )
    #             )
    #         else:
    #             q_rev = q_rev.filter(DeveloperSite.is_active.is_(True))
    #
    #     if group_id:
    #         q_rev = q_rev.join(
    #             DeveloperGroupLink,
    #             DeveloperGroupLink.developer_id == MergeRequest.reviewer_id
    #         ).filter(DeveloperGroupLink.group_id == group_id)
    #         if period:
    #             q_rev = q_rev.filter(
    #                 DeveloperGroupLink.start_date <= func.date(MergeRequest.created_at_gitlab),
    #                 or_(
    #                     DeveloperGroupLink.end_date.is_(None),
    #                     DeveloperGroupLink.end_date >= func.date(MergeRequest.created_at_gitlab)
    #                 )
    #             )
    #         else:
    #             q_rev = q_rev.filter(DeveloperGroupLink.is_active.is_(True))
    #
    #     reviewer_stats = q_rev.group_by(MergeRequest.reviewer_id, Developer.name).all()
    #
    #     # Query comments count per reviewer for the matching project & period/site/group
    #     q_comments = self.db.query(
    #         Comment.developer_id.label("developer_id"),
    #         func.count(Comment.id).label("comment_count")
    #     ).join(MergeRequest, Comment.merge_request_id == MergeRequest.id)
    #
    #     q_comments = q_comments.filter(MergeRequest.project_id == project_id)
    #     q_comments = q_comments.filter(MergeRequest.is_draft.is_(False))
    #     q_comments = q_comments.filter(MergeRequest.developer_id.in_(certified_ids))
    #     q_comments = q_comments.filter(Comment.developer_id.in_(certified_ids))
    #
    #     if period:
    #         q_comments = q_comments.filter(
    #             MergeRequest.created_at_gitlab >= period.start_date,
    #             MergeRequest.created_at_gitlab <= period.end_date
    #         )
    #
    #     if site_id:
    #         q_comments = q_comments.join(
    #             DeveloperSite,
    #             DeveloperSite.developer_id == Comment.developer_id
    #         ).filter(DeveloperSite.site_id == site_id)
    #         if period:
    #             q_comments = q_comments.filter(
    #                 DeveloperSite.start_date <= func.date(MergeRequest.created_at_gitlab),
    #                 or_(
    #                     DeveloperSite.end_date.is_(None),
    #                     DeveloperSite.end_date >= func.date(MergeRequest.created_at_gitlab)
    #                 )
    #             )
    #         else:
    #             q_comments = q_comments.filter(DeveloperSite.is_active.is_(True))
    #
    #     if group_id:
    #         q_comments = q_comments.join(
    #             DeveloperGroupLink,
    #             DeveloperGroupLink.developer_id == Comment.developer_id
    #         ).filter(DeveloperGroupLink.group_id == group_id)
    #         if period:
    #             q_comments = q_comments.filter(
    #                 DeveloperGroupLink.start_date <= func.date(MergeRequest.created_at_gitlab),
    #                 or_(
    #                     DeveloperGroupLink.end_date.is_(None),
    #                     DeveloperGroupLink.end_date >= func.date(MergeRequest.created_at_gitlab)
    #                 )
    #             )
    #         else:
    #             q_comments = q_comments.filter(DeveloperGroupLink.is_active.is_(True))
    #
    #     comments_stats = q_comments.group_by(Comment.developer_id).all()
    #     comments_map = {r.developer_id: r.comment_count for r in comments_stats}
    #
    #     reviewer_load_list = []
    #     overloaded_count = 0
    #     for row in reviewer_stats:
    #         mr_cnt = row.mr_count or 0
    #         avg_rev = float(row.avg_review_time_hours) if row.avg_review_time_hours is not None else 0.0
    #         congestion_flag = (mr_cnt > 10) or (avg_rev > 48.0)
    #         if congestion_flag:
    #             overloaded_count += 1
    #
    #         reviewer_load_list.append({
    #             "reviewer_id": row.reviewer_id,
    #             "reviewer_name": row.reviewer_name,
    #             "mr_count": mr_cnt,
    #             "review_count": mr_cnt,
    #             "avg_review_time_hours": round(avg_rev, 2),
    #             "avg_response_hours": round(avg_rev, 2),
    #             "total_comments": comments_map.get(row.reviewer_id, 0),
    #             "congestion_flag": congestion_flag
    #         })
    #
    #     avg_lines_changed = (total_changes_sum / mrs_count) if mrs_count > 0 else 0.0
    #     avg_review_time = (review_time_sum / mrs_count) if mrs_count > 0 else 0.0
    #
    #     period_label_val = "Période courante"
    #     if period:
    #         period_label_val = f"{_MOIS_FR.get(period.month, '')} {period.year}"
    #
    #     # ── 3. Query for Developer Lifecycle Movements ──
    #     from datetime import timedelta
    #     p_start = None
    #     p_end = None
    #     if period:
    #         p_start = period.start_date
    #         p_end = period.end_date
    #     else:
    #         # Check movements in the last 90 days from the latest period or today
    #         from app.models.period import Period
    #         latest_period = self.db.query(Period).order_by(Period.year.desc(), Period.month.desc()).first()
    #         if latest_period:
    #             p_end = latest_period.end_date
    #             p_start = p_end - timedelta(days=90)
    #         else:
    #             p_end = date.today()
    #             p_start = p_end - timedelta(days=90)
    #
    #     movements = []
    #     if p_start and p_end:
    #         from app.models.developer_project import DeveloperProject
    #         from app.models.developer import Developer
    #         from app.models.developer_site import DeveloperSite
    #         from app.models.developer_group import DeveloperGroupLink, DeveloperGroup
    #         from app.models.site import Site
    #
    #         # Get all developer project associations for this project
    #         dp_list = self.db.query(DeveloperProject).filter(DeveloperProject.project_id == project_id).all()
    #         dev_ids = [dp.developer_id for dp in dp_list]
    #
    #         if dev_ids:
    #             # Fetch developer names
    #             devs = self.db.query(Developer).filter(Developer.id.in_(dev_ids)).all()
    #             dev_map = {d.id: d.name for d in devs}
    #
    #             # Project arrivals / departures
    #             for dp in dp_list:
    #                 dev_name = dev_map.get(dp.developer_id, f"Dev #{dp.developer_id}")
    #                 start_d = dp.start_date or (dp.joined_at.date() if dp.joined_at else None)
    #                 if start_d and p_start <= start_d <= p_end:
    #                     movements.append({
    #                         "date": start_d.isoformat(),
    #                         "developer_name": dev_name,
    #                         "type": "arrival",
    #                         "description": "A rejoint le projet (Début de mission)."
    #                     })
    #                 if dp.end_date and p_start <= dp.end_date <= p_end:
    #                     movements.append({
    #                         "date": dp.end_date.isoformat(),
    #                         "developer_name": dev_name,
    #                         "type": "departure",
    #                         "description": "A quitté le projet (Fin de mission)."
    #                     })
    #
    #             # Site transfers/assignments
    #             ds_list = self.db.query(DeveloperSite).filter(DeveloperSite.developer_id.in_(dev_ids)).all()
    #             for ds in ds_list:
    #                 if ds.start_date and p_start <= ds.start_date <= p_end:
    #                     dev_name = dev_map.get(ds.developer_id, f"Dev #{ds.developer_id}")
    #                     site_name = self.db.query(Site.name).filter(Site.id == ds.site_id).scalar() or "Inconnu"
    #                     
    #                     # Find if there was a previous site assignment that ended exactly on start_date
    #                     prev_ds = next((other for other in ds_list if other.developer_id == ds.developer_id and other.end_date == ds.start_date), None)
    #                     if prev_ds:
    #                         prev_site_name = self.db.query(Site.name).filter(Site.id == prev_ds.site_id).scalar() or "Inconnu"
    #                         movements.append({
    #                             "date": ds.start_date.isoformat(),
    #                             "developer_name": dev_name,
    #                             "type": "transfer",
    #                             "description": f"Muté(e) du site {prev_site_name} vers {site_name}."
    #                         })
    #                     else:
    #                         # Or if they had any previous site assignment at all
    #                         any_prev = any(other.start_date and other.start_date < ds.start_date for other in ds_list if other.developer_id == ds.developer_id)
    #                         if any_prev:
    #                             movements.append({
    #                                 "date": ds.start_date.isoformat(),
    #                                 "developer_name": dev_name,
    #                                 "type": "transfer",
    #                                 "description": f"Affecté(e) au site {site_name} (changement de site)."
    #                             })
    #                         else:
    #                             movements.append({
    #                                 "date": ds.start_date.isoformat(),
    #                                 "developer_name": dev_name,
    #                                 "type": "site_assignment",
    #                                 "description": f"Affecté(e) au site {site_name}."
    #                             })
    #
    #             # Group/team transfers/assignments
    #             dgl_list = self.db.query(DeveloperGroupLink).filter(DeveloperGroupLink.developer_id.in_(dev_ids)).all()
    #             for dgl in dgl_list:
    #                 if dgl.start_date and p_start <= dgl.start_date <= p_end:
    #                     dev_name = dev_map.get(dgl.developer_id, f"Dev #{dgl.developer_id}")
    #                     grp_name = self.db.query(DeveloperGroup.name).filter(DeveloperGroup.id == dgl.group_id).scalar() or "Inconnu"
    #                     
    #                     prev_dgl = next((other for other in dgl_list if other.developer_id == dgl.developer_id and other.end_date == dgl.start_date), None)
    #                     if prev_dgl:
    #                         prev_grp_name = self.db.query(DeveloperGroup.name).filter(DeveloperGroup.id == prev_dgl.group_id).scalar() or "Inconnu"
    #                         movements.append({
    #                             "date": dgl.start_date.isoformat(),
    #                             "developer_name": dev_name,
    #                             "type": "group_transfer",
    #                             "description": f"Transféré(e) de l'équipe {prev_grp_name} vers {grp_name}."
    #                         })
    #                     else:
    #                         any_prev = any(other.start_date and other.start_date < dgl.start_date for other in dgl_list if other.developer_id == dgl.developer_id)
    #                         if any_prev:
    #                             movements.append({
    #                                 "date": dgl.start_date.isoformat(),
    #                                 "developer_name": dev_name,
    #                                 "type": "group_transfer",
    #                                 "description": f"Affecté(e) à l'équipe {grp_name} (changement d'équipe)."
    #                             })
    #                         else:
    #                             movements.append({
    #                                 "date": dgl.start_date.isoformat(),
    #                                 "developer_name": dev_name,
    #                                 "type": "group_assignment",
    #                                 "description": f"Affecté(e) à l'équipe {grp_name}."
    #                             })
    #
    #     # Sort movements descending
    #     movements.sort(key=lambda x: x["date"], reverse=True)
    #
    #     return {
    #         "project_id": project_id,
    #         "period_label": period_label_val,
    #         "mr_size_vs_review": mr_size_review_correlation_list,
    #         "mr_size_review_correlation": mr_size_review_correlation_list,
    #         "reviewer_load": reviewer_load_list,
    #         "movements": movements,
    #         "summary": {
    #             "total_mrs_analyzed": mrs_count,
    #             "avg_lines_changed": round(avg_lines_changed, 2),
    #             "avg_review_time_hours": round(avg_review_time, 2),
    #             "overloaded_reviewers": overloaded_count
    #         }
    #     }

