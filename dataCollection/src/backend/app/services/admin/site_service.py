"""
services/admin/site_service.py

CORRECTION :
    update_site() utilisait model_dump(exclude_none=True) → impossible de mettre
    un champ à NULL (ex: country=None pour effacer la valeur).
    ✅ FIX : model_dump(exclude_unset=True) — ne passe que les champs
    réellement fournis dans la requête PATCH.
"""
import logging
from typing import List, Optional

from fastapi import HTTPException, status
from sqlalchemy.orm import Session

from app.models.site import Site
from app.repositories.site_repository import SiteRepository
from app.repositories.audit_log_repository import AuditLogRepository
from app.schemas.site import SiteCreate, SiteUpdate

logger = logging.getLogger(__name__)


class SiteService:

    def __init__(self):
        self.site_repo  = SiteRepository()
        self.audit_repo = AuditLogRepository()

    def create_site(
        self,
        db:         Session,
        payload:    SiteCreate,
        created_by: Optional[int] = None,
        ip_address: Optional[str] = None,
    ) -> Site:

        if self.site_repo.name_exists(db, payload.name):
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail=f"Un site avec le nom '{payload.name}' existe déjà.",
            )

        site = self.site_repo.create(db, payload.model_dump())

        self.audit_repo.log(
            db          = db,
            user_id     = created_by,
            action      = "CREATE_SITE",
            entity_type = "Site",
            entity_id   = site.id,
            entity_name = site.name,
            new_value   = {"name": site.name, "country": site.country},
            ip_address  = ip_address,
        )

        db.commit()
        db.refresh(site)
        logger.info(f"Site created — id={site.id} name={site.name}")
        return site

    def get_all_sites(self, db: Session, active_only: bool = True) -> List[Site]:
        if active_only:
            return self.site_repo.get_active_sites(db)
        return self.site_repo.get_all(db)

    def get_site(self, db: Session, site_id: int) -> Site:
        site = self.site_repo.get_by_id(db, site_id)
        if not site:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Site introuvable.",
            )
        return site

    def update_site(
        self,
        db:         Session,
        site_id:    int,
        payload:    SiteUpdate,
        updated_by: Optional[int] = None,
        ip_address: Optional[str] = None,
    ) -> Site:

        site = self.get_site(db, site_id)
        old_value = {
            "name":      site.name,
            "country":   site.country,
            "is_active": site.is_active,
        }

        # ✅ FIX : exclude_unset=True au lieu de exclude_none=True
        # Permet de mettre un champ à NULL si l'utilisateur envoie explicitement null
        # Ex : PATCH {"country": null} → efface le pays
        update_data = payload.model_dump(exclude_unset=True)
        self.site_repo.update(db, site, update_data)

        self.audit_repo.log(
            db          = db,
            user_id     = updated_by,
            action      = "UPDATE_SITE",
            entity_type = "Site",
            entity_id   = site_id,
            entity_name = site.name,
            old_value   = old_value,
            new_value   = update_data,
            ip_address  = ip_address,
        )

        db.commit()
        db.refresh(site)
        return site

    def delete_site(
        self,
        db:         Session,
        site_id:    int,
        deleted_by: Optional[int] = None,
        ip_address: Optional[str] = None,
    ) -> None:

        site = self.get_site(db, site_id)

        self.audit_repo.log(
            db          = db,
            user_id     = deleted_by,
            action      = "DELETE_SITE",
            entity_type = "Site",
            entity_id   = site_id,
            entity_name = site.name,
            old_value   = {"name": site.name},
            ip_address  = ip_address,
        )

        db.delete(site)
        db.commit()
        logger.info(f"Site deleted — id={site_id}")