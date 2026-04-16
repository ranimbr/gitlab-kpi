"""
services/kpi/analytics_service.py

CORRECTIONS (modèles mis à jour) :
─────────────────────────────────────
1. get_dashboard_summary() : group_id et developer_id dans le dict.
2. AJOUT get_developer_kpi_summary() : vue KPI individuelle.
3. AJOUT get_leaderboard() : classement des développeurs d'un site.
"""
import logging
from datetime import date
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

    def get_latest_kpis(self, project_id, site_id=None, group_id=None, developer_id=None):
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
        project_id:   int,
        site_id:      Optional[int] = None,
        group_id:     Optional[int] = None,
        developer_id: Optional[int] = None,
        lot_id:       Optional[int] = None,
    ) -> Dict:
        if lot_id:
            # Mode Senior : Isolation par lot d'extraction
            latest = self._calculate_virtual_snapshot_for_lot(
                project_id, lot_id, site_id, group_id, developer_id
            )
            # On ne montre pas l'historique global si on filtre sur un lot spécifique 
            # (car un lot n'appartient qu'à un instant T)
            history = []
            period_label = f"Session #{lot_id}"
        else:
            latest  = self.get_latest_kpis(project_id, site_id, group_id, developer_id)
            history = self.get_kpi_history(project_id, site_id, group_id, developer_id)
            
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

    def get_developer_kpi_summary(
        self,
        developer_id: int,
        project_id:   int,
        period_id:    Optional[int] = None,
    ) -> Dict:
        """
        ✅ AJOUT : vue KPI individuelle pour la page profil développeur.
        """
        developer = self.dev_repo.get_by_id(self.db, developer_id)
        if not developer:
            return {}

        # Dernier snapshot individuel
        snapshot = self.snapshot_repo.get_latest(
            self.db, project_id, developer_id=developer_id
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
        project_id: int,
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

        snapshots = self.snapshot_repo.get_developers_ranking(
            db=self.db, project_id=project_id, period_id=period_id,
            kpi_field="developer_score", site_id=site_id, group_id=group_id, limit=limit,
        )

        period = self.period_repo.get_by_id(self.db, period_id)
        period_label = "—"
        if period:
            mois         = _MOIS_FR.get(period.month, "")
            period_label = f"{mois} {period.year}"

        entries = []
        for rank, snap in enumerate(snapshots, start=1):
            dev = self.dev_repo.get_by_id(self.db, snap.developer_id) if snap.developer_id else None
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
                "mr_count":              snap.total_mrs_created,
                "approved_mr_count":     snap.total_mrs_approved,
                "approved_rate":         approved_rate,
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
        # On ne filtre PAS par site_id=None ici car un snapshot individuel 
        # est souvent lié à un site spécifique.
        q = self.db.query(KpiSnapshot).filter(
            KpiSnapshot.project_id   == project_id,
            KpiSnapshot.developer_id == developer_id
        )
        if period_id:
            q = q.filter(KpiSnapshot.period_id == period_id)
        
        dev_snap = q.order_by(KpiSnapshot.snapshot_date.desc()).first()

        if not dev_snap:
            return {"error": "Aucune donnée KPI trouvée pour ce développeur."}

        # 2. Récupérer le snapshot moyen du site correspondant pour la même période
        site_snap = self.snapshot_repo.get_by_project_period_site(
            self.db, project_id, dev_snap.period_id, site_id=dev_snap.site_id
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

        # 1. Identifier les sites ayant eu une activité dans ce lot
        site_ids = (
            self.db.query(distinct(Commit.site_id))
            .filter(Commit.project_id == project_id, Commit.extraction_lot_id == lot_id, Commit.site_id.isnot(None))
            .all()
        )
        site_ids = [r[0] for r in site_ids]

        # Compléter avec les sites présents via les MRs (cas rare de MR sans commit dans le lot)
        mr_site_ids = (
            self.db.query(distinct(MergeRequest.site_id))
            .filter(MergeRequest.project_id == project_id, MergeRequest.extraction_lot_id == lot_id, MergeRequest.site_id.isnot(None))
            .all()
        )
        for r in mr_site_ids:
            if r[0] not in site_ids:
                site_ids.append(r[0])

        # 2. Calculer un snapshot virtuel pour chaque site
        results = []
        for sid in site_ids:
            snap = self._calculate_virtual_snapshot_for_lot(
                project_id, lot_id, site_id=sid, group_id=None, developer_id=None
            )
            if snap:
                site_obj = self.db.query(Site).filter(Site.id == sid).first()
                snap.site_name = site_obj.name if site_obj else f"Site {sid}"
                results.append(snap)

        # 3. Tri par le KPI demandé (facultatif, le router le fait aussi)
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
        # Filtres de base
        filters_comm = [
            Commit.project_id == project_id, 
            Commit.extraction_lot_id == lot_id,
            Commit.is_merge_commit.is_(False)
        ]
        filters_mr   = [
            MergeRequest.project_id == project_id, 
            MergeRequest.extraction_lot_id == lot_id,
            MergeRequest.is_draft.is_(False)
        ]
        
        if developer_id:
            filters_comm.append(Commit.developer_id == developer_id)
            filters_mr.append(MergeRequest.developer_id == developer_id)
            
        if site_id:
            filters_comm.append(Commit.site_id == site_id)
            filters_mr.append(MergeRequest.site_id == site_id)
            
        if group_id:
            filters_comm.append(Commit.group_id == group_id)
            filters_mr.append(MergeRequest.group_id == group_id)
            
        # 1. Total Commits
        total_commits = self.db.query(func.count(Commit.id)).filter(*filters_comm).scalar() or 0
        
        # 2. Total MRs
        total_mrs = self.db.query(func.count(MergeRequest.id)).filter(*filters_mr).scalar() or 0
        
        # 3. Approved MRs
        approved_mrs = self.db.query(func.count(MergeRequest.id)).filter(
            *filters_mr, MergeRequest.approved == True
        ).scalar() or 0
        
        # 4. Merged MRs
        merged_mrs = self.db.query(func.count(MergeRequest.id)).filter(
            *filters_mr, MergeRequest.state == "merged"
        ).scalar() or 0
        
        # 5. Review Time
        avg_review = self.db.query(func.avg(MergeRequest.review_time_hours)).filter(
            *filters_mr, MergeRequest.approved == True
        ).scalar() or 0.0
        
        # 6. NB Developers (Basé sur les auteurs de commits dans ce lot)
        nb_devs = self.db.query(func.count(distinct(Commit.developer_id))).filter(*filters_comm).scalar() or 0
        
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
        query = (
            self.db.query(
                Commit.developer_id,
                func.count(Commit.id).label("commit_count"),
                func.sum(Commit.total_changes).label("total_changes")
            )
            .filter(
                Commit.project_id == project_id, 
                Commit.extraction_lot_id == lot_id,
                Commit.is_merge_commit.is_(False)
            )
            .group_by(Commit.developer_id)
        ).subquery()
        
        mr_query = (
            self.db.query(
                MergeRequest.developer_id,
                func.count(MergeRequest.id).label("mr_count"),
                func.count(func.nullif(MergeRequest.approved, False)).label("approved_count"),
                func.avg(MergeRequest.review_time_hours).label("avg_review")
            )
            .filter(
                MergeRequest.project_id == project_id, 
                MergeRequest.extraction_lot_id == lot_id,
                MergeRequest.is_draft.is_(False)
            )
            .group_by(MergeRequest.developer_id)
        ).subquery()
        
        # Jointure pour obtenir le classement
        results = (
            self.db.query(Developer, query.c.commit_count, mr_query.c.mr_count, mr_query.c.approved_count, mr_query.c.avg_review)
            .outerjoin(query, Developer.id == query.c.developer_id)
            .outerjoin(mr_query, Developer.id == mr_query.c.developer_id)
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
        project_id: int,
        site_ids:   Optional[List[int]] = None,
        group_ids:  Optional[List[int]] = None,
        start_date: Optional[date]      = None,
        end_date:   Optional[date]      = None,
    ) -> List[Dict]:
        """
        [SENIOR] Récupère les tendances historiques pour plusieurs entités (Sites ou Groupes).
        Permet la comparaison multi-courbes demandée par le management.
        """
        from app.models.site import Site
        from app.models.developer_group import DeveloperGroup

        query = self.db.query(KpiSnapshot).filter(KpiSnapshot.project_id == project_id)

        # Filtre sur les entités (On compare soit des sites, soit des groupes)
        if site_ids:
            query = query.filter(KpiSnapshot.site_id.in_(site_ids), KpiSnapshot.group_id.is_(None), KpiSnapshot.developer_id.is_(None))
        elif group_ids:
            query = query.filter(KpiSnapshot.group_id.in_(group_ids), KpiSnapshot.developer_id.is_(None))
        else:
            # Par défaut, tous les sites associés au projet
            project_site_ids = self._get_project_site_ids(project_id)
            query = query.filter(KpiSnapshot.site_id.in_(project_site_ids), KpiSnapshot.group_id.is_(None), KpiSnapshot.developer_id.is_(None))

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
            results.append({
                "period_id":     s.period_id,
                "snapshot_date": s.snapshot_date.isoformat(),
                "period_label":  f"{_MOIS_FR.get(s.snapshot_date.month, '')} {s.snapshot_date.year}",
                "entity_id":     s.site_id or s.group_id or 0,
                "entity_name":   label,
                "metrics": {
                    "velocity":      s.commit_rate_per_site,
                    "mr_rate":       s.mr_rate_per_site,
                    "quality_score": s.approved_mr_rate,
                    "review_time":   s.avg_review_time_hours,
                    "total_commits": s.total_commits,
                    "total_mrs":     s.total_mrs_created,
                }
            })
        return results