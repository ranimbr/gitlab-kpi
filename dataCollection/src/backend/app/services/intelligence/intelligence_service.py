"""Service principal d'intelligence statistique pour Super Admin."""
import logging
from typing import List, Dict, Any, Optional
from sqlalchemy.orm import Session

from app.models.kpi_snapshot import KpiSnapshot
from app.repositories.kpi_snapshot_repository import KpiSnapshotRepository
from .anomaly_detector import AnomalyDetector
from .correlation_analyzer import CorrelationAnalyzer
from .trend_analyzer import TrendAnalyzer

logger = logging.getLogger(__name__)

class IntelligenceService:
    """Service d'intelligence statistique pour le Super Admin."""
    
    def __init__(self, db: Session):
        self.db = db
        self.snapshot_repo = KpiSnapshotRepository()
        self.anomaly_detector = AnomalyDetector(contamination=0.1)
        self.correlation_analyzer = CorrelationAnalyzer()
        self.trend_analyzer = None  # Initialisé dynamiquement avec le project_id
    
    def get_admin_intelligence(
        self,
        project_id: int,
        period_id: Optional[int] = None,
        site_id: Optional[int] = None,
        site_ids: Optional[List[int]] = None
    ) -> Dict[str, Any]:
        """
        Génère les insights d'intelligence pour le Super Admin ou Site Manager.
        
        Args:
            project_id: ID du projet
            period_id: ID de la période (None = dernière période)
            site_id: ID du site (optionnel, pour filtrer les données d'un site_manager)
            site_ids: IDs des sites multiples (optionnel, pour multi-sites)
            
        Returns:
            Dictionnaire avec anomalies, corrélations, tendances et recommandations
        """
        # ── Analyse ponctuelle (existante) ────────────────────────────────
        snapshots = self._get_site_snapshots(project_id, period_id)
        
        # ✅ FIX : Filtrer par site_ids si fourni (pour multi-sites)
        if site_ids:
            snapshots = [s for s in snapshots if s.site_id in site_ids]
        elif site_id:
            # Fallback vers l'ancien système single site
            snapshots = [s for s in snapshots if s.site_id == site_id]
        
        if not snapshots:
            return {
                "error": "Aucune donnée disponible pour l'analyse",
                "anomalies": [],
                "correlations": None,
                "recommendations": [],
                "trend_analysis": None,
            }
        
        # Détection d'anomalies (existante)
        velocity_anomalies = self.anomaly_detector.detect_velocity_anomalies(snapshots)
        review_anomalies   = self.anomaly_detector.detect_review_time_anomalies(snapshots)
        quality_anomalies  = self.anomaly_detector.detect_quality_anomalies(snapshots)
        all_anomalies = velocity_anomalies + review_anomalies + quality_anomalies
        
        # Analyse des corrélations (existante)
        correlation_analysis = self.correlation_analyzer.analyze_site_correlations(snapshots)
        
        # Filtrer le message "Aucune corrélation significative détectée" pour ne pas compter comme insight
        if correlation_analysis.get("insights"):
            correlation_analysis["insights"] = [ins for ins in correlation_analysis["insights"] if ins != "Aucune corrélation significative détectée"]
        
        # ── Analyse multi-périodes (NOUVEAU) ──────────────────────────────
        trend_analysis = self._run_trend_analysis(project_id, None, site_ids)

        # ── Recommandations enrichies ─────────────────────────────────────
        recommendations = self._generate_recommendations(
            all_anomalies,
            correlation_analysis.get("insights", []),
            trend_analysis,
            site_id=site_id,
            site_ids=site_ids
        )
        
        return {
            "project_id":     project_id,
            "period_id":      period_id,
            "period_label":   self._get_period_label(period_id),
            "anomalies":      all_anomalies,
            "correlations":   correlation_analysis,
            "recommendations": recommendations,
            "summary":        self._generate_summary(all_anomalies, correlation_analysis, trend_analysis),
            "trend_analysis": trend_analysis,             # ← NOUVEAU
        }
    
    def get_team_intelligence(
        self,
        project_id: int,
        period_id: Optional[int] = None,
        group_id: Optional[int] = None,
        group_ids: Optional[List[int]] = None
    ) -> Dict[str, Any]:
        """
        Génère les insights d'intelligence pour les équipes (teams).
        
        Args:
            project_id: ID du projet
            period_id: ID de la période (None = dernière période)
            group_id: ID du groupe/équipe (optionnel, pour filtrer pour un team_lead)
            group_ids: IDs des groupes multiples (optionnel, pour multi-équipes)
            
        Returns:
            Dictionnaire avec anomalies, corrélations, tendances et recommandations
        """
        # ── Analyse ponctuelle (existante) ────────────────────────────────
        snapshots = self._get_group_snapshots(project_id, period_id)
        
        # ✅ FIX : Filtrer par group_ids si fourni (pour multi-équipes)
        if group_ids:
            snapshots = [s for s in snapshots if s.group_id in group_ids]
        elif group_id:
            # Fallback vers l'ancien système single group
            snapshots = [s for s in snapshots if s.group_id == group_id]
        
        if not snapshots:
            return {
                "error": "Aucune donnée disponible pour l'analyse des équipes",
                "anomalies": [],
                "correlations": None,
                "recommendations": [],
                "trend_analysis": None,
            }
        
        # Détection d'anomalies (existante)
        velocity_anomalies = self.anomaly_detector.detect_velocity_anomalies(snapshots)
        review_anomalies   = self.anomaly_detector.detect_review_time_anomalies(snapshots)
        quality_anomalies  = self.anomaly_detector.detect_quality_anomalies(snapshots)
        all_anomalies = velocity_anomalies + review_anomalies + quality_anomalies
        
        # Analyse des corrélations (existante)
        correlation_analysis = self.correlation_analyzer.analyze_site_correlations(snapshots)
        
        # Filtrer le message "Aucune corrélation significative détectée" pour ne pas compter comme insight
        if correlation_analysis.get("insights"):
            correlation_analysis["insights"] = [ins for ins in correlation_analysis["insights"] if ins != "Aucune corrélation significative détectée"]
        
        # ── Analyse multi-périodes (NOUVEAU) ──────────────────────────────
        trend_analysis = self._run_team_trend_analysis(project_id, group_id, group_ids)

        # ── Recommandations enrichies ─────────────────────────────────────
        recommendations = self._generate_recommendations(
            all_anomalies,
            correlation_analysis.get("insights", []),
            trend_analysis,
            group_id=group_id,
            group_ids=group_ids
        )
        
        return {
            "project_id":     project_id,
            "period_id":      period_id,
            "period_label":   self._get_period_label(period_id),
            "anomalies":      all_anomalies,
            "correlations":   correlation_analysis,
            "recommendations": recommendations,
            "summary":        self._generate_summary(all_anomalies, correlation_analysis, trend_analysis),
            "trend_analysis": trend_analysis,
        }
    
    # ── Méthodes existantes (inchangées) ──────────────────────────────────────

    def _get_site_snapshots(self, project_id: int, period_id: Optional[int]) -> List[KpiSnapshot]:
        """Récupère les snapshots par site pour une période."""
        if period_id:
            return self.snapshot_repo.get_site_comparison(
                self.db, project_id, period_id, kpi_field="mr_rate_per_site"
            )
        return self.snapshot_repo.get_latest_per_site(self.db, project_id)
    
    def _get_group_snapshots(self, project_id: int, period_id: Optional[int]) -> List[KpiSnapshot]:
        """Récupère les snapshots par équipe (group) pour une période."""
        if period_id:
            # Pour une période spécifique, utiliser get_site_comparison avec filtre group_id
            snapshots = self.snapshot_repo.get_site_comparison(
                self.db, project_id, period_id, kpi_field="mr_rate_per_site"
            )
            # Filtrer pour ne retourner que les snapshots de niveau group
            return [s for s in snapshots if s.group_id is not None]
        # Utiliser la nouvelle méthode dédiée aux équipes
        return self.snapshot_repo.get_latest_per_group(self.db, project_id)
    
    def _get_period_label(self, period_id: Optional[int]) -> str:
        """Génère le label de période."""
        if not period_id:
            return "Dernière période"
        
        from app.repositories.period_repository import PeriodRepository
        period_repo = PeriodRepository()
        period = period_repo.get_by_id(self.db, period_id)
        
        if period:
            mois = {
                1: "Janvier", 2: "Février", 3: "Mars", 4: "Avril",
                5: "Mai", 6: "Juin", 7: "Juillet", 8: "Août",
                9: "Septembre", 10: "Octobre", 11: "Novembre", 12: "Décembre"
            }
            return f"{mois.get(period.month, '')} {period.year}"
        
        return f"Période {period_id}"

    # ── Nouvelle méthode d'analyse multi-périodes ─────────────────────────────

    def _run_trend_analysis(self, project_id: int, site_id: Optional[int] = None, site_ids: Optional[List[int]] = None) -> Optional[Dict[str, Any]]:
        """
        Lance l'analyse multi-périodes (3 derniers mois) via TrendAnalyzer.
        Retourne None si pas assez de données (non-bloquant).
        """
        try:
            logger.info(f"[IntelligenceService] Initialisation TrendAnalyzer avec project_id={project_id}, site_id={site_id}, site_ids={site_ids}")
            # Initialiser TrendAnalyzer avec le contexte du projet pour les seuils dynamiques et filtrage par site_ids
            self.trend_analyzer = TrendAnalyzer(db=self.db, project_id=project_id, site_ids=site_ids)

            logger.info(f"[IntelligenceService] Seuils TrendAnalyzer: {self.trend_analyzer.thresholds}")

            site_histories = self.snapshot_repo.get_history_per_site_multi(
                self.db, project_id, n_periods=3
            )
            
            logger.info(f"[IntelligenceService] site_histories keys avant filtrage: {list(site_histories.keys())}")

            # Filtrer par site_ids si fourni (pour multi-sites site_manager)
            if site_ids:
                logger.info(f"[IntelligenceService] Filtrage site_histories par site_ids={site_ids}")
                site_histories = {k: v for k, v in site_histories.items() if k in site_ids}
                logger.info(f"[IntelligenceService] site_histories keys après filtrage: {list(site_histories.keys())}")
            elif site_id:
                # Fallback vers l'ancien système single site
                logger.info(f"[IntelligenceService] Filtrage site_histories par site_id={site_id}")
                site_histories = {k: v for k, v in site_histories.items() if k == site_id}
                logger.info(f"[IntelligenceService] site_histories keys après filtrage: {list(site_histories.keys())}")

            if not site_histories:
                logger.warning(f"[IntelligenceService] Aucun site_history trouvé pour project_id={project_id}, site_id={site_id}, site_ids={site_ids}")
                return None
            # Vérifier qu'au moins un site a 2+ périodes
            if not any(len(h) >= 2 for h in site_histories.values()):
                logger.warning(f"[IntelligenceService] Pas assez de périodes dans site_histories pour project_id={project_id}")
                return None
            return self.trend_analyzer.analyze(site_histories)
        except Exception as exc:
            logger.error(f"[IntelligenceService] Erreur dans _run_trend_analysis: {exc}", exc_info=True)
            return None
    
    def _run_team_trend_analysis(self, project_id: int, group_id: Optional[int] = None, group_ids: Optional[List[int]] = None) -> Optional[Dict[str, Any]]:
        """
        Lance l'analyse multi-périodes (3 derniers mois) pour les équipes via TrendAnalyzer.
        Retourne None si pas assez de données (non-bloquant).
        """
        try:
            logger.info(f"[IntelligenceService] Initialisation TrendAnalyzer pour équipes avec project_id={project_id}")
            # Initialiser TrendAnalyzer avec le contexte du projet pour les seuils dynamiques
            self.trend_analyzer = TrendAnalyzer(db=self.db, project_id=project_id, group_ids=group_ids)

            logger.info(f"[IntelligenceService] Seuils TrendAnalyzer: {self.trend_analyzer.thresholds}")

            # Récupérer l'historique par groupe (équipe) avec la nouvelle méthode dédiée
            group_histories = self.snapshot_repo.get_history_per_group_multi(
                self.db, project_id, n_periods=3
            )

            # Filtrer par group_ids si fourni (pour multi-équipes team_lead)
            if group_ids:
                group_histories = {
                    k: v for k, v in group_histories.items() if k in group_ids
                }
            elif group_id:
                # Fallback vers l'ancien système single group
                group_histories = {
                    k: v for k, v in group_histories.items() if k == group_id
                }

            if not group_histories:
                logger.warning(f"[IntelligenceService] Aucun group_history trouvé pour project_id={project_id}, group_id={group_id}, group_ids={group_ids}")
                return None
            # Vérifier qu'au moins un groupe a 2+ périodes
            if not any(len(h) >= 2 for h in group_histories.values()):
                logger.warning(f"[IntelligenceService] Pas assez de périodes dans group_histories pour project_id={project_id}")
                return None
            return self.trend_analyzer.analyze(group_histories)
        except Exception as exc:
            logger.error(f"[IntelligenceService] Erreur dans _run_team_trend_analysis: {exc}", exc_info=True)
            return None

    # ── Recommandations enrichies ─────────────────────────────────────────────

    def _generate_recommendations(
        self,
        anomalies: List[Dict[str, Any]],
        correlation_insights: List[str],
        trend_analysis: Optional[Dict[str, Any]],
        site_id: Optional[int] = None,
        site_ids: Optional[List[int]] = None,
        group_id: Optional[int] = None,
        group_ids: Optional[List[int]] = None
    ) -> List[str]:
        """
        Génère des recommandations enrichies en combinant :
        - Anomalies ponctuelles (existant)
        - Insights de corrélation (existant)
        - Recommandations RH multi-périodes (nouveau)
        
        Args:
            site_id: ID du site (optionnel, pour filtrer les recommandations d'un site_manager)
            site_ids: IDs des sites multiples (optionnel, pour multi-sites)
            group_id: ID du groupe (optionnel, pour filtrer les recommandations d'un team_lead)
        """
        recommendations = []

        # ── Recommandations issues des anomalies (existant) ───────────────
        high_severity = [a for a in anomalies if a["severity"] == "high"]
        if high_severity:
            recommendations.append(
                f"⚠️ Action requise : {len(high_severity)} anomalie(s) critique(s) détectée(s). "
                "Investigation prioritaire recommandée."
            )
        
        velocity_outliers = [a for a in anomalies if a["metric"] == "velocity" and a.get("type") == "outlier"]
        if velocity_outliers:
            sites = ", ".join([a["site_name"] for a in velocity_outliers])
            recommendations.append(
                f"📉 Vélocité faible détectée sur : {sites}. "
                "Considérer : redistribution de ressources, formation, ou révision de la charge de travail."
            )
        
        review_bottlenecks = [a for a in anomalies if a["metric"] == "review_time"]
        if review_bottlenecks:
            sites = ", ".join([a["site_name"] for a in review_bottlenecks])
            recommendations.append(
                f"⏱️ Goulot d'étranglement de revue sur : {sites}. "
                "Considérer : augmentation du nombre de reviewers, revues asynchrones, ou automatisation."
            )
        
        # ── Insights de corrélation (existant) ───────────────────────────
        # Filtrer le message "Aucune corrélation significative détectée" pour ne pas compter comme recommandation
        correlation_insights_filtered = [ins for ins in correlation_insights if ins != "Aucune corrélation significative détectée"]
        
        # Pour site_manager avec site_ids spécifiques, ignorer les insights de corrélation généraux
        # car ils sont basés sur tous les sites et non filtrés par site
        if site_ids and len(site_ids) == 1:
            # Site_manager avec un seul site: pas d'insights de corrélation inter-sites
            correlation_insights_filtered = []
        
        # Pour team_lead avec group_id spécifique, ignorer les insights de corrélation généraux
        if group_id and not group_ids:
            # Team_lead avec un seul groupe: pas d'insights de corrélation inter-groupes
            correlation_insights_filtered = []
        
        recommendations.extend(correlation_insights_filtered)

        # ── Recommandations RH multi-périodes (nouveau) ───────────────────
        if trend_analysis and trend_analysis.get("rh_recommendations"):
            for rh_rec in trend_analysis["rh_recommendations"]:
                # Filtrer par site_id ou site_ids selon le contexte
                if site_id and rh_rec.get("site_id") != site_id:
                    continue
                if site_ids and rh_rec.get("site_id") not in site_ids:
                    continue
                # Filtrer par group_id ou group_ids selon le contexte (pour team_lead)
                if group_id and rh_rec.get("group_id") != group_id:
                    continue
                if group_ids and rh_rec.get("group_id") not in group_ids:
                    continue
                recommendations.append(f"[{rh_rec['category']}] {rh_rec['message']}")
        
        # Retourner un tableau vide si aucune recommandation (le frontend gérera l'affichage)
        return recommendations
    
    def _generate_summary(
        self,
        anomalies: List[Dict[str, Any]],
        correlation_analysis: Dict[str, Any],
        trend_analysis: Optional[Dict[str, Any]],
    ) -> str:
        """Génère un résumé exécutif enrichi avec l'analyse de tendances."""
        # Si l'analyse multi-périodes est disponible, elle prime
        if trend_analysis and trend_analysis.get("summary"):
            return trend_analysis["summary"]

        # Fallback : résumé basé sur les anomalies ponctuelles (existant)
        anomaly_count = len(anomalies)
        high_severity = len([a for a in anomalies if a["severity"] == "high"])
        
        if anomaly_count == 0:
            return "✅ Performance globale stable - Aucune anomalie détectée"
        if high_severity > 0:
            return f"⚠️ {anomaly_count} anomalie(s) détectée(s) dont {high_severity} critique(s) - Action requise"
        """Génère un résumé exécutif pour le Super Admin."""
        anomaly_count = len(anomalies)
        high_severity = len([a for a in anomalies if a["severity"] == "high"])
        
        if anomaly_count == 0:
            return "✅ Performance globale stable - Aucune anomalie détectée"
        
        if high_severity > 0:
            return f"⚠️ {anomaly_count} anomalie(s) détectée(s) dont {high_severity} critique(s) - Action requise"
        
        return f"ℹ️ {anomaly_count} anomalie(s) mineure(s) détectée(s) - Surveillance recommandée"
