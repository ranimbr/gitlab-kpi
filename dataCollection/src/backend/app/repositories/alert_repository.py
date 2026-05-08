"""
repositories/alert_repository.py


"""
from datetime import datetime, timezone
from typing import Optional, List

from sqlalchemy import func
from sqlalchemy.orm import Session, joinedload

from app.models.alert import Alert, AlertLevelEnum
from app.models.kpi_snapshot import KpiSnapshot
from app.models.kpi_threshold import KpiThreshold
from app.repositories.base import BaseRepository


class AlertRepository(BaseRepository[Alert]):

    def __init__(self):
        super().__init__(Alert)

    # ── READ ──────────────────────────────────────────────────────────────────

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

    def get_by_developer(
        self,
        db:              Session,
        developer_id:    int,
        unresolved_only: bool = False,
    ) -> List[Alert]:
        """
        ✅ AJOUT : alertes d'un développeur spécifique.
        Retournées par GET /alerts/developer/{developer_id}.
        """
        q = db.query(Alert).filter(Alert.developer_id == developer_id)
        if unresolved_only:
            q = q.filter(Alert.is_resolved.is_(False))
        return q.order_by(Alert.triggered_at.desc()).all()

    def get_active_alerts(
        self,
        db:           Session,
        project_id:   Optional[int]            = None,
        dashboard_id: Optional[int]            = None,
        level:        Optional[AlertLevelEnum] = None,
        site_id:      Optional[int]            = None,
        # ✅ AJOUT : filtre par développeur
        developer_id: Optional[int]            = None,
        limit:        int                      = 100,
        offset:       int                      = 0,
    ) -> List[Alert]:
        """Alertes non résolues, multi-critères."""
        q = (
            db.query(Alert)
            .options(
                joinedload(Alert.acknowledger),
                joinedload(Alert.developer),
                joinedload(Alert.threshold).joinedload(KpiThreshold.project),
            )
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
        # ✅ AJOUT : filtre développeur
        if developer_id is not None:
            q = q.filter(Alert.developer_id == developer_id)

        return (
            q.order_by(Alert.triggered_at.desc())
            .limit(limit)
            .offset(offset)
            .all()
        )

    def count_active(
        self,
        db:           Session,
        project_id:   Optional[int] = None,
        developer_id: Optional[int] = None,
    ) -> int:
        """Nombre total d'alertes non résolues — pour la topbar."""
        q = db.query(func.count(Alert.id)).filter(Alert.is_resolved.is_(False))
        if project_id is not None:
            q = (
                q.join(KpiThreshold, Alert.threshold_id == KpiThreshold.id)
                .filter(KpiThreshold.project_id == project_id)
            )
        if developer_id is not None:
            q = q.filter(Alert.developer_id == developer_id)
        return q.scalar() or 0

    def count_active_by_level(
        self,
        db:           Session,
        project_id:   Optional[int] = None,
        dashboard_id: Optional[int] = None,
        developer_id: Optional[int] = None,
    ) -> dict:
        """Résumé topbar — { WARNING: n, CRITICAL: n }."""
        q = (
            db.query(Alert.level, func.count(Alert.id))
            .join(KpiThreshold, Alert.threshold_id == KpiThreshold.id)
            .filter(Alert.is_resolved.is_(False))
        )
        if project_id is not None:
            q = q.filter(KpiThreshold.project_id == project_id)
        if dashboard_id is not None:
            q = q.filter(KpiThreshold.dashboard_id == dashboard_id)
        # ✅ AJOUT
        if developer_id is not None:
            q = q.filter(Alert.developer_id == developer_id)

        rows   = q.group_by(Alert.level).all()
        result = {AlertLevelEnum.WARNING: 0, AlertLevelEnum.CRITICAL: 0}
        for level, count in rows:
            result[level] = count
        return result

    def get_summary_for_developer(
        self,
        db:           Session,
        developer_id: int,
    ) -> dict:
        """
        ✅ AJOUT : résumé des alertes actives d'un développeur.
        Utilisé dans la page profil développeur.
        Retourne { total_active, total_warning, total_critical, last_alert_at }
        """
        counts = self.count_active_by_level(db, developer_id=developer_id)
        total  = sum(counts.values())

        last_alert = (
            db.query(Alert)
            .filter(
                Alert.developer_id == developer_id,
                Alert.is_resolved.is_(False),
            )
            .order_by(Alert.triggered_at.desc())
            .first()
        )

        return {
            "total_active":   total,
            "total_warning":  counts.get(AlertLevelEnum.WARNING,  0),
            "total_critical": counts.get(AlertLevelEnum.CRITICAL, 0),
            "last_alert_at":  last_alert.triggered_at if last_alert else None,
            "last_alert":     last_alert,
        }

    # ── WRITE ─────────────────────────────────────────────────────────────────

    def create_alert(
        self,
        db:              Session,
        threshold_id:    int,
        kpi_snapshot_id: int,
        level:           AlertLevelEnum,
        kpi_value:       float,
        threshold_value: float,
        # ✅ AJOUT : développeur concerné (nullable)
        developer_id:    Optional[int] = None,
    ) -> Alert:
        alert = Alert(
            threshold_id    = threshold_id,
            kpi_snapshot_id = kpi_snapshot_id,
            level           = level,
            kpi_value       = kpi_value,
            threshold_value = threshold_value,
            triggered_at    = datetime.now(timezone.utc),
            is_resolved     = False,
            developer_id    = developer_id,
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