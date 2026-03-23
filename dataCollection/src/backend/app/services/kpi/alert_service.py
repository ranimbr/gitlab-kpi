"""
services/kpi/alert_service.py

"""
import logging
from typing import List, Optional

from fastapi import HTTPException, status
from sqlalchemy.orm import Session

from app.models.alert import Alert, AlertLevelEnum
from app.repositories.alert_repository import AlertRepository
from app.schemas.alert import AlertSummaryResponse

logger = logging.getLogger(__name__)


class AlertService:

    def __init__(self):
        self.alert_repo = AlertRepository()

    def get_active_alerts(
        self,
        db:           Session,
        project_id:   Optional[int]            = None,
        dashboard_id: Optional[int]            = None,
        level:        Optional[AlertLevelEnum] = None,
        site_id:      Optional[int]            = None,
    ) -> List[Alert]:
        return self.alert_repo.get_active_alerts(
            db, project_id=project_id, dashboard_id=dashboard_id,
            level=level, site_id=site_id,
        )

    def get_alert_summary(
        self,
        db:           Session,
        project_id:   Optional[int] = None,
        dashboard_id: Optional[int] = None,
    ) -> AlertSummaryResponse:
        """
        Résumé des alertes actives — topbar du dashboard.
        ✅ FIX : COUNT direct en DB, pas de chargement en mémoire.
        """
        counts       = self.alert_repo.count_active_by_level(db, project_id, dashboard_id)
        total_active = sum(counts.values())

        # ✅ FIX : COUNT SQL direct au lieu de get_all() + filter en Python
        from sqlalchemy import func
        from app.models.alert import Alert as AlertModel
        total_resolved = (
            db.query(func.count(AlertModel.id))
            .filter(AlertModel.is_resolved.is_(True))
            .scalar() or 0
        )

        # Dernière alerte critique non résolue (pour le badge urgent)
        last_critical = (
            db.query(AlertModel.triggered_at)
            .filter(
                AlertModel.is_resolved.is_(False),
                AlertModel.level == AlertLevelEnum.CRITICAL,
            )
            .order_by(AlertModel.triggered_at.desc())
            .first()
        )

        return AlertSummaryResponse(
            total_active    = total_active,
            total_warning   = counts.get(AlertLevelEnum.WARNING,  0),
            total_critical  = counts.get(AlertLevelEnum.CRITICAL, 0),
            total_resolved  = total_resolved,
            last_critical_at = last_critical[0] if last_critical else None,
        )

    def acknowledge_alert(
        self,
        db:          Session,
        alert_id:    int,
        user_id:     int,
        is_resolved: bool = False,
    ) -> Alert:
        alert = self.alert_repo.get_by_id(db, alert_id)
        if not alert:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Alerte introuvable.",
            )
        self.alert_repo.acknowledge(db, alert, user_id, is_resolved)
        db.commit()
        db.refresh(alert)
        logger.info(f"Alert acknowledged — id={alert_id} by user_id={user_id}")
        return alert

    def resolve_alert(self, db: Session, alert_id: int) -> Alert:
        alert = self.alert_repo.get_by_id(db, alert_id)
        if not alert:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Alerte introuvable.",
            )
        self.alert_repo.resolve(db, alert)
        db.commit()
        db.refresh(alert)
        logger.info(f"Alert resolved — id={alert_id}")
        return alert