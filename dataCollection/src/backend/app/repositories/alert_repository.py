"""
repositories/alert_repository.py — inchangé fonctionnellement, nettoyé.
"""
from datetime import datetime, timezone
from typing import Optional, List

from sqlalchemy import func
from sqlalchemy.orm import Session

from app.models.alert import Alert, AlertLevelEnum
from app.repositories.base import BaseRepository


class AlertRepository(BaseRepository[Alert]):

    def __init__(self):
        super().__init__(Alert)

    def get_by_threshold(
        self,
        db:              Session,
        threshold_id:    int,
        unresolved_only: bool = False,
    ) -> List[Alert]:
        q = db.query(Alert).filter(Alert.threshold_id == threshold_id)
        if unresolved_only:
            q = q.filter(Alert.is_resolved.is_(False))
        return q.order_by(Alert.triggered_at.desc()).all()

    def get_by_snapshot(self, db: Session, kpi_snapshot_id: int) -> List[Alert]:
        return (
            db.query(Alert)
            .filter(Alert.kpi_snapshot_id == kpi_snapshot_id)
            .all()
        )

    def get_active_alerts(
        self,
        db:           Session,
        project_id:   Optional[int]            = None,
        dashboard_id: Optional[int]            = None,
        level:        Optional[AlertLevelEnum] = None,
        site_id:      Optional[int]            = None,
    ) -> List[Alert]:
        """Alertes non résolues, filtrables par projet, dashboard, niveau, site."""
        from app.models.kpi_threshold import KpiThreshold
        from app.models.kpi_snapshot  import KpiSnapshot

        q = (
            db.query(Alert)
            .join(KpiThreshold, Alert.threshold_id == KpiThreshold.id)
            .filter(Alert.is_resolved.is_(False))
        )
        if project_id is not None:
            q = q.filter(KpiThreshold.project_id == project_id)
        if dashboard_id is not None:
            q = q.filter(KpiThreshold.dashboard_id == dashboard_id)
        if level is not None:
            q = q.filter(Alert.level == level)
        if site_id is not None:
            q = (
                q.join(KpiSnapshot, Alert.kpi_snapshot_id == KpiSnapshot.id)
                .filter(KpiSnapshot.site_id == site_id)
            )
        return q.order_by(Alert.triggered_at.desc()).all()

    def count_active_by_level(
        self,
        db:           Session,
        project_id:   Optional[int] = None,
        dashboard_id: Optional[int] = None,
    ) -> dict:
        """Résumé topbar — { WARNING: n, CRITICAL: n }."""
        from app.models.kpi_threshold import KpiThreshold

        q = (
            db.query(Alert.level, func.count(Alert.id))
            .join(KpiThreshold, Alert.threshold_id == KpiThreshold.id)
            .filter(Alert.is_resolved.is_(False))
        )
        if project_id is not None:
            q = q.filter(KpiThreshold.project_id == project_id)
        if dashboard_id is not None:
            q = q.filter(KpiThreshold.dashboard_id == dashboard_id)

        rows   = q.group_by(Alert.level).all()
        result = {AlertLevelEnum.WARNING: 0, AlertLevelEnum.CRITICAL: 0}
        for level, count in rows:
            result[level] = count
        return result

    def create_alert(
        self,
        db:              Session,
        threshold_id:    int,
        kpi_snapshot_id: int,
        level:           AlertLevelEnum,
        kpi_value:       float,
        threshold_value: float,
    ) -> Alert:
        alert = Alert(
            threshold_id    = threshold_id,
            kpi_snapshot_id = kpi_snapshot_id,
            level           = level,
            kpi_value       = kpi_value,
            threshold_value = threshold_value,
            triggered_at    = datetime.now(timezone.utc),
            is_resolved     = False,
        )
        db.add(alert)
        db.flush()
        return alert

    def acknowledge(
        self,
        db:          Session,
        alert:       Alert,
        user_id:     int,
        is_resolved: bool = False,
    ) -> Alert:
        alert.acknowledged_by = user_id
        alert.acknowledged_at = datetime.now(timezone.utc)
        alert.is_resolved     = is_resolved
        db.flush()
        return alert

    def resolve(self, db: Session, alert: Alert) -> Alert:
        alert.is_resolved     = True
        alert.acknowledged_at = datetime.now(timezone.utc)
        db.flush()
        return alert