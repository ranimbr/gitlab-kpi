"""
core/seed_data.py

Seed des données initiales obligatoires au démarrage.

POURQUOI ce fichier est CRITIQUE :
    KpiThreshold.kpi_definition_id est NOT NULL dans le modèle corrigé.
    Si les KpiDefinition n'existent pas en base, toute tentative de créer
    un seuil KPI → IntegrityError (FK violation).

    Ce seed est idempotent — sans danger si appelé plusieurs fois.

CORRECTION — seed_kpi_definitions() :
    La version originale avait une logique cassée :
        1. Appelle repo.get_or_create() pour chaque KPI (crée si absent)
        2. Puis REPART d'une 2ème boucle qui cherche not existing
           → les KPIs venaient d'être créés par get_or_create()
           → not existing = False pour tous → created reste à 0
           → AUCUN KPI créé en réalité car la 2ème boucle n'insère rien
             (la db.add() dans la 2ème boucle n'est jamais atteinte)

    ✅ FIX : une seule boucle via get_or_create() — simple, correcte, idempotente.
    Retourne le nombre de KPIs réellement créés (0 si déjà tous présents).

KPIs seedés (les 6 actifs — KPI #2 tickets ignoré pour le moment) :
    MR_RATE_SITE       — KPI #1
    APPROVED_MR_RATE   — KPI #3
    MERGED_MR_RATE     — KPI #4
    COMMIT_RATE_SITE   — KPI #5
    NB_COMMITS_PROJECT — KPI #6
    AVG_REVIEW_TIME    — KPI #7
    MR_RATE_TICKET     — KPI #2 (is_active=False, seedé pour cohérence référentiel)
"""
import logging
from sqlalchemy.orm import Session

logger = logging.getLogger(__name__)

# ── Définitions des 6 KPIs actifs + 1 désactivé ──────────────────────────────
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
        "formula_description": (
            "Σ(approved_at - created_at) des MRs approuvées / NB MRs approuvées — en heures"
        ),
        "unit":                "hours",
        "aggregation_level":   "site",
        "is_active":           True,
    },
    # KPI #2 (tickets) — désactivé sur instruction encadrant
    # Seedé pour cohérence du référentiel (kpi_definition_id connu d'avance)
    {
        "code":                "MR_RATE_TICKET",
        "label":               "MR Rate par ticket",
        "formula_description": (
            "NB MRs / NB tickets résolus par complexité "
            "(Simple, Medium, Complicated, Very Complicated)"
        ),
        "unit":                "ratio",
        "aggregation_level":   "project",
        "is_active":           False,
    },
]


def seed_kpi_definitions(db: Session) -> int:
    """
    Insère les KpiDefinitions manquantes (idempotent).
    Retourne le nombre de KPIs réellement créés (0 si déjà tous présents).

    ✅ FIX : une seule boucle via get_or_create().
    La version originale avait 2 boucles dont la 2ème n'insérait jamais rien
    car les KPIs venaient d'être créés par get_or_create() dans la 1ère.
    """
    from app.repositories.kpi_definition_repository import KpiDefinitionRepository

    repo    = KpiDefinitionRepository()
    created = 0

    for kpi_data in KPI_SEED_DATA:
        code     = kpi_data["code"]
        existing = repo.get_by_code(db, code)

        if existing:
            # Déjà présent — pas de modification (idempotent)
            logger.debug(f"KpiDefinition already exists — code={code} id={existing.id}")
            continue

        # Nouveau KPI — créer via le repo (flush sans commit, groupé ci-dessous)
        repo.get_or_create(db, code, kpi_data)
        created += 1
        logger.info(f"KpiDefinition seeded — code={code}")

    if created > 0:
        db.commit()
        logger.info(f"✅ Seeded {created} KpiDefinition(s)")
    else:
        logger.debug("KpiDefinitions already seeded — nothing to do")

    return created


def seed_admin_user(db: Session, email: str, password: str) -> None:
    """
    Crée un utilisateur admin par défaut si aucun admin n'existe.
    Appelé au startup uniquement si ADMIN_EMAIL + ADMIN_PASSWORD sont dans .env.

    ✅ FIX : UserRoleEnum importé depuis app.models.app_user (pas depuis schemas)
    pour rester dans la couche modèle lors de la création de l'objet AppUser.
    Les schemas ne doivent pas être utilisés pour créer des objets ORM directement.
    """
    from app.repositories.user_repository import AppUserRepository
    from app.core.security import hash_password
    # ✅ FIX : import depuis models (pas schemas) — création d'objet ORM
    from app.models.app_user import UserRoleEnum

    repo = AppUserRepository()

    # Vérifie s'il existe déjà un admin
    admins = repo.get_admins(db)
    if admins:
        logger.debug(
            f"Admin user already exists — skipping seed ({len(admins)} admin(s))"
        )
        return

    repo.create_user(
        db              = db,
        email           = email,
        hashed_password = hash_password(password),
        role            = UserRoleEnum.admin,
        name            = "Admin",
    )
    db.commit()
    logger.info(f"✅ Default admin user created — email={email}")