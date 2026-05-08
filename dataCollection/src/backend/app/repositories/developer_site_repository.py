"""
repositories/developer_site_repository.py

"""
from datetime import datetime, timezone
from typing import List, Optional

from sqlalchemy.orm import Session, joinedload

from app.models.developer_site import DeveloperSite
from app.models.developer import Developer
from app.repositories.base import BaseRepository


class DeveloperSiteRepository(BaseRepository[DeveloperSite]):

    def __init__(self):
        super().__init__(DeveloperSite)

    # ── READ ──────────────────────────────────────────────────────────────────

    def get_by_developer(
        self,
        db:           Session,
        developer_id: int,
    ) -> List[DeveloperSite]:
        """Tous les sites d'un développeur."""
        return (
            db.query(DeveloperSite)
            .filter(DeveloperSite.developer_id == developer_id)
            .all()
        )

    def get_by_site(
        self,
        db:      Session,
        site_id: int,
    ) -> List[DeveloperSite]:
        """Toutes les associations développeur d'un site."""
        return (
            db.query(DeveloperSite)
            .filter(DeveloperSite.site_id == site_id)
            .all()
        )

    def get_association(
        self,
        db:           Session,
        developer_id: int,
        site_id:      int,
    ) -> Optional[DeveloperSite]:
        return (
            db.query(DeveloperSite)
            .filter(
                DeveloperSite.developer_id == developer_id,
                DeveloperSite.site_id      == site_id,
            )
            .one_or_none()
        )

    def get_primary_site(
        self,
        db:           Session,
        developer_id: int,
    ) -> Optional[DeveloperSite]:
        """Site primaire d'un développeur (is_primary=True)."""
        return (
            db.query(DeveloperSite)
            .filter(
                DeveloperSite.developer_id == developer_id,
                DeveloperSite.is_primary.is_(True),
            )
            .one_or_none()
        )

    def get_primary_site_id(
        self,
        db:           Session,
        developer_id: int,
    ) -> Optional[int]:
        """ID du site primaire — pour les agrégations KPI."""
        assoc = self.get_primary_site(db, developer_id)
        return assoc.site_id if assoc else None

    def get_site_ids_for_developer(
        self,
        db:           Session,
        developer_id: int,
    ) -> List[int]:
        """IDs de tous les sites d'un développeur."""
        return [
            row.site_id
            for row in db.query(DeveloperSite.site_id)
            .filter(DeveloperSite.developer_id == developer_id)
            .all()
        ]

    def get_developer_ids_for_site(
        self,
        db:      Session,
        site_id: int,
    ) -> List[int]:
        """
        IDs de tous les développeurs affectés à un site.
        Utilisé pour les filtres KPI par site.
        """
        return [
            row.developer_id
            for row in db.query(DeveloperSite.developer_id)
            .filter(DeveloperSite.site_id == site_id)
            .all()
        ]

    def count_active_for_site(
        self,
        db:          Session,
        site_id:     int,
        primary_only: bool = False,
    ) -> int:
        """
        Nombre de développeurs actifs, validés, non-bots d'un site.
        Utilisé comme dénominateur dans KPI #1 (MR Rate) et #5 (Commit Rate).

        primary_only=True → compte uniquement les devs dont ce site est primaire
        primary_only=False → compte tous les devs associés au site (primaire ou non)
        """
        q = (
            db.query(DeveloperSite)
            .join(Developer, DeveloperSite.developer_id == Developer.id)
            .filter(
                DeveloperSite.site_id == site_id,
                Developer.is_active.is_(True),
                Developer.is_validated.is_(True),
                Developer.is_bot.is_(False),
            )
        )
        if primary_only:
            q = q.filter(DeveloperSite.is_primary.is_(True))
        return q.count()

    def exists(
        self,
        db:           Session,
        developer_id: int,
        site_id:      int,
    ) -> bool:
        return (
            db.query(DeveloperSite.developer_id)
            .filter(
                DeveloperSite.developer_id == developer_id,
                DeveloperSite.site_id      == site_id,
            )
            .first() is not None
        )

    # ── WRITE ─────────────────────────────────────────────────────────────────

    def add(
        self,
        db:           Session,
        developer_id: int,
        site_id:      int,
        is_primary:   bool = False,
    ) -> DeveloperSite:
        """
        Ajoute un développeur à un site.
        Si is_primary=True → retire d'abord is_primary des autres sites.
        Si l'association existe déjà → met à jour is_primary.
        """
        if is_primary:
            # Retirer is_primary des autres associations
            self._clear_primary(db, developer_id)

        existing = self.get_association(db, developer_id, site_id)
        if existing:
            existing.is_primary = is_primary
            db.flush()
            return existing

        assoc = DeveloperSite(
            developer_id = developer_id,
            site_id      = site_id,
            is_primary   = is_primary,
        )
        db.add(assoc)
        db.flush()
        return assoc

    def remove(
        self,
        db:           Session,
        developer_id: int,
        site_id:      int,
    ) -> bool:
        """Supprime l'association (DELETE physique pour les sites — pas d'historique métier)."""
        assoc = self.get_association(db, developer_id, site_id)
        if not assoc:
            return False
        db.delete(assoc)
        db.flush()
        return True

    def set_primary(
        self,
        db:           Session,
        developer_id: int,
        site_id:      int,
    ) -> Optional[DeveloperSite]:
        """
        Définit un site comme site primaire d'un développeur.
        Retire automatiquement is_primary des autres sites.
        """
        self._clear_primary(db, developer_id)
        assoc = self.get_association(db, developer_id, site_id)
        if not assoc:
            return None
        assoc.is_primary = True
        db.flush()
        return assoc

    def sync(
        self,
        db:           Session,
        developer_id: int,
        site_associations: List[dict],
    ) -> List[DeveloperSite]:
        """
        Synchronise la liste des sites d'un développeur.
        site_associations = [{"site_id": 1, "is_primary": True}, ...]

        - Ajoute les nouveaux sites
        - Supprime ceux qui ne sont plus dans la liste
        - Met à jour is_primary
        Retourne la liste finale des associations.
        """
        desired_map = {a["site_id"]: a.get("is_primary", False) for a in site_associations}
        current     = self.get_by_developer(db, developer_id)
        current_ids = {a.site_id for a in current}

        # Supprimer les sites retirés
        for assoc in current:
            if assoc.site_id not in desired_map:
                db.delete(assoc)

        # Ajouter ou mettre à jour
        has_primary = any(v for v in desired_map.values())
        for site_id, is_primary in desired_map.items():
            existing = next((a for a in current if a.site_id == site_id), None)
            if existing:
                existing.is_primary = is_primary
            else:
                db.add(DeveloperSite(
                    developer_id = developer_id,
                    site_id      = site_id,
                    is_primary   = is_primary,
                ))

        db.flush()
        return self.get_by_developer(db, developer_id)

    # ── PRIVATE ───────────────────────────────────────────────────────────────

    def _clear_primary(self, db: Session, developer_id: int) -> None:
        """Retire is_primary=True de tous les sites d'un développeur."""
        db.query(DeveloperSite).filter(
            DeveloperSite.developer_id == developer_id,
            DeveloperSite.is_primary.is_(True),
        ).update({"is_primary": False}, synchronize_session="fetch")