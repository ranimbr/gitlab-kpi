import logging
from typing import List, Optional

from sqlalchemy import func
from sqlalchemy.orm import Session

from app.models.commit import Commit
from app.models.developer import Developer
from app.models.project import Project

logger = logging.getLogger(__name__)


def _enrich_project(db: Session, project: Project) -> Project:
    project.commit_count = (
        db.query(func.count(Commit.id))
        .filter(Commit.project_id == project.id)
        .scalar() or 0
    )
    project.contributor_count = (
        db.query(func.count(func.distinct(Commit.developer_id)))
        .filter(
            Commit.project_id == project.id,
            Commit.developer_id.isnot(None),
        )
        .scalar() or 0
    )
    project.last_commit_date = (
        db.query(func.max(Commit.authored_date))
        .filter(Commit.project_id == project.id)
        .scalar()
    )
    return project


class ProjectRepository:

    # ─── Read ─────────────────────────────────────────────────────────────────

    def get_all(self, db: Session, active_only: bool = True) -> List[Project]:
        """
        Par défaut retourne uniquement les projets actifs et non archivés.
        active_only=False utilisé uniquement par AdminProjectsPage.
        """
        query = db.query(Project)
        if active_only:
            query = query.filter(
                Project.is_active.is_(True),
                Project.archived.is_(False),
            )
        projects = query.all()
        return [_enrich_project(db, p) for p in projects]

    def get_active_projects(self, db: Session) -> List[Project]:
        """
        Utilisé par MonthlyDumpService — projets actifs non archivés.
        """
        projects = (
            db.query(Project)
            .filter(
                Project.is_active.is_(True),
                Project.archived.is_(False),
            )
            .all()
        )
        return [_enrich_project(db, p) for p in projects]

    def get_by_id(self, db: Session, project_id: int) -> Optional[Project]:
        project = db.query(Project).filter(Project.id == project_id).first()
        if project:
            _enrich_project(db, project)
        return project

    def get_by_gitlab_id(
        self, db: Session, gitlab_project_id: int
    ) -> Optional[Project]:
        project = (
            db.query(Project)
            .filter(Project.gitlab_project_id == gitlab_project_id)
            .first()
        )
        if project:
            _enrich_project(db, project)
        return project

    def get_by_gitlab_config(
        self, db: Session, gitlab_config_id: int
    ) -> List[Project]:
        projects = (
            db.query(Project)
            .filter(Project.gitlab_config_id == gitlab_config_id)
            .all()
        )
        return [_enrich_project(db, p) for p in projects]

    # ─── Write ────────────────────────────────────────────────────────────────

    def create(self, db: Session, data: dict) -> Project:
        project = Project(**data)
        db.add(project)
        db.flush()
        _enrich_project(db, project)
        return project

    def update(self, db: Session, project_id: int, data: dict) -> Optional[Project]:
        project = db.query(Project).filter(Project.id == project_id).first()
        if project:
            for k, v in data.items():
                setattr(project, k, v)
            db.flush()
            _enrich_project(db, project)
        return project

    def delete(self, db: Session, project_id: int) -> bool:
        project = db.query(Project).filter(Project.id == project_id).first()
        if project:
            db.delete(project)
            db.flush()
            return True
        return False