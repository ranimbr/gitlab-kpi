"""
utils/date_utils.py — Single Source of Truth for Period Date Ranges
────────────────────────────────────────────────────────────────────
Centralise la résolution des plages de dates de période.

RÈGLE ARCHITECTURE SENIOR (DRY) :
    Cette logique est partagée par tous les modules qui ont besoin
    de convertir une période (year, month) en plage de dates SQL.
    Tout changement de borne temporelle se fait ICI et ICI SEULEMENT.

DEUX VARIANTS DISPONIBLES :
    - Inclusif  : [Jan 1 00:00:00 ... Jan 31 23:59:59]  → utilisé par le routeur MR (<=)
    - Exclusif  : [Jan 1 00:00:00 ... Feb 1 00:00:00)   → utilisé par le KpiCalculator (<)
    Les deux sont mathématiquement équivalents pour les données sans microseconde.
"""
import calendar
import datetime
from typing import Optional, Tuple

from sqlalchemy.orm import Session


def get_period_date_range(
    year: int,
    month: int,
    tz: datetime.timezone = datetime.timezone.utc,
) -> Tuple[datetime.datetime, datetime.datetime]:
    """
    Retourne (start_dt, end_dt) INCLUSIF pour un mois calendaire donné.

    Bornes : [1er du mois 00:00:00 UTC  ←→  dernier jour 23:59:59 UTC]

    Utilisé par : GET /merge-requests, GET /commits (filtre <= end_dt)

    Args:
        year:  Année (ex: 2026)
        month: Mois (1-12)
        tz:    Timezone (UTC par défaut, conforme à GitLab)

    Returns:
        Tuple (start_dt, end_dt) avec timezone, bornes inclusives
    """
    start_dt = datetime.datetime(year, month, 1, 0, 0, 0, tzinfo=tz)
    last_day  = calendar.monthrange(year, month)[1]
    end_dt   = datetime.datetime(year, month, last_day, 23, 59, 59, tzinfo=tz)
    return start_dt, end_dt


def get_period_date_range_exclusive(
    year: int,
    month: int,
    tz: datetime.timezone = datetime.timezone.utc,
) -> Tuple[datetime.datetime, datetime.datetime]:
    """
    Retourne (start_dt, end_dt) EXCLUSIF pour un mois calendaire donné.

    Bornes : [1er du mois 00:00:00 UTC  ←→  1er du mois suivant 00:00:00 UTC)

    Utilisé par : KpiCalculator, KpiAggregator (filtre < end_dt, half-open interval)
    Ce pattern est conforme aux meilleures pratiques SQL pour les plages temporelles.

    Args:
        year:  Année (ex: 2026)
        month: Mois (1-12)
        tz:    Timezone (UTC par défaut, conforme à GitLab)

    Returns:
        Tuple (start_dt, end_dt) avec timezone, end_dt exclusif (premier du mois suivant)
    """
    start_dt = datetime.datetime(year, month, 1, 0, 0, 0, tzinfo=tz)
    # Calcul du mois suivant sans risque de dépassement
    if month == 12:
        end_dt = datetime.datetime(year + 1, 1, 1, 0, 0, 0, tzinfo=tz)
    else:
        end_dt = datetime.datetime(year, month + 1, 1, 0, 0, 0, tzinfo=tz)
    return start_dt, end_dt


def resolve_period_dates_from_db(
    db: Session,
    period_id: int,
    tz: datetime.timezone = datetime.timezone.utc,
    exclusive: bool = False,
) -> Optional[Tuple[datetime.datetime, datetime.datetime]]:
    """
    Charge une période depuis la DB et retourne sa plage de dates.

    Retourne None si la période n'existe pas (gestion propre,
    pas d'exception — le caller décide quoi faire).

    Args:
        db:        Session SQLAlchemy
        period_id: ID de la période à résoudre
        tz:        Timezone (UTC par défaut)
        exclusive: Si True → utilise le variant exclusif (pour KpiCalculator)
                   Si False (défaut) → utilise le variant inclusif (pour les listes)

    Returns:
        (start_dt, end_dt) ou None si période introuvable
    """
    # Import local pour éviter les circular imports au niveau module
    from app.models.period import Period

    period = db.get(Period, period_id)
    if period is None:
        return None

    if exclusive:
        return get_period_date_range_exclusive(period.year, period.month, tz)
    return get_period_date_range(period.year, period.month, tz)
