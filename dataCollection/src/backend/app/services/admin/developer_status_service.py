"""
services/admin/developer_status_service.py

[ENTERPRISE GRADE] Service de gestion des statuts RH des développeurs.

Règles métier :
- RG-01 : Chaque changement est tracé dans developer_status_history (immuable)
- RG-02 : Règle des 15 jours → un dev est compté dans le headcount d'une période
          s'il a été actif >= 15 jours dans cette période
- RG-03 : Les snapshots des périodes clôturées ne peuvent pas être modifiés
- RG-04 : Un OFFBOARDED ne peut pas être réactivé (requiert un nouvel onboarding)
"""

import calendar
from datetime import date, datetime, timezone
from typing import Optional

from sqlalchemy.orm import Session

from app.models.developer import Developer
from app.models.developer_status_history import DeveloperStatusHistory, DeveloperStatusEnum
from app.models.period import Period, PeriodStatusEnum


class DeveloperStatusService:

    # ── RG-02 : Règle des 15 jours ───────────────────────────────────────────
    HEADCOUNT_MIN_DAYS = 15

    def change_status(
        self,
        db:           Session,
        developer:    Developer,
        new_status:   DeveloperStatusEnum,
        changed_by_id: Optional[int],
        reason:       Optional[str] = None,
        period_id:    Optional[int] = None,
    ) -> DeveloperStatusHistory:
        """
        Change le statut RH d'un développeur avec audit trail complet.

        Actions :
        1. Détermine le statut précédent depuis le dernier historique
        2. Valide la transition (OFFBOARDED → rien sauf admin)
        3. Met à jour Developer.is_active et offboarding_date
        4. Insère un enregistrement dans developer_status_history
        """
        # RG-04 : OFFBOARDED ne peut pas être réactivé directement
        last = self._get_last_status(db, developer.id)
        if last == DeveloperStatusEnum.OFFBOARDED and new_status == DeveloperStatusEnum.ACTIVE:
            raise ValueError(
                "Un développeur OFFBOARDED ne peut pas être directement réactivé. "
                "Créez un nouvel onboarding ou contactez l'administrateur."
            )

        # Mise à jour du modèle Developer
        today = date.today()
        if new_status == DeveloperStatusEnum.ACTIVE:
            developer.is_active = True
            # Si c'était un retour de congé/suspension, on efface l'offboarding
            if last in (DeveloperStatusEnum.ON_LEAVE, DeveloperStatusEnum.SUSPENDED):
                developer.offboarding_date = None
        else:
            developer.is_active = False
            if new_status == DeveloperStatusEnum.OFFBOARDED:
                developer.offboarding_date = today

        # Création de l'entrée d'historique (immuable)
        entry = DeveloperStatusHistory(
            developer_id    = developer.id,
            period_id       = period_id,
            changed_by_id   = changed_by_id,
            previous_status = last,
            new_status      = new_status,
            reason          = reason,
            changed_at      = datetime.now(timezone.utc),
        )
        db.add(entry)
        db.flush()
        return entry

    def compute_headcount(
        self,
        db:        Session,
        period:    Period,
    ) -> int:
        """
        [RG-02] Calcule l'effectif d'une période en appliquant la règle des 15 jours.

        Un développeur est compté si :
        1. Son onboarding_date <= fin de période (il était connu avant la fin du mois)
        2. Son offboarding_date est NULL ou >= (début + 15 jours)
           → il a été actif au moins 15 jours dans la période

        C'est ce chiffre qui sera figé dans period.headcount_snapshot lors de la clôture.
        """
        _, last_day = calendar.monthrange(period.year, period.month)
        p_start = date(period.year, period.month, 1)
        p_end   = date(period.year, period.month, last_day)
        threshold_date = date(period.year, period.month, self.HEADCOUNT_MIN_DAYS)

        from app.models.developer import Developer as DevModel
        from sqlalchemy import or_, and_

        from app.models.developer_site import DeveloperSite
        from sqlalchemy import exists

        count = (
            db.query(DevModel)
            .filter(
                DevModel.is_bot.is_(False),
                # Doit avoir un segment de site actif durant la période (SCD2/Suspensions)
                exists().where(
                    and_(
                        DeveloperSite.developer_id == DevModel.id,
                        DeveloperSite.start_date <= p_end,
                        or_(
                            DeveloperSite.end_date.is_(None),
                            DeveloperSite.end_date >= p_start
                        )
                    )
                ),
                # Doit avoir rejoint avant ou pendant la période
                or_(
                    DevModel.onboarding_date.is_(None),
                    DevModel.onboarding_date <= p_end
                ),
                # Doit être resté au moins 15 jours (règle SAP/Workday)
                or_(
                    DevModel.offboarding_date.is_(None),
                    DevModel.offboarding_date >= threshold_date
                ),
            )
            .count()
        )
        return count

    def freeze_headcount(
        self,
        db:     Session,
        period: Period,
    ) -> int:
        """
        [RG-03] Fige le headcount dans period.headcount_snapshot.
        Appelé automatiquement lors d'une extraction MONTHLY.
        """
        if period.headcount_snapshot is not None:
            # Déjà figé → on retourne la valeur existante (immuabilité)
            return period.headcount_snapshot

        count = self.compute_headcount(db, period)
        period.headcount_snapshot = count
        db.flush()
        return count

    def get_headcount_for_kpi(
        self,
        db:     Session,
        period: Period,
    ) -> int:
        """
        Retourne l'effectif à utiliser pour les calculs KPI.
        - Si période clôturée → snapshot figé (immuable)
        - Si période ouverte  → calcul dynamique (temps réel)
        """
        if period.status == PeriodStatusEnum.closed and period.headcount_snapshot is not None:
            return period.headcount_snapshot
        return self.compute_headcount(db, period)

    # ── Méthodes privées ──────────────────────────────────────────────────────

    def _get_last_status(
        self,
        db:           Session,
        developer_id: int,
    ) -> Optional[DeveloperStatusEnum]:
        """Récupère le dernier statut connu du développeur depuis l'historique."""
        last_entry = (
            db.query(DeveloperStatusHistory)
            .filter(DeveloperStatusHistory.developer_id == developer_id)
            .order_by(DeveloperStatusHistory.changed_at.desc())
            .first()
        )
        if last_entry:
            return last_entry.new_status
        return None


# Singleton pour injection
developer_status_service = DeveloperStatusService()
