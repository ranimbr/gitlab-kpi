"""
services/kpi/threshold_service.py


"""
import logging
from typing import List, Optional

from fastapi import HTTPException, status
from sqlalchemy.orm import Session

from app.models.alert import AlertLevelEnum
from app.models.kpi_threshold import KpiThreshold
from app.repositories.alert_repository import AlertRepository
from app.repositories.audit_log_repository import AuditLogRepository
from app.repositories.kpi_threshold_repository import KpiThresholdRepository
from app.schemas.kpi_threshold import KpiAlertLevel, KpiThresholdCreate, KpiThresholdUpdate
from app.schemas.enums import HIGHER_IS_WORSE, LOWER_IS_WORSE

logger = logging.getLogger(__name__)


class ThresholdService:
    """
    Gère la configuration et l'évaluation des seuils d'alerte KPI.

    Sens des KPIs :
        HIGHER_IS_WORSE : AVG_REVIEW_TIME   (temps long = mauvais)
        LOWER_IS_WORSE  : APPROVED_MR_RATE, MERGED_MR_RATE,
                          MR_RATE_SITE, COMMIT_RATE_SITE (valeur basse = mauvais)
        NEUTRAL         : NB_COMMITS_PROJECT
    """

    def __init__(self):
        self.repo       = KpiThresholdRepository()
        self.alert_repo = AlertRepository()
        self.audit_repo = AuditLogRepository()

    # =========================================================================
    # CRUD
    # =========================================================================

    def create_threshold(
        self,
        db:         Session,
        payload:    KpiThresholdCreate,
        created_by: int,
        ip_address: Optional[str] = None,
    ) -> KpiThreshold:

        # DISABLED: Dashboard functionality removed
        # if self.repo.exists_for_dashboard(
        #     db,
        #     dashboard_id      = payload.dashboard_id or 0,
        #     kpi_definition_id = payload.kpi_definition_id,
        # ):
        #     raise HTTPException(
        #         status_code=status.HTTP_409_CONFLICT,
        #         detail=(
        #             f"Un seuil existe déjà pour kpi_definition_id={payload.kpi_definition_id}. "
        #             "Utilisez PATCH pour le modifier."
        #         ),
        #     )

        # ✅ FIX : threshold_type au lieu de type (renommage modèle)
        # ✅ FIX : pas de "kpi_name" dans le dict — c'est une @property
        threshold = self.repo.create(db, {
            "warning_value":     payload.warning_value,
            "critical_value":    payload.critical_value,
            "project_id":        payload.project_id,
            # DISABLED: Dashboard functionality removed
            # "dashboard_id":      payload.dashboard_id,
            "kpi_definition_id": payload.kpi_definition_id,
            "threshold_type":    payload.threshold_type,   # ✅ renommé
            "created_by":        created_by,
        })

        # Charger la relation pour avoir kpi_name via @property
        threshold_loaded = self.repo.get_by_id(db, threshold.id)
        kpi_code = threshold_loaded.kpi_name if threshold_loaded else str(payload.kpi_definition_id)

        self.audit_repo.log(
            db          = db,
            user_id     = created_by,
            action      = "CREATE_THRESHOLD",
            entity_type = "KpiThreshold",
            entity_id   = threshold.id,
            new_value   = {
                "kpi_code":       kpi_code,
                "warning_value":  payload.warning_value,
                "critical_value": payload.critical_value,
                "threshold_type": payload.threshold_type,
            },
            ip_address  = ip_address,
        )

        db.commit()
        db.refresh(threshold)
        logger.info(
            f"KpiThreshold created — project={payload.project_id} "
            f"kpi_def={payload.kpi_definition_id} type={payload.threshold_type}"
        )
        return threshold

    def update_threshold(
        self,
        db:           Session,
        threshold_id: int,
        payload:      KpiThresholdUpdate,
        updated_by:   Optional[int] = None,
        ip_address:   Optional[str] = None,
    ) -> KpiThreshold:

        # get_by_id() fait joinedload → kpi_name @property disponible
        threshold = self.repo.get_by_id(db, threshold_id)
        if not threshold:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Seuil KPI introuvable.",
            )

        old_value = {
            "warning_value":  threshold.warning_value,
            "critical_value": threshold.critical_value,
        }

        new_warning  = payload.warning_value  if payload.warning_value  is not None else threshold.warning_value
        new_critical = payload.critical_value if payload.critical_value is not None else threshold.critical_value

        kpi = threshold.kpi_name  # @property via joinedload
        if kpi:
            if kpi in HIGHER_IS_WORSE and new_warning >= new_critical:
                raise HTTPException(
                    status_code=status.HTTP_400_BAD_REQUEST,
                    detail=f"Pour '{kpi}' (plus grand = pire), warning doit être < critical.",
                )
            if kpi in LOWER_IS_WORSE and new_warning <= new_critical:
                raise HTTPException(
                    status_code=status.HTTP_400_BAD_REQUEST,
                    detail=f"Pour '{kpi}' (plus petit = pire), warning doit être > critical.",
                )

        update_data = payload.model_dump(exclude_unset=True)
        self.repo.update(db, threshold, update_data)

        self.audit_repo.log(
            db=db, user_id=updated_by, action="UPDATE_THRESHOLD",
            entity_type="KpiThreshold", entity_id=threshold_id,
            old_value=old_value, new_value=update_data, ip_address=ip_address,
        )

        db.commit()
        db.refresh(threshold)
        logger.info(f"KpiThreshold updated — id={threshold_id}")
        return threshold

    def delete_threshold(
        self,
        db:           Session,
        threshold_id: int,
        deleted_by:   Optional[int] = None,
        ip_address:   Optional[str] = None,
    ) -> None:

        threshold = self.repo.get_by_id(db, threshold_id)
        if not threshold:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Seuil KPI introuvable.",
            )

        self.audit_repo.log(
            db=db, user_id=deleted_by, action="DELETE_THRESHOLD",
            entity_type="KpiThreshold", entity_id=threshold_id,
            old_value={
                "kpi_definition_id": threshold.kpi_definition_id,
                "kpi_name":          threshold.kpi_name,
            },
            ip_address=ip_address,
        )

        db.delete(threshold)
        db.commit()
        logger.info(f"KpiThreshold deleted — id={threshold_id}")

    def get_project_thresholds(self, db: Session, project_id: int) -> List[KpiThreshold]:
        return self.repo.get_by_project(db, project_id)

    # DISABLED: Dashboard functionality removed
    # def get_dashboard_thresholds(self, db: Session, dashboard_id: int) -> List[KpiThreshold]:
    #     return self.repo.get_by_dashboard(db, dashboard_id)

    # =========================================================================
    # ÉVALUATION KPIs
    # =========================================================================

    def evaluate_kpis(
        self,
        db:           Session,
        project_id:   int,
        kpi_values:   dict,
        dashboard_id: Optional[int] = None,
    ) -> List[KpiAlertLevel]:
        """
        Compare les valeurs KPI aux seuils configurés.
        kpi_name accessible via @property (joinedload dans les repos).
        """
        # DISABLED: Dashboard functionality removed
        # if dashboard_id is not None:
        #     thresholds = self.repo.get_by_dashboard(db, dashboard_id)
        # else:
        #     thresholds = self.repo.get_by_project(db, project_id)
        thresholds = self.repo.get_by_project(db, project_id)

        threshold_map = {t.kpi_name: t for t in thresholds if t.kpi_name}
        alerts: List[KpiAlertLevel] = []

        for kpi_name, value in kpi_values.items():

            if value is None:
                alerts.append(KpiAlertLevel(
                    kpi_name=kpi_name, value=None,
                    warning_value=0.0, critical_value=0.0,
                    level="unknown", color="gray",
                ))
                continue

            if kpi_name not in threshold_map:
                alerts.append(KpiAlertLevel(
                    kpi_name=kpi_name, value=value,
                    warning_value=0.0, critical_value=0.0,
                    level="ok", color="green",
                ))
                continue

            t = threshold_map[kpi_name]
            level, color = self._evaluate_level(kpi_name, value, t.warning_value, t.critical_value)

            alerts.append(KpiAlertLevel(
                kpi_name          = kpi_name,
                kpi_code          = t.kpi_name,
                value             = value,
                warning_value     = t.warning_value,
                critical_value    = t.critical_value,
                level             = level,
                color             = color,
                # DISABLED: Dashboard functionality removed
                # dashboard_id      = t.dashboard_id,
                kpi_definition_id = t.kpi_definition_id,
            ))

        return alerts

    @staticmethod
    def _evaluate_level(
        kpi_name: str, value: float, warning: float, critical: float
    ) -> tuple:
        """Retourne (level, color) selon le sens du KPI."""
        if kpi_name in HIGHER_IS_WORSE:
            if value >= critical: return "critical", "red"
            if value >= warning:  return "warning",  "yellow"
            return "ok", "green"
        elif kpi_name in LOWER_IS_WORSE:
            if value <= critical: return "critical", "red"
            if value <= warning:  return "warning",  "yellow"
            return "ok", "green"
        else:  # NEUTRAL (NB_COMMITS_PROJECT)
            if value >= critical: return "critical", "red"
            if value >= warning:  return "warning",  "yellow"
            return "ok", "green"

    # =========================================================================
    # CREATE ALERTS FROM SNAPSHOT
    # =========================================================================

    def create_alerts_from_snapshot(
        self,
        db:              Session,
        kpi_snapshot_id: int,
        project_id:      int,
        kpi_values:      dict,
        dashboard_id:    Optional[int] = None,
    ) -> int:
        """
        Crée des Alert pour chaque dépassement de seuil détecté.
        Appelé après chaque génération de KpiSnapshot.
        Retourne le nombre d'alertes créées.
        """
        alert_levels = self.evaluate_kpis(db, project_id, kpi_values, dashboard_id)

        # DISABLED: Dashboard functionality removed
        # if dashboard_id is not None:
        #     thresholds = self.repo.get_by_dashboard(db, dashboard_id)
        # else:
        #     thresholds = self.repo.get_by_project(db, project_id)
        thresholds = self.repo.get_by_project(db, project_id)

        threshold_map = {t.kpi_name: t for t in thresholds if t.kpi_name}
        created = 0

        for alert_level in alert_levels:
            if alert_level.level not in ("warning", "critical"):
                continue

            kpi_name = alert_level.kpi_name
            if kpi_name not in threshold_map:
                continue

            t     = threshold_map[kpi_name]
            level = (
                AlertLevelEnum.CRITICAL
                if alert_level.level == "critical"
                else AlertLevelEnum.WARNING
            )
            threshold_value = (
                t.critical_value if alert_level.level == "critical" else t.warning_value
            )

            self.alert_repo.create_alert(
                db              = db,
                threshold_id    = t.id,
                kpi_snapshot_id = kpi_snapshot_id,
                level           = level,
                kpi_value       = alert_level.value,
                threshold_value = threshold_value,
            )
            created += 1

        if created:
            db.flush()
            logger.info(
                f"Alerts created — {created} for snapshot_id={kpi_snapshot_id}"
            )

        return created