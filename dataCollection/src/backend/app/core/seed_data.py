"""
core/seed_data.py

CORRECTIONS (modèles mis à jour) :
─────────────────────────────────────
1. seed_admin_user() : UserRoleEnum.admin → UserRoleEnum.super_admin.
   L'ancien rôle "admin" n'existe plus — remplacé par "super_admin".

2. seed_admin_user() : repo.get_admins() → repo.get_super_admins()
   (méthode mise à jour dans user_repository.py).

3. seed_kpi_definitions() : logique inchangée (déjà correcte dans la version fournie).
"""
import logging
from sqlalchemy.orm import Session

logger = logging.getLogger(__name__)

KPI_SEED_DATA = [
    {
        "code":                "MR_RATE_SITE",
        "label":               "MR Rate par site",
        "formula_description": "NB MRs non-draft créées / NB développeurs validés du site",
        "unit":                "ratio",
        "aggregation_level":   "site",
        "is_active":           True,
    },
    {
        "code":                "APPROVED_MR_RATE",
        "label":               "Approved MR Rate",
        "formula_description": "NB MRs approuvées / NB MRs créées non-draft",
        "unit":                "ratio",
        "aggregation_level":   "site",
        "is_active":           True,
    },
    {
        "code":                "MERGED_MR_RATE",
        "label":               "Merged MR Rate",
        "formula_description": "NB MRs mergées / NB MRs approuvées",
        "unit":                "ratio",
        "aggregation_level":   "site",
        "is_active":           True,
    },
    {
        "code":                "COMMIT_RATE_SITE",
        "label":               "Commit Rate par site",
        "formula_description": "NB commits devs validés / NB développeurs validés du site",
        "unit":                "ratio",
        "aggregation_level":   "site",
        "is_active":           True,
    },
    {
        "code":                "NB_COMMITS_PROJECT",
        "label":               "NB Commits par projet",
        "formula_description": "Somme de tous les commits créés dans le projet sur la période",
        "unit":                "count",
        "aggregation_level":   "project",
        "is_active":           True,
    },
    {
        "code":                "AVG_REVIEW_TIME",
        "label":               "Temps moyen de relecture",
        "formula_description": "Σ(approved_at - created_at) des MRs approuvées / NB MRs approuvées — en heures",
        "unit":                "hours",
        "aggregation_level":   "site",
        "is_active":           True,
    },
    # KPI #2 (tickets) — désactivé sur instruction encadrant
    {
        "code":                "MR_RATE_TICKET",
        "label":               "MR Rate par ticket",
        "formula_description": "NB MRs / NB tickets résolus par complexité",
        "unit":                "ratio",
        "aggregation_level":   "project",
        "is_active":           False,
    },
]


def seed_kpi_definitions(db: Session) -> int:
    """
    Insère les KpiDefinitions manquantes (idempotent).
    Retourne le nombre de KPIs réellement créés.
    """
    from app.repositories.kpi_definition_repository import KpiDefinitionRepository

    repo    = KpiDefinitionRepository()
    created = 0

    for kpi_data in KPI_SEED_DATA:
        code     = kpi_data["code"]
        existing = repo.get_by_code(db, code)
        if existing:
            logger.debug(f"KpiDefinition already exists — code={code}")
            continue
        repo.get_or_create(db, code, kpi_data)
        created += 1
        logger.info(f"KpiDefinition seeded — code={code}")

    if created > 0:
        db.commit()
        logger.info(f"✅ Seeded {created} KpiDefinition(s)")
    return created


def seed_admin_user(db: Session, email: str, password: str) -> None:
    """
    Crée un utilisateur super_admin par défaut si aucun n'existe.

    ✅ FIX : UserRoleEnum.super_admin (remplace UserRoleEnum.admin).
    ✅ FIX : repo.get_super_admins() (remplace repo.get_admins()).
    """
    from app.repositories.user_repository import AppUserRepository
    from app.core.security import hash_password
    from app.models.app_user import UserRoleEnum

    repo = AppUserRepository()

    # ✅ FIX : vérifie s'il existe déjà un super_admin
    admins = repo.get_super_admins(db)
    if admins:
        logger.debug(f"Super admin already exists — skipping seed ({len(admins)} admin(s))")
        return

    repo.create_user(
        db              = db,
        email           = email,
        hashed_password = hash_password(password),
        # ✅ FIX : super_admin
        role            = UserRoleEnum.super_admin,
        name            = "Super Admin",
    )
    db.commit()
    logger.info(f"✅ Default super_admin created — email={email}")