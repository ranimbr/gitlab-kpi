from sqlalchemy.orm import Session
from typing import Optional, List

from app.models.dashboard import Dashboard
from app.models.dashboard_access import DashboardAccess
from app.repositories.base import BaseRepository


class DashboardRepository(BaseRepository[Dashboard]):

    def __init__(self):
        super().__init__(Dashboard)

    def get_by_project(
        self, db: Session, project_id: int
    ) -> List[Dashboard]:
        return (
            db.query(Dashboard)
            .filter(Dashboard.project_id == project_id)
            .all()
        )

    def get_accessible_by_user(
        self,
        db              : Session,
        user_id         : int,
        view_group      : Optional[str] = None
    ) -> List[Dashboard]:
        """
        Retourne les dashboards accessibles à un utilisateur :
        - Via DashboardAccess (accès individuel)
        - Via view_group (accès par groupe)
        """
        # Accès individuels
        individual = (
            db.query(Dashboard)
            .join(DashboardAccess, DashboardAccess.dashboard_id == Dashboard.id)
            .filter(DashboardAccess.user_id == user_id)
            .all()
        )

        ids_individual = {d.id for d in individual}

        # Accès par groupe
        group_dashboards = []
        if view_group:
            group_dashboards = (
                db.query(Dashboard)
                .filter(Dashboard.view_group == view_group)
                .all()
            )

        # Fusion sans doublons
        all_dashboards = list(individual)
        for d in group_dashboards:
            if d.id not in ids_individual:
                all_dashboards.append(d)

        return all_dashboards


class DashboardAccessRepository(BaseRepository[DashboardAccess]):

    def __init__(self):
        super().__init__(DashboardAccess)

    def get_by_user_and_dashboard(
        self,
        db          : Session,
        user_id     : int,
        dashboard_id: int
    ) -> Optional[DashboardAccess]:
        return (
            db.query(DashboardAccess)
            .filter(
                DashboardAccess.user_id      == user_id,
                DashboardAccess.dashboard_id == dashboard_id
            )
            .one_or_none()
        )

    def get_user_accesses(
        self, db: Session, user_id: int
    ) -> List[DashboardAccess]:
        return (
            db.query(DashboardAccess)
            .filter(DashboardAccess.user_id == user_id)
            .all()
        )

    def access_exists(
        self,
        db          : Session,
        user_id     : int,
        dashboard_id: int
    ) -> bool:
        return self.get_by_user_and_dashboard(db, user_id, dashboard_id) is not None