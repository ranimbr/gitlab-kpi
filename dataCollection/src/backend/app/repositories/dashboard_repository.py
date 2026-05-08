"""
repositories/dashboard_repository.py — .

"""
from typing import Optional, List
from sqlalchemy.orm import Session, joinedload
from app.models.dashboard import Dashboard
from app.models.app_user import AppUser
from app.repositories.base import BaseRepository


class DashboardRepository(BaseRepository[Dashboard]):

    def __init__(self):
        super().__init__(Dashboard)

    def get_by_project(self, db: Session, project_id: int) -> List[Dashboard]:
        return (
            db.query(Dashboard)
            .options(joinedload(Dashboard.period_filters))
            .filter(Dashboard.project_id == project_id)
            .all()
        )

    def get_by_site_id(self, db: Session, site_id: int) -> List[Dashboard]:
        return db.query(Dashboard).filter(Dashboard.site_id == site_id).all()

    def get_public_dashboards(self, db: Session) -> List[Dashboard]:
        return db.query(Dashboard).filter(Dashboard.is_public.is_(True)).all()

    def get_accessible_by_user(self, db: Session, user_id: int) -> List[Dashboard]:
        """
        Dashboards accessibles à un user :
          - IDs dans AppUser.dashboard_access[] (ARRAY PostgreSQL)
          - OU is_public=True
        """
        user = db.query(AppUser).filter(AppUser.id == user_id).one_or_none()
        if not user:
            return []

        accessible_ids   = list(user.dashboard_access or [])
        private_dashboards: List[Dashboard] = []

        if accessible_ids:
            private_dashboards = (
                db.query(Dashboard)
                .filter(Dashboard.id.in_(accessible_ids))
                .all()
            )

        public_dashboards = db.query(Dashboard).filter(Dashboard.is_public.is_(True)).all()

        # Fusion sans doublons
        seen   = {d.id for d in private_dashboards}
        result = list(private_dashboards)
        for d in public_dashboards:
            if d.id not in seen:
                result.append(d)
        return result

    def get_by_creator(self, db: Session, created_by: int) -> List[Dashboard]:
        return db.query(Dashboard).filter(Dashboard.created_by == created_by).all()

    def create(self, db: Session, data: dict) -> Dashboard:
        dashboard = Dashboard(**data)
        db.add(dashboard)
        db.flush()
        return dashboard