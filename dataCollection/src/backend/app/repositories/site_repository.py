"""repositories/site_repository.py — inchangé fonctionnellement."""
from typing import Optional, List
from sqlalchemy.orm import Session
from app.models.site import Site
from app.repositories.base import BaseRepository


class SiteRepository(BaseRepository[Site]):

    def __init__(self):
        super().__init__(Site)

    def get_by_name(self, db: Session, name: str) -> Optional[Site]:
        return db.query(Site).filter(Site.name == name).one_or_none()

    def get_active_sites(self, db: Session) -> List[Site]:
        return (
            db.query(Site)
            .filter(Site.is_active.is_(True))
            .order_by(Site.name)
            .all()
        )

    def get_by_country(self, db: Session, country: str) -> List[Site]:
        return (
            db.query(Site)
            .filter(Site.country == country)
            .order_by(Site.name)
            .all()
        )

    def name_exists(self, db: Session, name: str) -> bool:
        return db.query(Site.id).filter(Site.name == name).first() is not None