"""Analyse des corrélations entre métriques KPI."""
import pandas as pd
import numpy as np
from scipy.stats import pearsonr, spearmanr
from typing import List, Dict, Any
from app.models.kpi_snapshot import KpiSnapshot

class CorrelationAnalyzer:
    """Analyse les corrélations entre différentes métriques KPI."""
    
    def analyze_site_correlations(self, snapshots: List[KpiSnapshot]) -> Dict[str, Any]:
        """
        Analyse les corrélations entre métriques pour les sites.
        
        Args:
            snapshots: Liste de snapshots KPI par site
            
        Returns:
            Dictionnaire avec les corrélations et insights
        """
        if len(snapshots) < 3:
            return {"error": "Pas assez de données pour l'analyse de corrélation"}
        
        # Créer un DataFrame pandas
        data = []
        for snap in snapshots:
            data.append({
                "site_id": snap.site_id,
                "site_name": getattr(snap, 'site_name', f"Site {snap.site_id}"),
                "velocity": snap.mr_rate_per_site,
                "quality": snap.approved_mr_rate * 100,
                "review_time": snap.avg_review_time_hours,
                "merged_rate": snap.merged_mr_rate * 100,
                "commits": snap.total_commits,
            })
        
        df = pd.DataFrame(data)
        
        # Calculer les corrélations de Pearson
        correlations = {}
        metric_pairs = [
            ("velocity", "quality"),
            ("velocity", "review_time"),
            ("quality", "review_time"),
            ("velocity", "merged_rate"),
            ("review_time", "merged_rate"),
        ]
        
        for metric1, metric2 in metric_pairs:
            corr, p_value = pearsonr(df[metric1], df[metric2])
            correlations[f"{metric1}_vs_{metric2}"] = {
                "correlation": round(corr, 3),
                "p_value": round(p_value, 4),
                "significant": bool(p_value < 0.05),
                "interpretation": self._interpret_correlation(corr, metric1, metric2)
            }
        
        # Générer des insights
        insights = self._generate_insights(correlations)
        
        return {
            "correlations": correlations,
            "insights": insights,
            "data_points": len(snapshots)
        }
    
    def _interpret_correlation(self, corr: float, metric1: str, metric2: str) -> str:
        """Interprète la corrélation en langage naturel."""
        abs_corr = abs(corr)
        
        if abs_corr < 0.3:
            return "Corrélation faible ou négligeable"
        elif abs_corr < 0.5:
            direction = "positive" if corr > 0 else "négative"
            return f"Corrélation {direction} modérée"
        elif abs_corr < 0.7:
            direction = "positive" if corr > 0 else "négative"
            return f"Corrélation {direction} notable"
        else:
            direction = "positive" if corr > 0 else "négative"
            return f"Fort corrélation {direction}"
    
    def _generate_insights(self, correlations: Dict[str, Any]) -> List[str]:
        """Génère des insights basés sur les corrélations significatives."""
        insights = []
        
        # Vélocité vs Qualité
        vel_qual = correlations.get("velocity_vs_quality", {})
        if vel_qual.get("significant") and vel_qual["correlation"] < -0.3:
            insights.append(
                "⚠️ Corrélation négative détectée : vélocité élevée associée à "
                "qualité réduite. Considérer l'équilibre vitesse/qualité."
            )
        elif vel_qual.get("significant") and vel_qual["correlation"] > 0.3:
            insights.append(
                "✅ Corrélation positive : sites performants maintiennent la qualité "
                "tout en livrant rapidement."
            )
        
        # Review Time vs Qualité
        rev_qual = correlations.get("review_time_vs_quality", {})
        if rev_qual.get("significant") and rev_qual["correlation"] < -0.3:
            insights.append(
                "⚠️ Corrélation négative : temps de revue long associé à "
                "qualité réduite. Optimiser le flux de revue."
            )
        
        # Review Time vs Vélocité
        rev_vel = correlations.get("review_time_vs_velocity", {})
        if rev_vel.get("significant") and rev_vel["correlation"] < -0.3:
            insights.append(
                "✅ Corrélation négative : revues rapides associées à "
                "vélocité élevée. Bonne pratique de CI/CD."
            )
        
        return insights if insights else ["Aucune corrélation significative détectée"]
