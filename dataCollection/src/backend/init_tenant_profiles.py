"""
init_tenant_profiles.py

Initialise les profils et menus par défaut dans une base de données tenant.
Crée les profils: Site Manager, Team Lead, Project Manager, Developer, Viewer
Crée les menus de base et les associe aux profils.

Utilisation:
    python init_tenant_profiles.py
    ou
    $env:TENANT_DB_URL="postgresql://..." python init_tenant_profiles.py
"""

import os
import sys
from sqlalchemy import create_engine
from sqlalchemy.orm import Session

# Ajouter le répertoire backend au path
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from app.models.base import Base
from app.models.profile import Profile
from app.models.menu_item import MenuItem
from app.models.profile_menu_item import ProfileMenuItem
from app.models.role import Role
from app.models.permission import Permission
from app.models.role_permission import RolePermission

# ── Configuration ──────────────────────────────────────────────────────────
TENANT_DB_URL = os.getenv("TENANT_DB_URL")
if not TENANT_DB_URL:
    # URL par défaut pour gitlab_kpi1 (gitlab-kpi-main-db)
    TENANT_DB_URL = "postgresql://neondb_owner:npg_GmJvk93fseOK@ep-quiet-queen-aspzc21p-pooler.c-4.eu-central-1.aws.neon.tech/neondb?sslmode=require&channel_binding=require"
    print("⚠️  TENANT_DB_URL non défini, utilisation de l'URL par défaut (gitlab_kpi-main-db)")
    print("⚠️  NOTE: Si l'URL par défaut ne fonctionne pas, définissez $env:TENANT_DB_URL avec l'URL correcte")

# Profils par défaut à créer
DEFAULT_PROFILES = [
    {"name": "Super Admin", "description": "Accès complet à tous les menus et fonctionnalités système"},
    {"name": "Site Manager", "description": "Accès limité à son site"},
    {"name": "Team Lead", "description": "Accès limité à son équipe"},
    {"name": "Project Manager", "description": "Accès limité à ses projets"},
    {"name": "Developer", "description": "Lecture seule de ses propres KPIs"},
    {"name": "Viewer", "description": "Accès flexible (sites, équipes, projets combinés)"},
]

# Menus de base à créer
DEFAULT_MENU_ITEMS = [
    {"route": "/analytics/comparison", "label": "Analyse Stratégique", "icon": "ri-pie-chart-2-line", "parent_id": None, "order_index": 1},
    {"route": "/developers", "label": "Hub Développeurs", "icon": "ri-code-s-slash-line", "parent_id": None, "order_index": 2},
    {"route": "/merge", "label": "Merge Requests", "icon": "ri-git-merge-line", "parent_id": None, "order_index": 3},
    {"route": "/commits", "label": "Commits GitLab", "icon": "ri-git-commit-line", "parent_id": None, "order_index": 4},
    {"route": "/extraction-lots", "label": "Registre des Lots", "icon": "ri-database-2-line", "parent_id": None, "order_index": 5},
    {"route": "/extraction", "label": "Moteur d'Extraction", "icon": "ri-rocket-2-line", "parent_id": None, "order_index": 6},
    {"route": "/admin/sites", "label": "Sites Telnet", "icon": "ri-building-2-line", "parent_id": None, "order_index": 7},
    {"route": "/admin/projects", "label": "Projets GitLab", "icon": "ri-folder-2-line", "parent_id": None, "order_index": 8},
    {"route": "/admin/gitlab-configs", "label": "Configs GitLab", "icon": "ri-settings-3-line", "parent_id": None, "order_index": 9},
    {"route": "/admin/users", "label": "Utilisateurs", "icon": "ri-group-line", "parent_id": None, "order_index": 10},
    {"route": "/admin/developers", "label": "Validation Profils", "icon": "ri-user-follow-line", "parent_id": None, "order_index": 11},
    {"route": "/admin/periods", "label": "Périodes", "icon": "ri-calendar-2-line", "parent_id": None, "order_index": 12},
    {"route": "/admin/kpi-definitions", "label": "Définitions KPI", "icon": "ri-file-list-3-line", "parent_id": None, "order_index": 13},
    {"route": "/admin/profiles", "label": "Profils & Menu", "icon": "ri-user-settings-line", "parent_id": None, "order_index": 14},
    {"route": "/admin/scheduler", "label": "Scheduler Admin", "icon": "ri-time-line", "parent_id": None, "order_index": 15},
    {"route": "/admin/developers/import", "label": "Import Développeurs", "icon": "ri-upload-2-line", "parent_id": None, "order_index": 16},
    {"route": "/admin/audit-log", "label": "Audit Log", "icon": "ri-shield-check-line", "parent_id": None, "order_index": 17},
]

def init_tenant_profiles():
    """Initialise les profils et menus dans la base de données tenant."""
    print("🔧 Connexion à la base de données tenant...")
    engine = create_engine(TENANT_DB_URL)
    
    print("🔧 Création des tables si inexistantes...")
    Base.metadata.create_all(bind=engine)
    
    session = Session(bind=engine)
    
    try:
        # 1. Créer les profils par défaut
        print("🔧 Création des profils par défaut...")
        profiles_map = {}
        for profile_data in DEFAULT_PROFILES:
            existing = session.query(Profile).filter(Profile.name == profile_data["name"]).first()
            if existing:
                print(f"  ✅ Profil '{profile_data['name']}' existe déjà")
                profiles_map[profile_data["name"]] = existing
            else:
                profile = Profile(**profile_data)
                session.add(profile)
                session.flush()
                print(f"  ✅ Profil '{profile_data['name']}' créé")
                profiles_map[profile_data["name"]] = profile
        
        # 2. Créer les menus de base
        print("🔧 Création des menus de base...")
        menu_map = {}
        for menu_data in DEFAULT_MENU_ITEMS:
            existing = session.query(MenuItem).filter(MenuItem.route == menu_data["route"]).first()
            if existing:
                print(f"  ✅ Menu '{menu_data['label']}' existe déjà")
                menu_map[menu_data["route"]] = existing
            else:
                menu = MenuItem(**menu_data)
                session.add(menu)
                session.flush()
                print(f"  ✅ Menu '{menu_data['label']}' créé")
                menu_map[menu_data["route"]] = menu
        
        # 3. Associer tous les menus à tous les profils (accès complet par défaut)
        print("🔧 Association des menus aux profils...")
        for profile_name, profile in profiles_map.items():
            for menu_route, menu in menu_map.items():
                existing = session.query(ProfileMenuItem).filter(
                    ProfileMenuItem.profile_id == profile.id,
                    ProfileMenuItem.menu_item_id == menu.id
                ).first()
                if not existing:
                    profile_menu = ProfileMenuItem(profile_id=profile.id, menu_item_id=menu.id)
                    session.add(profile_menu)
            print(f"  ✅ {len(menu_map)} menus associés au profil '{profile_name}'")
        
        session.commit()
        print("✅ Profils et menus initialisés avec succès!")
        
    except Exception as e:
        print(f"❌ Erreur lors de l'initialisation: {e}")
        session.rollback()
        raise
    finally:
        session.close()

if __name__ == "__main__":
    init_tenant_profiles()
