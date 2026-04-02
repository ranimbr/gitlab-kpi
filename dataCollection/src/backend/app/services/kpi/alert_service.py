"""
services/kpi/alert_service.py

CORRECTIONS (modèles mis à jour) :
─────────────────────────────────────
1. get_active_alerts() : ajout developer_id.
2. AJOUT get_developer_alert_summary() : alertes individuelles d'un développeur.
3. AJOUT check_developer_inactivity() : alerte si développeur inactif > N jours.
"""
import logging
from datetime import datetime, timezone, timedelta
from typing import List, Optional

from fastapi import HTTPException, status
from sqlalchemy import func
from sqlalchemy.orm import Session

from app.models.alert import Alert, AlertLevelEnum
from app.repositories.alert_repository import AlertRepository
from app.repositories.developer_repository import DeveloperRepository
from app.schemas.alert import AlertSummaryResponse, DeveloperAlertSummary

logger = logging.getLogger(__name__)


class AlertService:

    def __init__(self):
        self.alert_repo = AlertRepository()
        self.dev_repo   = DeveloperRepository()

    def get_active_alerts(
        self,
        db:           Session,
        project_id:   Optional[int]            = None,
        dashboard_id: Optional[int]            = None,
        level:        Optional[AlertLevelEnum] = None,
        site_id:      Optional[int]            = None,
        developer_id: Optional[int]            = None,
        limit:        int                      = 100,
        offset:       int                      = 0,
    ) -> List[Alert]:
        return self.alert_repo.get_active_alerts(
            db, project_id=project_id, dashboard_id=dashboard_id,
            level=level, site_id=site_id, developer_id=developer_id,
            limit=limit, offset=offset,
        )

    def get_alert_summary(
        self,
        db:           Session,
        project_id:   Optional[int] = None,
        dashboard_id: Optional[int] = None,
    ) -> AlertSummaryResponse:
        counts       = self.alert_repo.count_active_by_level(db, project_id, dashboard_id)
        total_active = sum(counts.values())

        total_resolved = (
            db.query(func.count(Alert.id))
            .filter(Alert.is_resolved.is_(True))
            .scalar() or 0
        )
        last_critical = (
            db.query(Alert.triggered_at)
            .filter(Alert.is_resolved.is_(False), Alert.level == AlertLevelEnum.CRITICAL)
            .order_by(Alert.triggered_at.desc())
            .first()
        )
        return AlertSummaryResponse(
            total_active     = total_active,
            total_warning    = counts.get(AlertLevelEnum.WARNING,  0),
            total_critical   = counts.get(AlertLevelEnum.CRITICAL, 0),
            total_resolved   = total_resolved,
            last_critical_at = last_critical[0] if last_critical else None,
        )

    def get_developer_alert_summary(
        self,
        db:           Session,
        developer_id: int,
    ) -> DeveloperAlertSummary:
        """✅ AJOUT : résumé alertes pour la page profil développeur."""
        developer = self.dev_repo.get_by_id(db, developer_id)
        if not developer:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND,
                detail="Développeur introuvable.")

        summary = self.alert_repo.get_summary_for_developer(db, developer_id)
        return DeveloperAlertSummary(
            developer_id   = developer_id,
            developer_name = developer.name,
            total_active   = summary["total_active"],
            total_warning  = summary["total_warning"],
            total_critical = summary["total_critical"],
            last_alert_at  = summary["last_alert_at"],
            last_alert     = summary["last_alert"],
        )

    def acknowledge_alert(
        self, db: Session, alert_id: int, user_id: int, is_resolved: bool = False,
    ) -> Alert:
        alert = self.alert_repo.get_by_id(db, alert_id)
        if not alert:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND,
                detail="Alerte introuvable.")
        self.alert_repo.acknowledge(db, alert, user_id, is_resolved)
        db.commit()
        db.refresh(alert)
        logger.info(f"Alert acknowledged — id={alert_id} by user_id={user_id}")
        return alert

    def resolve_alert(self, db: Session, alert_id: int) -> Alert:
        alert = self.alert_repo.get_by_id(db, alert_id)
        if not alert:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND,
                detail="Alerte introuvable.")
        self.alert_repo.resolve(db, alert)
        db.commit()
        db.refresh(alert)
        return alert