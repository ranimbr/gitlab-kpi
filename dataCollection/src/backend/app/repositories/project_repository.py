"""
repositories/project_repository.py
 
CORRECTION :
    get_all() ne supportait pas le filtre archived → appliqué en Python
    dans le router après chargement de tous les projets en mémoire.
    ✅ FIX : paramètre archived: Optional[bool] ajouté → filtre SQL direct.
"""
import logging
from typing import List, Optional
 
from sqlalchemy import func
from sqlalchemy.orm import Session
 
from app.models.commit import Commit
from app.models.project import Project
from app.repositories.base import BaseRepository
 
logger = logging.getLogger(__name__)
 
 
def _build_enrichment_maps(db: Session, project_ids: List[int]) -> dict:
    if not project_ids:
        return {}
    rows = (
        db.query(
            Commit.project_id,
            func.count(Commit.id).label("commit_count"),
            func.count(func.distinct(Commit.developer_id)).label("contributor_count"),
            func.max(Commit.authored_date).label("last_commit_date"),
        )
        .filter(
            Commit.project_id.in_(project_ids),
            Commit.developer_id.isnot(None),
        )
        .group_by(Commit.project_id)
        .all()
    )
    return {
        r.project_id: {
            "commit_count":      r.commit_count,
            "contributor_count": r.contributor_count,
            "last_commit_date":  r.last_commit_date,
        }
        for r in rows
    }
 
 
def _apply_enrichment(project: Project, enrichment_map: dict) -> Project:
    data = enrichment_map.get(project.id, {})
    project.commit_count      = data.get("commit_count",      0)
    project.contributor_count = data.get("contributor_count", 0)
    project.last_commit_date  = data.get("last_commit_date",  None)
    return project
 
 
class ProjectRepository(BaseRepository[Project]):
 
    def __init__(self):
        super().__init__(Project)
 
    def get_all(
        self,
        db:          Session,
        active_only: bool           = True,
        archived:    Optional[bool] = None,   # ✅ NOUVEAU — filtre SQL
    ) -> List[Project]:
        """
        Liste les projets avec enrichissement commit/contributor.
 
        ✅ FIX : archived filtre directement en SQL.
            archived=None    → pas de filtre (tous)
            archived=True    → projets archivés seulement
            archived=False   → projets non archivés seulement
        """
        q = db.query(Project)
 
        if active_only:
            q = q.filter(
                Project.is_active.is_(True),
                Project.archived.is_(False),
            )
 
        # ✅ FIX : filtre SQL au lieu de boucle Python dans le router
        if archived is not None:
            q = q.filter(Project.archived.is_(archived))
 
        projects = q.all()
        if not projects:
            return []
 
        enrichment_map = _build_enrichment_maps(db, [p.id for p in projects])
        return [_apply_enrichment(p, enrichment_map) for p in projects]
 
    def get_by_id(self, db: Session, project_id: int) -> Optional[Project]:
        project = db.query(Project).filter(Project.id == project_id).first()
        if project:
            _apply_enrichment(project, _build_enrichment_maps(db, [project.id]))
        return project
 
    def get_by_gitlab_id(self, db: Session, gitlab_project_id: int) -> Optional[Project]:
        project = db.query(Project).filter(
            Project.gitlab_project_id == gitlab_project_id
        ).first()
        if project:
            _apply_enrichment(project, _build_enrichment_maps(db, [project.id]))
        return project
 
    def get_by_gitlab_config(self, db: Session, gitlab_config_id: int) -> List[Project]:
        projects = db.query(Project).filter(
            Project.gitlab_config_id == gitlab_config_id
        ).all()
        if not projects:
            return []
        enrichment_map = _build_enrichment_maps(db, [p.id for p in projects])
        return [_apply_enrichment(p, enrichment_map) for p in projects]
 
    def get_by_site_id(self, db: Session, site_id: int) -> List[Project]:
        projects = db.query(Project).filter(Project.site_id == site_id).all()
        if not projects:
            return []
        enrichment_map = _build_enrichment_maps(db, [p.id for p in projects])
        return [_apply_enrichment(p, enrichment_map) for p in projects]
 
    def create(self, db: Session, data: dict) -> Project:
        project = Project(**data)
        db.add(project)
        db.flush()
        _apply_enrichment(project, _build_enrichment_maps(db, [project.id]))
        return project
 
    def update(self, db: Session, project_id: int, data: dict) -> Optional[Project]:
        project = db.query(Project).filter(Project.id == project_id).first()
        if project:
            for k, v in data.items():
                setattr(project, k, v)
            db.flush()
            _apply_enrichment(project, _build_enrichment_maps(db, [project.id]))
        return project
 
    def delete(self, db: Session, project_id: int) -> bool:
        project = db.query(Project).filter(Project.id == project_id).first()
        if project:
            db.delete(project)
            db.flush()
            return True
        return False