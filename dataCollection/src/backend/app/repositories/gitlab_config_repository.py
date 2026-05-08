"""
repositories/gitlab_config_repository.py 
"""
from typing import Optional, List
from sqlalchemy.orm import Session
from app.models.gitlab_config import GitLabConfig
from app.repositories.base import BaseRepository


class GitLabConfigRepository(BaseRepository[GitLabConfig]):

    def __init__(self):
        super().__init__(GitLabConfig)

    def get_by_domain(self, db: Session, domain: str) -> Optional[GitLabConfig]:
        return db.query(GitLabConfig).filter(GitLabConfig.domain == domain).one_or_none()

    def get_active_configs(self, db: Session) -> List[GitLabConfig]:
        return db.query(GitLabConfig).filter(GitLabConfig.is_active.is_(True)).all()

    def get_by_site_id(self, db: Session, site_id: int) -> List[GitLabConfig]:
        """Configs GitLab associées à un site."""
        return db.query(GitLabConfig).filter(GitLabConfig.site_id == site_id).all()

    def domain_exists(self, db: Session, domain: str) -> bool:
        return db.query(GitLabConfig.id).filter(GitLabConfig.domain == domain).first() is not None