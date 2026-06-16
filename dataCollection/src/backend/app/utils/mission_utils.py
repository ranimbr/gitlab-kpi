from typing import List, Optional, Tuple, Dict
from datetime import date, datetime
from sqlalchemy import or_, and_
from sqlalchemy.orm import Session
from app.models.developer import Developer
from app.models.developer_project import DeveloperProject
from app.models.developer_site import DeveloperSite
from app.models.developer_group import DeveloperGroupLink
from app.models.extraction_lot import ExtractionLot
from app.models.period import Period

# =============================================================================
# RG-02 — Règle des 15 jours (Source de Vérité Unique)
# =============================================================================
# Un développeur est compté dans l'effectif d'un mois M si et seulement si
# sa date de sortie (offboarding_date) est >= au 15 de ce mois M.
# Cette règle s'inspire de la pratique RH standard de proratisation de la paie.
# IMPORTANT : Toute modification de ce seuil doit être faite ICI UNIQUEMENT.
# =============================================================================
RG02_THRESHOLD_DAY: int = 15


def get_rg02_threshold(year: int, month: int, today: Optional[date] = None) -> date:
    """
    [RG-02] Retourne la date-seuil d'offboarding pour un mois donné.
    - Si le mois est le mois en cours → today (état instantané)
    - Si le mois est passé             → 15 du mois (règle des 15 jours)

    Usage :
        threshold = get_rg02_threshold(period.year, period.month)
        filter: offboarding_date >= threshold
    """
    _today = today or date.today()
    if year == _today.year and month == _today.month:
        return _today
    return date(year, month, RG02_THRESHOLD_DAY)


def get_certified_developers_query(
    db: Session,
    project_id: int,
    period_id: Optional[int] = None,
    start_date: Optional[date] = None,
    end_date: Optional[date] = None,
    eligible_ids: Optional[List[int]] = None
):
    """
    [SENIOR] Version Query de la logique Mission-Strict.
    Permet l'utilisation comme sous-requête pour éviter les N+1 et les clauses IN massives.
    """
    if not start_date or not end_date:
        if period_id:
            period = db.query(Period).filter(Period.id == period_id).first()
            if period:
                start_date = date(period.year, period.month, 1)
                if period.month == 12:
                    end_date = date(period.year + 1, 1, 1)
                else:
                    end_date = date(period.year, period.month + 1, 1)
        else:
            # Fallback to the latest period in database
            period = db.query(Period).order_by(Period.year.desc(), Period.month.desc()).first()
            if period:
                start_date = date(period.year, period.month, 1)
                if period.month == 12:
                    end_date = date(period.year + 1, 1, 1)
                else:
                    end_date = date(period.year, period.month + 1, 1)
            else:
                today = date.today()
                start_date = date(today.year, today.month, 1)
                if today.month == 12:
                    end_date = date(today.year + 1, 1, 1)
                else:
                    end_date = date(today.year, today.month + 1, 1)

    # [STRICT CYCLE DE VIE] Règle des 15 jours (RG-02)
    # Un développeur n'est compté dans la période que s'il est resté au moins jusqu'au 15 du mois.
    threshold_date = date(start_date.year, start_date.month, 15)

    # ── [FIX SUSPENSION] Vérification TRIPLE : Site + Groupe + Projet ─────────────
    # Un développeur suspendu n'a PAS de segment site OU groupe actif pendant la suspension
    # On doit vérifier les DEUX pour exclure correctement les suspensions
    query = (
        db.query(Developer.id)
        .join(
            DeveloperProject,
            (DeveloperProject.developer_id == Developer.id) &
            (DeveloperProject.project_id   == project_id)
        )
        # Join DeveloperSite temporel (SCD Type 2)
        .join(
            DeveloperSite,
            (DeveloperSite.developer_id == Developer.id)
        )
        # [FIX SUSPENSION] Join DeveloperGroupLink temporel (SCD Type 2)
        .join(
            DeveloperGroupLink,
            (DeveloperGroupLink.developer_id == Developer.id)
        )
        .filter(
            Developer.is_bot.is_(False),
            
            # [STRICT CYCLE DE VIE] Respect des dates contractuelles RH globales + Règle des 15 jours
            or_(Developer.onboarding_date.is_(None), Developer.onboarding_date < end_date),
            or_(Developer.offboarding_date.is_(None), Developer.offboarding_date >= threshold_date),

            # [SCD2 TEMPORAL - SITE] Le segment de site doit couvrir la période
            # STRICT < pour end_date : un segment démarrant le 01/04 ne doit PAS polluer mars
            or_(DeveloperSite.start_date.is_(None), DeveloperSite.start_date < end_date),
            or_(DeveloperSite.end_date.is_(None),   DeveloperSite.end_date   >= start_date),

            # [SCD2 TEMPORAL - GROUPE] Le segment de groupe doit couvrir la période
            # CRITIQUE pour les suspensions : un dev suspendu n'a PAS de segment groupe actif
            or_(DeveloperGroupLink.start_date.is_(None), DeveloperGroupLink.start_date < end_date),
            or_(DeveloperGroupLink.end_date.is_(None),   DeveloperGroupLink.end_date   >= start_date),
        )
        .distinct()
    )

    if eligible_ids:
        query = query.filter(Developer.id.in_(eligible_ids))

    # [STRICT TEMPORAL SCOPE] La mission spécifique au projet doit couvrir la période
    # On ignore désormais le period_id pour favoriser la continuité de la mission
    query = query.filter(
        or_(DeveloperProject.start_date.is_(None), DeveloperProject.start_date < end_date),
        or_(DeveloperProject.end_date.is_(None), DeveloperProject.end_date >= start_date)
    )
    return query

def get_certified_developers_for_mission(
    db: Session,
    project_id: int,
    period_id: Optional[int] = None,
    start_date: Optional[date] = None,
    end_date: Optional[date] = None,
    eligible_ids: Optional[List[int]] = None
) -> List[int]:
    """[LEGACY/WRAPPER] Retourne la liste des IDs (utilisé par les imports/checks ponctuels)."""
    query = get_certified_developers_query(db, project_id, period_id, start_date, end_date, eligible_ids=eligible_ids)
    return [row.id for row in query.all()]


def is_contribution_certified(
    dev: Developer,
    contribution_date: date
) -> bool:
    """
    Verifies if a specific contribution is 'Pure' based on the developer's contract.
    """
    if dev.is_bot:
        return False
    
    if dev.onboarding_date and contribution_date < dev.onboarding_date:
        return False
    
    if dev.offboarding_date and contribution_date > dev.offboarding_date:
        return False
        
    return True


def is_project_contribution_certified(
    db: Session,
    developer_id: int,
    project_id: int,
    contribution_date: date,
    prefetched_missions: Optional[Dict[int, Tuple[Optional[date], Optional[date]]]] = None
) -> bool:
    """
    [SURGICAL DAILY PRECISION]
    Verifies if a contribution on a SPECIFIC project is authorized on a SPECIFIC day.
    Checks against DeveloperProject (Mission) table.
    """
    # 1. Vérification RH globale (Onboarding/Offboarding)
    dev = db.query(Developer).get(developer_id)
    if not dev or not is_contribution_certified(dev, contribution_date):
        return False

    # 2. Vérification de la Mission spécifique au Projet
    if prefetched_missions and developer_id in prefetched_missions:
        start_dt, end_dt = prefetched_missions[developer_id]
        if start_dt and contribution_date < start_dt:
            return False
        if end_dt and contribution_date > end_dt:
            return False
        return True
    else:
        # Cherche un segment de mission (SCD Type 2) qui couvre la date de contribution
        from sqlalchemy import or_
        assoc = db.query(DeveloperProject).filter(
            DeveloperProject.developer_id == developer_id,
            DeveloperProject.project_id   == project_id,
            DeveloperProject.start_date <= contribution_date,
            or_(DeveloperProject.end_date >= contribution_date, DeveloperProject.end_date.is_(None))
        ).first()
        return assoc is not None


def get_site_for_developer_at_date(
    db: Session,
    developer_id: int,
    target_date: date
) -> Optional[int]:
    """
    [SITE TEMPORAL TRACKING]
    Retourne l'ID du site d'un développeur à une date donnée (SCD Type 2).
    Utilisé pour attribuer les commits/MRs au bon site historique.
    
    Returns:
        site_id ou None si le développeur n'avait pas de site à cette date
    """
    from sqlalchemy import or_
    site_assoc = db.query(DeveloperSite).filter(
        DeveloperSite.developer_id == developer_id,
        DeveloperSite.start_date <= target_date,
        or_(DeveloperSite.end_date >= target_date, DeveloperSite.end_date.is_(None))
    ).order_by(DeveloperSite.is_primary.desc()).first()
    
    return site_assoc.site_id if site_assoc else None


def is_mr_certified_for_period(
    mr_created_date: date,
    developer_id: int,
    db: Session,
    period_id: Optional[int] = None,
    start_date: Optional[date] = None,
    end_date: Optional[date] = None
) -> bool:
    """
    [RG-02] Vérifie si un MR doit être compté selon la règle des 15 jours.
    
    Un MR est compté si le développeur était présent au site pendant
    au moins 15 jours dans la période (règle RG-02).
    
    Cette fonction est utilisée pour appliquer uniformément la règle RG-02
    aux calculs de KPIs (approbation, fusion, temps de revue).
    
    Args:
        mr_created_date: Date de création du MR
        developer_id: ID du développeur
        db: Session de base de données
        period_id: ID de la période (optionnel)
        start_date: Date de début de période (optionnel)
        end_date: Date de fin de période (optionnel)
    
    Returns:
        True si le MR doit être compté, False sinon
    """
    # Récupérer la période si non fournie
    if not start_date or not end_date:
        if period_id:
            period = db.query(Period).filter(Period.id == period_id).first()
            if period:
                start_date = date(period.year, period.month, 1)
                if period.month == 12:
                    end_date = date(period.year + 1, 1, 1)
                else:
                    end_date = date(period.year, period.month + 1, 1)
        else:
            # Fallback to the latest period
            period = db.query(Period).order_by(Period.year.desc(), Period.month.desc()).first()
            if period:
                start_date = date(period.year, period.month, 1)
                if period.month == 12:
                    end_date = date(period.year + 1, 1, 1)
                else:
                    end_date = date(period.year, period.month + 1, 1)
            else:
                today = date.today()
                start_date = date(today.year, today.month, 1)
                if today.month == 12:
                    end_date = date(today.year + 1, 1, 1)
                else:
                    end_date = date(today.year, today.month + 1, 1)
    
    # [RG-02] Règle des 15 jours
    # Le MR est compté si le développeur était présent au site pendant
    # au moins 15 jours AVANT la date du MR
    threshold_date = get_rg02_threshold(mr_created_date.year, mr_created_date.month)
    
    # Vérifier si le développeur était présent au site pendant au moins 15 jours AVANT la date du MR
    # en cherchant ses affectations de site pour cette période
    from sqlalchemy import or_
    site_assoc = db.query(DeveloperSite).filter(
        DeveloperSite.developer_id == developer_id,
        DeveloperSite.start_date <= mr_created_date,
        or_(DeveloperSite.end_date >= threshold_date, DeveloperSite.end_date.is_(None))
    ).first()
    
    # Si le développeur n'avait pas de site valide pendant 15 jours AVANT la date du MR, le MR n'est pas compté
    if not site_assoc:
        return False
    
    return True


def get_developers_for_data_extraction(
    db: Session,
    project_id: int,
    period_id: Optional[int] = None,
    start_date: Optional[date] = None,
    end_date: Optional[date] = None,
    eligible_ids: Optional[List[int]] = None
) -> List[int]:
    """
    [DATA EXTRACTION ONLY] - SANS règle RG-02 des 15 jours
    
    Retourne les développeurs éligibles pour l'EXTRACTION de données GitLab brutes.
    Contrairement à get_certified_developers_for_mission(), cette fonction N'APPLIQUE PAS
    la règle des 15 jours car l'extraction doit capturer TOUS les commits pendant la période
    de mission réelle, indépendamment des règles de proratisation RH.
    
    La règle RG-02 (15 jours) doit être appliquée UNIQUEMENT au niveau du calcul des KPIs
    (headcount, productivité proratisée), pas à l'extraction des données brutes.
    
    Args:
        db: Session de base de données
        project_id: ID du projet
        period_id: ID de la période (optionnel)
        start_date: Date de début de période (optionnel)
        end_date: Date de fin de période (optionnel)
        eligible_ids: Liste d'IDs de développeurs pré-filtrés (optionnel)
    
    Returns:
        Liste des IDs de développeurs éligibles pour l'extraction
    """
    if not start_date or not end_date:
        if period_id:
            period = db.query(Period).filter(Period.id == period_id).first()
            if period:
                start_date = date(period.year, period.month, 1)
                if period.month == 12:
                    end_date = date(period.year + 1, 1, 1)
                else:
                    end_date = date(period.year, period.month + 1, 1)
        else:
            # Fallback to the latest period in database
            period = db.query(Period).order_by(Period.year.desc(), Period.month.desc()).first()
            if period:
                start_date = date(period.year, period.month, 1)
                if period.month == 12:
                    end_date = date(period.year + 1, 1, 1)
                else:
                    end_date = date(period.year, period.month + 1, 1)
            else:
                today = date.today()
                start_date = date(today.year, today.month, 1)
                if today.month == 12:
                    end_date = date(today.year + 1, 1, 1)
                else:
                    end_date = date(today.year, today.month + 1, 1)

    # [FIX SUSPENSION] Vérification TRIPLE : Site + Groupe + Projet
    # Un développeur suspendu n'a PAS de segment site OU groupe actif pendant la suspension
    query = (
        db.query(Developer.id)
        .join(
            DeveloperProject,
            (DeveloperProject.developer_id == Developer.id) &
            (DeveloperProject.project_id   == project_id)
        )
        # Join DeveloperSite temporel (SCD Type 2)
        .join(
            DeveloperSite,
            (DeveloperSite.developer_id == Developer.id)
        )
        # Join DeveloperGroupLink temporel (SCD Type 2)
        .join(
            DeveloperGroupLink,
            (DeveloperGroupLink.developer_id == Developer.id)
        )
        .filter(
            Developer.is_bot.is_(False),
            
            # [DATA EXTRACTION] Cycle de vie RH SANS règle des 15 jours
            # On extrait TOUS les commits pendant la période de mission réelle
            or_(Developer.onboarding_date.is_(None), Developer.onboarding_date < end_date),
            or_(Developer.offboarding_date.is_(None), Developer.offboarding_date >= start_date),

            # [SCD2 TEMPORAL - SITE] Le segment de site doit couvrir la période
            or_(DeveloperSite.start_date.is_(None), DeveloperSite.start_date < end_date),
            or_(DeveloperSite.end_date.is_(None),   DeveloperSite.end_date   >= start_date),

            # [SCD2 TEMPORAL - GROUPE] Le segment de groupe doit couvrir la période
            or_(DeveloperGroupLink.start_date.is_(None), DeveloperGroupLink.start_date < end_date),
            or_(DeveloperGroupLink.end_date.is_(None),   DeveloperGroupLink.end_date   >= start_date),
        )
        .distinct()
    )

    if eligible_ids:
        query = query.filter(Developer.id.in_(eligible_ids))

    # [STRICT TEMPORAL SCOPE] La mission spécifique au projet doit couvrir la période
    query = query.filter(
        or_(DeveloperProject.start_date.is_(None), DeveloperProject.start_date < end_date),
        or_(DeveloperProject.end_date.is_(None), DeveloperProject.end_date >= start_date)
    )
    
    return [row.id for row in query.all()]
