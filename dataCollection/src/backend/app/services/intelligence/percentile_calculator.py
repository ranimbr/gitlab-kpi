"""
Calculateur de seuils dynamiques basés sur les percentiles.

Ce service remplace les seuils hardcodés par des percentiles calculés
dynamiquement pour chaque projet, permettant une adaptation automatique
aux spécificités de chaque équipe.
"""
import logging
from datetime import datetime
from typing import Dict, Optional
import numpy as np
from sqlalchemy.orm import Session

from app.repositories.kpi_snapshot_repository import KpiSnapshotRepository

logger = logging.getLogger(__name__)


# Seuils de fallback (hardcodés) si pas assez de données
FALLBACK_THRESHOLDS = {
    "velocity_low": 1.0,
    "review_time_high": 48.0,
    "quality_low": 0.5,
}


class PercentileCalculator:
    """
    Calcule les seuils dynamiques basés sur les percentiles pour un projet.
    
    Stratégie :
    - Calculer les percentiles Q1 (25ème) et Q3 (75ème) sur 6 mois d'historique
    - Exclure le mois en cours (données incomplètes)
    - Par projet (tous sites confondus) pour permettre la comparaison inter-sites
    - Fallback sur les seuils hardcodés si < 3 périodes de données
    """

    def __init__(self, db: Session):
        self.db = db
        self.snapshot_repo = KpiSnapshotRepository()

    def calculate_dynamic_thresholds(
        self,
        project_id: int,
        min_periods: int = 1,  # Réduit de 3 à 1 pour permettre le calcul avec moins de données
        history_months: int = 6
    ) -> Dict[str, any]:
        """
        Calcule les seuils dynamiques pour un projet.
        
        Args:
            project_id: ID du projet
            min_periods: Nombre minimum de périodes requises (défaut: 3)
            history_months: Nombre de mois d'historique à utiliser (défaut: 6)
            
        Returns:
            {
                "velocity_low": float,
                "review_time_high": float,
                "quality_low": float,
                "using_fallback": bool,
                "periods_used": int
            }
        """
        logger.info(f"[PercentileCalculator] Calcul des seuils dynamiques pour projet {project_id}")
        print(f"[DEBUG] PercentileCalculator: Calcul des seuils pour projet {project_id}")
        try:
            # Utiliser le repository pour récupérer les snapshots
            all_snapshots = self.snapshot_repo.get_history_per_site_multi(
                self.db, project_id, n_periods=history_months
            )
            
            # Extraire les IDs uniques de périodes
            period_ids = list(set([s.period_id for site_snapshots in all_snapshots.values() for s in site_snapshots]))
            logger.info(f"[PercentileCalculator] Périodes éligibles trouvées: {len(period_ids)} (min requis: {min_periods})")
            print(f"[DEBUG] Périodes trouvées: {len(period_ids)}")
            
            if len(period_ids) < min_periods:
                logger.info(
                    f"Pas assez de périodes pour le projet {project_id}: "
                    f"{len(period_ids)} < {min_periods}. Utilisation des fallbacks."
                )
                print(f"[DEBUG] Pas assez de périodes: {len(period_ids)} < {min_periods}")
                return {
                    **FALLBACK_THRESHOLDS,
                    "using_fallback": bool(True),
                    "periods_used": int(len(period_ids))
                }
            
            # Aplatir la liste de snapshots
            snapshots = []
            for site_snapshots in all_snapshots.values():
                snapshots.extend(site_snapshots)
            
            logger.info(f"[PercentileCalculator] Snapshots récupérés: {len(snapshots)}")
            
            if not snapshots:
                logger.warning(f"Aucun snapshot trouvé pour le projet {project_id}")
                return {
                    **FALLBACK_THRESHOLDS,
                    "using_fallback": bool(True),
                    "periods_used": int(0)
                }
            
            # Calculer les percentiles pour chaque métrique
            velocity_low = self._calculate_percentile(
                [s.mr_rate_per_site for s in snapshots if s.mr_rate_per_site is not None],
                percentile=25
            )
            
            review_high = self._calculate_percentile(
                [s.avg_review_time_hours for s in snapshots if s.avg_review_time_hours is not None],
                percentile=75
            )
            
            quality_low = self._calculate_percentile(
                [s.approved_mr_rate for s in snapshots if s.approved_mr_rate is not None],
                percentile=25
            )
            
            logger.info(
                f"Seuils dynamiques calculés pour le projet {project_id}: "
                f"velocity_low={velocity_low:.2f}, review_high={review_high:.1f}, "
                f"quality_low={quality_low:.2f} (basé sur {len(period_ids)} périodes)"
            )
            
            return {
                "velocity_low": float(velocity_low),
                "review_time_high": float(review_high),
                "quality_low": float(quality_low),
                "using_fallback": bool(False),
                "periods_used": int(len(period_ids))
            }
            
        except Exception as exc:
            logger.error(f"Erreur lors du calcul des percentiles pour le projet {project_id}: {exc}")
            return {
                **FALLBACK_THRESHOLDS,
                "using_fallback": bool(True),
                "periods_used": int(0)
            }

    def _calculate_percentile(self, values: list, percentile: int) -> float:
        """
        Calcule le percentile spécifié pour une liste de valeurs.
        
        Exclut les valeurs zéro/NULL qui indiquent une absence de données.
        """
        if not values:
            # Fallback sur les seuils hardcodés si pas de valeurs
            if percentile == 25:
                return FALLBACK_THRESHOLDS["velocity_low"] if "velocity" in str(values).lower() else FALLBACK_THRESHOLDS["quality_low"]
            else:
                return FALLBACK_THRESHOLDS["review_time_high"]
        
        # Convertir en numpy array et exclure les zéros (absence de données)
        arr = np.array([v for v in values if v > 0])
        
        if len(arr) == 0:
            # Si toutes les valeurs sont à zéro, utiliser le fallback
            if percentile == 25:
                return FALLBACK_THRESHOLDS["velocity_low"]
            else:
                return FALLBACK_THRESHOLDS["review_time_high"]
        
        try:
            result = np.percentile(arr, percentile)
            return float(result)
        except Exception as exc:
            logger.warning(f"Erreur lors du calcul du percentile {percentile}: {exc}")
            # Fallback
            if percentile == 25:
                return FALLBACK_THRESHOLDS["velocity_low"]
            else:
                return FALLBACK_THRESHOLDS["review_time_high"]
