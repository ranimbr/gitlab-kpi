"""
repositories/developer_site_repository.py

"""
from datetime import datetime, timezone, date, timedelta
from typing import List, Optional

import sqlalchemy as sa
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

    # ── WRITE ─────────────────────────────────────────────────────────────────

    def sync_smart(
        self,
        db:                Session,
        developer_id:      int,
        site_associations: list,
        p_start=None,
        p_end=None,
        mutation_date:     Optional[date] = None,
    ) -> None:
        """
        [ENTERPRISE SCD TYPE 2] Synchronisation intelligente avec gestion des MUTATIONS.
        """
        #  [SMART-DECISION] : Si aucune date n'est fournie, on favorisera une Correction (Case A)
        has_explicit_mutation_date = (mutation_date is not None)
        
        today = date.today()
        p_start_date = p_start
        if p_start and hasattr(p_start, "date"):
            p_start_date = p_start.date()

        # Fallback pour la date technique de l'opération
        mutation_date = mutation_date if mutation_date else (p_start_date if p_start_date else today)
        
        #  Onboarding Floor
        dev = db.get(Developer, developer_id)
        if dev and dev.onboarding_date:
            if mutation_date < dev.onboarding_date:
                mutation_date = dev.onboarding_date
        
        m_date = mutation_date
        close_date    = mutation_date - timedelta(days=1)

        # 1. Identification du site primaire actuel
        current_primary = db.query(DeveloperSite).filter(
            DeveloperSite.developer_id == developer_id,
            DeveloperSite.is_primary == True,
            (DeveloperSite.is_active == True) | (DeveloperSite.is_active == None)
        ).first()

        # 2. Récupération de la nouvelle configuration souhaitée
        new_primary_site_id = None
        for a in site_associations:
            is_p = a["is_primary"] if isinstance(a, dict) else getattr(a, "is_primary", False)
            if is_p:
                new_primary_site_id = a["site_id"] if isinstance(a, dict) else getattr(a, "site_id")
                break

        # 3. GESTION DE LA MUTATION / CORRECTION
        if new_primary_site_id:
            if current_primary:
                dev = db.get(Developer, developer_id)
                dev_onboarding = dev.onboarding_date if dev else today
                s_start = current_primary.start_date or dev_onboarding

                if current_primary.site_id != new_primary_site_id:
                    #  Mutation seulement si une date a été fournie ET qu'on est après le début
                    is_mutation = has_explicit_mutation_date and m_date > s_start
                    
                    if is_mutation:
                        current_primary.is_active = False
                        current_primary.end_date = close_date
                        db.add(DeveloperSite(
                            developer_id=developer_id,
                            site_id=new_primary_site_id,
                            is_primary=True,
                            is_active=True,
                            start_date=mutation_date,
                            end_date=None
                        ))
                    else:
                        current_primary.site_id = new_primary_site_id
                        if not current_primary.start_date or mutation_date < current_primary.start_date:
                            current_primary.start_date = mutation_date
                else:
                    current_primary.is_active = True
                    if not current_primary.start_date:
                        current_primary.start_date = s_start
            else:
                db.add(DeveloperSite(
                    developer_id=developer_id, site_id=new_primary_site_id,
                    is_primary=True, is_active=True, start_date=mutation_date, end_date=None
                ))

        # 4. Gestion des sites secondaires
        desired_site_ids = {a["site_id"] if isinstance(a, dict) else getattr(a, "site_id") for a in site_associations}
        current_sites = db.query(DeveloperSite).filter(
            DeveloperSite.developer_id == developer_id,
            DeveloperSite.is_active == True
        ).all()

        # 1. Clôture des anciens sites (Mutation)
        dev = db.get(Developer, developer_id)
        dev_onboarding = dev.onboarding_date if dev else today

        for s in current_sites:
            if s.site_id not in desired_site_ids:
                s_start = s.start_date or dev_onboarding
                if m_date > s_start:
                    s.is_active = False
                    s.end_date = close_date
                else:
                    # On ne supprime que si c'est vraiment un doublon créé aujourd'hui
                    db.delete(s)

        #  Reconstruction de la Timeline
        self._normalize_history(db, developer_id)
        
        db.flush()

    def _normalize_history(self, db: Session, developer_id: int) -> None:
        """
         Reconstruction et Normalisation de la Timeline.
        Assure une continuité parfaite (Zéro Gap) et fusionne les fragments.
        """
        # 1. Nettoyage initial des segments invalides
        db.execute(
            sa.text("DELETE FROM developer_site WHERE developer_id = :d_id AND (end_date < start_date OR site_id IS NULL)"),
            {"d_id": developer_id}
        )
        
        # 2. Récupération de l'historique primaire
        segments = db.query(DeveloperSite).filter(
            DeveloperSite.developer_id == developer_id,
            DeveloperSite.is_primary == True
        ).order_by(DeveloperSite.start_date.asc()).all()

        if not segments: return

        # Onboarding Floor (Ramener le premier segment à la date d'arrivée)
        dev = db.get(Developer, developer_id)
        if dev and dev.onboarding_date:
            first = segments[0]
            if first.start_date != dev.onboarding_date:
                first.start_date = dev.onboarding_date

        # 3. Réparation des Gaps et Fusion
        i = 0
        while i < len(segments) - 1:
            curr = segments[i]
            nxt  = segments[i+1]

            # Cas 1 : Même site ET segments contigus → On fusionne (Zéro fragmentation)
            # IMPORTANT : On ne fusionne QUE si les segments sont contigus (gap <= 1 jour).
            # Un gap > 1 jour = période de suspension intentionnelle → NE PAS fusionner.
            if curr.site_id == nxt.site_id:
                is_contiguous = (
                    curr.end_date is not None and
                    nxt.start_date is not None and
                    (nxt.start_date - curr.end_date).days <= 1
                )
                if is_contiguous:
                    curr.end_date = nxt.end_date
                    curr.is_active = nxt.is_active or curr.is_active
                    db.delete(nxt)
                    segments.pop(i+1)
                    continue
                # Sinon : gap de suspension → on laisse les deux segments séparés

            # Cas 2 : Site différent mais Trou (Gap) entre les deux
            # On ne ferme le gap QUE si c'est une mutation (changement de site).
            # Si c'est le même site, c'est une suspension intentionnelle, on préserve le gap !
            elif curr.site_id != nxt.site_id:
                gap_date = nxt.start_date - timedelta(days=1)
                # On ne comble le gap que s'il est petit, sinon c'est aussi une suspension
                if curr.end_date is None or (nxt.start_date - curr.end_date).days <= 30:
                    if curr.end_date != gap_date:
                        curr.end_date = gap_date
            
            i += 1

        # 4.  Fermeture de la boucle temporelle (Extension vers le futur)
        last = segments[-1]
        dev = db.get(Developer, developer_id)
        
        if dev and not dev.offboarding_date:
            #  On ne force la continuité QUE si le segment est déjà actif.
            if last.is_active and last.end_date is not None:
                last.end_date = None
        elif dev and dev.offboarding_date:
            if last.end_date != dev.offboarding_date:
                last.end_date = dev.offboarding_date
            last.is_active = False

        db.flush()