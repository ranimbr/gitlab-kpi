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


# ── SEED DATA FOR PROFILE & MENU MANAGEMENT ─────────────────────────────

MENU_ITEMS_SEED_DATA = [
    # ✅ [REMOVED] Dashboard - Page principale supprimée
    # {"label": "Dashboard", "route": "/dashboard", "icon": "LayoutDashboard", "order_index": 1},
    {"label": "Projets", "route": "/projects", "icon": "Folder", "order_index": 2},
    {"label": "Commits", "route": "/commits", "icon": "GitCommit", "order_index": 3},
    {"label": "Merge Requests", "route": "/merge", "icon": "MergeRequest", "order_index": 4},
    {"label": "Développeurs", "route": "/developers", "icon": "Users", "order_index": 5},
    {"label": "Profil développeur", "route": "/developers/:id", "icon": "User", "order_index": 6},
    # ✅ [REMOVED] Comparaison développeurs - Non fonctionnelle
    # {"label": "Comparaison développeurs", "route": "/developers/compare", "icon": "Compare", "order_index": 7},
    {"label": "Performance développeur", "route": "/developers/:id/performance", "icon": "TrendingUp", "order_index": 7},
    # ✅ [REMOVED] Alerts - Non fonctionnelle
    # {"label": "Alertes", "route": "/alerts", "icon": "AlertTriangle", "order_index": 9},
    # ✅ [REMOVED] Analyses KPI - Non fonctionnelle
    # {"label": "Analyses KPI", "route": "/kpi-analysis", "icon": "LineChart", "order_index": 10},
    {"label": "Extraction Lots", "route": "/extraction-lots", "icon": "Database", "order_index": 8},
    {"label": "Moteur d'Extraction", "route": "/extraction", "icon": "Rocket", "order_index": 11},
    {"label": "Analytics Comparison", "route": "/analytics/comparison", "icon": "BarChart", "order_index": 12},
    # ✅ [REMOVED] Analytics Diagnostic - Non fonctionnelle
    # {"label": "Analytics Diagnostic", "route": "/analytics/diagnostic", "icon": "Activity", "order_index": 13},
    # ✅ [REMOVED] Team Management - Business Units page supprimée
    # {"label": "Team Management", "route": "/team", "icon": "Users", "order_index": 14},
    {"label": "Analyses KPI", "route": "/kpi-analysis", "icon": "LineChart", "order_index": 15},
    # Admin menus
    {"label": "Admin - Développeurs", "route": "/admin/developers", "icon": "Users", "order_index": 20},
    {"label": "Admin - Import Développeurs", "route": "/admin/developers/import", "icon": "Upload", "order_index": 21},
    {"label": "Admin - Périodes", "route": "/admin/periods", "icon": "Calendar", "order_index": 22},
    {"label": "Admin - Projets", "route": "/admin/projects", "icon": "Folder", "order_index": 23},
    {"label": "Admin - Sites", "route": "/admin/sites", "icon": "Building", "order_index": 24},
    {"label": "Admin - Utilisateurs", "route": "/admin/users", "icon": "UserCog", "order_index": 25},
    {"label": "Admin - GitLab Configs", "route": "/admin/gitlab-configs", "icon": "Settings", "order_index": 26},
    {"label": "Admin - KPI Definitions", "route": "/admin/kpi-definitions", "icon": "ChartBar", "order_index": 27},
    # ✅ [REMOVED] Admin - KPI Thresholds - Seuils KPI page supprimée
    # {"label": "Admin - KPI Thresholds", "route": "/admin/kpi-thresholds", "icon": "Sliders", "order_index": 28},
    {"label": "Admin - Dashboards", "route": "/admin/dashboards", "icon": "Layout", "order_index": 29},
    {"label": "Admin - Profils & Rôles", "route": "/admin/profiles", "icon": "Shield", "order_index": 30},
    {"label": "Admin - Scheduler", "route": "/admin/scheduler", "icon": "Time", "order_index": 32},
    {"label": "Admin - Audit Log", "route": "/admin/audit-log", "icon": "FileText", "order_index": 33},
]

PROFILES_SEED_DATA = [
    {
        "name": "Super Admin",
        "description": "Accès total à tous les menus",
        "access_all": True,  # Tous les menus actifs
    },
    {
        "name": "Site Manager",
        "description": "Gestionnaire de site - accès limité à son site",
        "access_all": False,
        "menu_routes": [
            # ✅ [REMOVED] Dashboard - Page principale supprimée
            # "/dashboard", 
            "/projects", "/commits", "/merge", "/developers",
            "/developers/:id", "/developers/:id/performance",
            # ✅ [REMOVED] Alerts - Non fonctionnelle
            # "/alerts", "/extraction-lots", "/analytics/comparison", "/analytics/diagnostic",
            # ✅ [REMOVED] Analyses KPI - Non fonctionnelle
            # "/kpi-analysis", "/team",
        ],
    },
    {
        "name": "Project Manager",
        "description": "Gestionnaire de projet - accès limité à ses projets",
        "access_all": False,
        "menu_routes": [
            # ✅ [REMOVED] Dashboard - Page principale supprimée
            # "/dashboard", 
            "/projects", "/commits", "/merge", "/developers",
            "/developers/:id", "/developers/:id/performance",
            # ✅ [REMOVED] Alerts - Non fonctionnelle
            # "/alerts", "/extraction-lots", "/analytics/comparison", "/analytics/diagnostic",
            # ✅ [REMOVED] Analyses KPI - Non fonctionnelle
            # "/kpi-analysis", "/team",
        ],
    },
    {
        "name": "Team Lead",
        "description": "Chef d'équipe - accès limité à son équipe",
        "access_all": False,
        "menu_routes": [
            # ✅ [REMOVED] Dashboard - Page principale supprimée
            # "/dashboard", 
            "/projects", "/commits", "/merge", "/developers",
            "/developers/:id", "/developers/:id/performance",
            # ✅ [REMOVED] Alerts - Non fonctionnelle
            # "/alerts",
            # ✅ [REMOVED] Analyses KPI - Non fonctionnelle
            # "/kpi-analysis",
        ],
    },
    {
        "name": "Developer",
        "description": "Développeur - lecture seule de ses propres données",
        "access_all": False,
        "menu_routes": [
            # ✅ [REMOVED] Dashboard - Page principale supprimée
            # "/dashboard", 
            "/projects", "/commits", "/merge", "/developers/:id",
            # ✅ [REMOVED] Alerts - Non fonctionnelle
            # "/alerts",
            # ✅ [REMOVED] Analyses KPI - Non fonctionnelle
            # "/kpi-analysis",
        ],
    },
    {
        "name": "Viewer",
        "description": "Utilisateur en lecture seule avec accès flexible selon ses assignations (sites, équipes, projets)",
        "access_all": False,
        "menu_routes": [
            "/projects", "/analytics/comparison",
        ],
    },
]


def seed_menu_items(db: Session) -> int:
    """
    Insère les menus par défaut (idempotent).
    Retourne le nombre de menus créés.
    """
    from app.repositories.menu_item_repository import MenuItemRepository
    from app.models.menu_item import MenuItem
    
    repo = MenuItemRepository()
    created = 0
    
    for menu_data in MENU_ITEMS_SEED_DATA:
        route = menu_data["route"]
        existing = repo.get_by_route(db, route)
        if existing:
            logger.debug(f"MenuItem already exists — route={route}")
            continue
        
        menu = MenuItem(**menu_data)
        db.add(menu)
        created += 1
        logger.info(f"MenuItem seeded — route={route}")
    
    if created > 0:
        db.commit()
        logger.info(f"✅ Seeded {created} MenuItem(s)")
    return created


def seed_profiles(db: Session) -> int:
    """
    Insère les profils par défaut avec leurs droits d'accès (idempotent).
    Retourne le nombre de profils créés.
    """
    from app.repositories.profile_repository import ProfileRepository
    from app.repositories.menu_item_repository import MenuItemRepository
    from app.models.profile_menu_item import ProfileMenuItem
    from app.models.profile import Profile
    
    profile_repo = ProfileRepository()
    menu_item_repo = MenuItemRepository()
    created = 0
    
    for profile_data in PROFILES_SEED_DATA:
        name = profile_data["name"]
        existing = db.query(Profile).filter(Profile.name == name).first()
        if existing:
            logger.debug(f"Profile already exists — name={name}")
            continue
        
        # Créer le profil
        profile = Profile(
            name=name,
            description=profile_data["description"]
        )
        db.add(profile)
        db.flush()
        created += 1
        
        # Associer les menus
        if profile_data["access_all"]:
            # Tous les menus actifs
            all_menus = menu_item_repo.get_active_only(db)
            for menu in all_menus:
                association = ProfileMenuItem(
                    profile_id=profile.id,
                    menu_item_id=menu.id,
                    has_access=True
                )
                db.add(association)
        else:
            # Menus spécifiques
            for route in profile_data["menu_routes"]:
                menu = menu_item_repo.get_by_route(db, route)
                if menu:
                    association = ProfileMenuItem(
                        profile_id=profile.id,
                        menu_item_id=menu.id,
                        has_access=True
                    )
                    db.add(association)
        
        logger.info(f"Profile seeded — name={name}")
    
    if created > 0:
        db.commit()
        logger.info(f"✅ Seeded {created} Profile(s)")
    return created