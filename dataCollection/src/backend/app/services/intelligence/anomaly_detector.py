"""Détection d'anomalies dans les données KPI."""
import numpy as np
from sklearn.ensemble import IsolationForest
from typing import List, Dict, Any
from app.models.kpi_snapshot import KpiSnapshot

class AnomalyDetector:
    """Détecte les outliers dans les tendances KPI inter-sites."""
    
    def __init__(self, contamination: float = 0.1):
        """
        Args:
            contamination: Proportion attendue d'anomalies (0.0-0.5)
        """
        self.contamination = contamination
    
    def detect_velocity_anomalies(self, snapshots: List[KpiSnapshot]) -> List[Dict[str, Any]]:
        """
        Détecte les anomalies de vélocité (commits/dev) entre sites ou équipes.
        
        Args:
            snapshots: Liste de snapshots KPI par site ou équipe pour une période
            
        Returns:
            Liste d'anomalies détectées avec contexte
        """
        if len(snapshots) < 3:
            return []  # Pas assez de données pour détecter des anomalies
        
        # Extraire les vélocités
        velocities = np.array([s.mr_rate_per_site for s in snapshots]).reshape(-1, 1)
        
        # Isolation Forest pour détecter les outliers
        clf = IsolationForest(contamination=self.contamination, random_state=42)
        predictions = clf.fit_predict(velocities)
        
        anomalies = []
        for i, (snap, pred) in enumerate(zip(snapshots, predictions)):
            if pred == -1:  # Anomalie détectée
                # Context-aware: utiliser group_id/group_name pour les équipes, site_id/site_name pour les sites
                if bool(snap.group_id is not None):
                    entity_id = snap.group_id
                    entity_name = getattr(snap.group, 'name', f"Équipe {snap.group_id}") if snap.group else f"Équipe {snap.group_id}"
                else:
                    entity_id = snap.site_id
                    entity_name = getattr(snap.site, 'name', f"Site {snap.site_id}") if snap.site else f"Site {snap.site_id}"
                
                anomalies.append({
                    "site_id": entity_id,
                    "site_name": entity_name,
                    "metric": "velocity",
                    "value": snap.mr_rate_per_site,
                    "severity": "high" if snap.mr_rate_per_site < 2.0 else "medium",
                    "type": "outlier" if snap.mr_rate_per_site < np.mean(velocities) else "overperformer"
                })
        
        return anomalies
    
    def detect_review_time_anomalies(self, snapshots: List[KpiSnapshot]) -> List[Dict[str, Any]]:
        """Détecte les anomalies de temps de revue."""
        if len(snapshots) < 3:
            return []
        
        review_times = np.array([s.avg_review_time_hours for s in snapshots]).reshape(-1, 1)
        
        clf = IsolationForest(contamination=self.contamination, random_state=42)
        predictions = clf.fit_predict(review_times)
        
        anomalies = []
        for i, (snap, pred) in enumerate(zip(snapshots, predictions)):
            if pred == -1:
                # Context-aware: utiliser group_id/group_name pour les équipes, site_id/site_name pour les sites
                if bool(snap.group_id is not None):
                    entity_id = snap.group_id
                    entity_name = getattr(snap.group, 'name', f"Équipe {snap.group_id}") if snap.group else f"Équipe {snap.group_id}"
                else:
                    entity_id = snap.site_id
                    entity_name = getattr(snap.site, 'name', f"Site {snap.site_id}") if snap.site else f"Site {snap.site_id}"
                
                anomalies.append({
                    "site_id": entity_id,
                    "site_name": entity_name,
                    "metric": "review_time",
                    "value": snap.avg_review_time_hours,
                    "severity": "high" if snap.avg_review_time_hours > 72 else "medium",
                    "type": "bottleneck"
                })
        
        return anomalies
    
    def detect_quality_anomalies(self, snapshots: List[KpiSnapshot]) -> List[Dict[str, Any]]:
        """Détecte les anomalies de qualité (taux d'approbation)."""
        if len(snapshots) < 3:
            return []
        
        quality_scores = np.array([s.approved_mr_rate for s in snapshots]).reshape(-1, 1)
        
        clf = IsolationForest(contamination=self.contamination, random_state=42)
        predictions = clf.fit_predict(quality_scores)
        
        anomalies = []
        for i, (snap, pred) in enumerate(zip(snapshots, predictions)):
            if pred == -1:
                # Context-aware: utiliser group_id/group_name pour les équipes, site_id/site_name pour les sites
                if bool(snap.group_id is not None):
                    entity_id = snap.group_id
                    entity_name = getattr(snap.group, 'name', f"Équipe {snap.group_id}") if snap.group else f"Équipe {snap.group_id}"
                else:
                    entity_id = snap.site_id
                    entity_name = getattr(snap.site, 'name', f"Site {snap.site_id}") if snap.site else f"Site {snap.site_id}"
                
                anomalies.append({
                    "site_id": entity_id,
                    "site_name": entity_name,
                    "metric": "quality",
                    "value": snap.approved_mr_rate * 100,
                    "severity": "high" if snap.approved_mr_rate < 0.6 else "medium",
                    "type": "quality_issue"
                })
        
        return anomalies
