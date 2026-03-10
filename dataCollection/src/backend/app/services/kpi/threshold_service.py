import logging
from typing import List, Optional

from fastapi import HTTPException, status
from sqlalchemy.orm import Session

from app.models.kpi_threshold import KpiThreshold
from app.repositories.kpi_threshold_repository import KpiThresholdRepository
from app.schemas.kpi_threshold import (
    KpiThresholdCreate,
    KpiThresholdUpdate,
    KpiAlertLevel,
    HIGHER_IS_WORSE,
    LOWER_IS_WORSE,
)

logger = logging.getLogger(__name__)


class ThresholdService:
    """
    Gère la configuration et l'évaluation des seuils d'alerte KPI.

    Workflow :
    1. Admin configure les seuils via POST /kpi-thresholds
    2. Le frontend appelle GET /kpi-thresholds/evaluate?project_id=X
    3. evaluate_kpis() compare les dernières valeurs KpiSnapshot aux seuils
    4. Le frontend reçoit le niveau d'alerte (ok/warning/critical)
       et affiche la couleur correspondante 🟢🟡🔴

    Logique d'évaluation :
    ┌──────────────────────────┬──────────────────────────────────────────┐
    │ KPI                      │ Sens                                     │
    ├──────────────────────────┼──────────────────────────────────────────┤
    │ avg_review_time_hours    │ HIGHER_IS_WORSE (lent = mauvais)         │
    │ approved_mr_rate         │ LOWER_IS_WORSE  (taux bas = mauvais)     │
    │ merged_mr_rate           │ LOWER_IS_WORSE  (taux bas = mauvais)     │
    │ mr_rate_per_site         │ LOWER_IS_WORSE  (peu de MRs = mauvais)   │
    │ commit_rate_per_site     │ LOWER_IS_WORSE  (peu de commits = mauvais│
    │ nb_commits_per_project   │ Neutre — configurable manuellement       │
    └──────────────────────────┴──────────────────────────────────────────┘
    """

    def __init__(self):
        self.repo = KpiThresholdRepository()

    # =========================================================================
    # CRUD
    # =========================================================================

    def create_threshold(
        self,
        db:         Session,
        payload:    KpiThresholdCreate,
        created_by: int,
    ) -> KpiThreshold:
        """
        Crée un seuil KPI pour un projet.
        La validation du kpi_name est déjà faite par le schema Pydantic (Literal).
        La validation de l'ordre warning/critical est faite par @model_validator.
        """
        # Unicité (project_id, kpi_name)
        if self.repo.exists(db, payload.project_id, payload.kpi_name):
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail=(
                    f"Un seuil existe déjà pour le KPI '{payload.kpi_name}' "
                    f"sur le projet {payload.project_id}. "
                    f"Utilisez PUT /{'{threshold_id}'} pour le modifier."
                ),
            )

        threshold = self.repo.create(db, {
            "kpi_name":       payload.kpi_name,
            "warning_value":  payload.warning_value,
            "critical_value": payload.critical_value,
            "project_id":     payload.project_id,
            "created_by":     created_by,
        })

        db.commit()
        db.refresh(threshold)

        logger.info(
            f"KpiThreshold created — project={payload.project_id} "
            f"kpi={payload.kpi_name} warning={payload.warning_value} "
            f"critical={payload.critical_value}"
        )
        return threshold

    def update_threshold(
        self,
        db:           Session,
        threshold_id: int,
        payload:      KpiThresholdUpdate,
    ) -> KpiThreshold:
        """
        Met à jour warning_value et/ou critical_value.
        Valide l'ordre warning/critical si les deux valeurs sont fournies.
        """
        threshold = self.repo.get_by_id(db, threshold_id)
        if not threshold:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Seuil KPI introuvable.",
            )

        # Résoudre les valeurs finales (patch partiel)
        new_warning  = payload.warning_value  if payload.warning_value  is not None else threshold.warning_value
        new_critical = payload.critical_value if payload.critical_value is not None else threshold.critical_value

        # [FIX] Validation ordre warning/critical selon le type de KPI
        kpi = threshold.kpi_name
        if kpi in HIGHER_IS_WORSE and new_warning >= new_critical:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=(
                    f"Pour '{kpi}' (plus grand = pire), "
                    f"warning_value ({new_warning}) doit être < critical_value ({new_critical})."
                ),
            )
        if kpi in LOWER_IS_WORSE and new_warning <= new_critical:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=(
                    f"Pour '{kpi}' (plus petit = pire), "
                    f"warning_value ({new_warning}) doit être > critical_value ({new_critical})."
                ),
            )

        update_data = payload.model_dump(exclude_none=True)
        self.repo.update(db, threshold, update_data)

        db.commit()
        db.refresh(threshold)

        logger.info(f"KpiThreshold updated — id={threshold_id}")
        return threshold

    def delete_threshold(
        self,
        db:           Session,
        threshold_id: int,
    ) -> None:
        threshold = self.repo.get_by_id(db, threshold_id)
        if not threshold:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Seuil KPI introuvable.",
            )

        db.delete(threshold)
        db.commit()

        logger.info(f"KpiThreshold deleted — id={threshold_id}")

    def get_project_thresholds(
        self,
        db:         Session,
        project_id: int,
    ) -> List[KpiThreshold]:
        return self.repo.get_by_project(db, project_id)

    # =========================================================================
    # ÉVALUATION — logique 🟢🟡🔴
    # =========================================================================

    def evaluate_kpis(
        self,
        db:         Session,
        project_id: int,
        kpi_values: dict,
    ) -> List[KpiAlertLevel]:
        """
        Compare les valeurs KPI aux seuils configurés pour un projet.

        kpi_values exemple :
        {
            "mr_rate_per_site":      2.5,
            "approved_mr_rate":      0.8,
            "merged_mr_rate":        0.75,
            "commit_rate_per_site":  5.0,
            "nb_commits_per_project": 120.0,
            "avg_review_time_hours": 36.0,
        }

        Retourne une liste KpiAlertLevel avec niveau et couleur par KPI.
        """
        thresholds    = self.repo.get_by_project(db, project_id)
        threshold_map = {t.kpi_name: t for t in thresholds}

        alerts: List[KpiAlertLevel] = []

        for kpi_name, value in kpi_values.items():

            # [FIX] Gérer value=None (extraction partielle ou KPI non calculé)
            if value is None:
                alerts.append(KpiAlertLevel(
                    kpi_name       = kpi_name,
                    value          = None,
                    warning_value  = 0.0,
                    critical_value = 0.0,
                    level          = "unknown",
                    color          = "gray",
                ))
                continue

            # Pas de seuil configuré pour ce KPI → OK par défaut
            if kpi_name not in threshold_map:
                alerts.append(KpiAlertLevel(
                    kpi_name       = kpi_name,
                    value          = value,
                    warning_value  = 0.0,
                    critical_value = 0.0,
                    level          = "ok",
                    color          = "green",
                ))
                continue

            t = threshold_map[kpi_name]

            # ── Évaluation selon le sens du KPI ───────────────────────────

            if kpi_name in HIGHER_IS_WORSE:
                # Plus grand = pire : avg_review_time_hours
                # warning_value < critical_value
                if value >= t.critical_value:
                    level, color = "critical", "red"
                elif value >= t.warning_value:
                    level, color = "warning",  "yellow"
                else:
                    level, color = "ok",       "green"

            elif kpi_name in LOWER_IS_WORSE:
                # [FIX] Plus petit = pire : approved_mr_rate, mr_rate_per_site, etc.
                # warning_value > critical_value
                if value <= t.critical_value:
                    level, color = "critical", "red"
                elif value <= t.warning_value:
                    level, color = "warning",  "yellow"
                else:
                    level, color = "ok",       "green"

            else:
                # nb_commits_per_project et autres — pas de logique directionnelle
                # L'admin peut quand même configurer un seuil,
                # on l'évalue comme higher_is_worse par défaut
                if value >= t.critical_value:
                    level, color = "critical", "red"
                elif value >= t.warning_value:
                    level, color = "warning",  "yellow"
                else:
                    level, color = "ok",       "green"

            alerts.append(KpiAlertLevel(
                kpi_name       = kpi_name,
                value          = value,
                warning_value  = t.warning_value,
                critical_value = t.critical_value,
                level          = level,
                color          = color,
            ))

        return alerts
