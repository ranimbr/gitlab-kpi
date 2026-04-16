"""
Script métier brut pour réinitialiser complètement la base de données.
Il supprime toutes les tables puis les recrée à zéro.
"""
import sys
import os

# Ajout du dossier courant au path pour permettre l'import de 'app'
current_dir = os.path.dirname(os.path.abspath(__file__))
parent_dir = os.path.dirname(current_dir)
sys.path.append(parent_dir)

from app.database.session import engine, SessionLocal
from app.models.base import Base
# IMPORTANT : Importer tous les modèles pour que SQLAlchemy les connaisse
from app.models.app_user import AppUser
from app.models.developer import Developer
from app.models.project import Project
from app.models.gitlab_config import GitLabConfig
from app.models.kpi_snapshot import KpiSnapshot
from app.models.alert import Alert
from app.models.commit import Commit
from app.models.merge_request import MergeRequest
from app.models.developer_group import DeveloperGroup
from app.models.developer_project import DeveloperProject
from app.models.developer_site import DeveloperSite
from app.models.period import Period
from app.models.project_site import ProjectSite
from app.models.site import Site
from app.models.kpi_definition import KpiDefinition
from app.models.kpi_threshold import KpiThreshold

from app.core.seed_data import seed_kpi_definitions, seed_admin_user
from app.core.config import get_settings

def reset_database():
    settings = get_settings()
    print("⚠️ ATTENTION: La base de données va être vidée complètement.")
    print("Suppression de toutes les tables existantes...")
    
    # 1. Détruire toutes les tables en cascade (résout l'erreur Circular Dependency d'Alembic)
    from sqlalchemy import text
    with engine.connect() as conn:
        conn.execute(text("DROP SCHEMA public CASCADE;"))
        conn.execute(text("CREATE SCHEMA public;"))
        conn.commit()
    print("✅ Schema 'public' recréé à neuf (suppression des tables).")
    
    # 2. Recréer toutes les tables
    print("Recréation des tables via SQLAlchemy...")
    Base.metadata.create_all(bind=engine)
    print("✅ Tables recréées.")

    # 3. Seed automatique des KPIs et de l'Admin (comme au démarrage d'uvicorn)
    with SessionLocal() as db:
        print("Initialisation des données de base (KpiDefinitions)...")
        seed_kpi_definitions(db)
        
        if settings.ADMIN_EMAIL and settings.ADMIN_PASSWORD:
            print(f"Création de l'utilisateur Admin ({settings.ADMIN_EMAIL})...")
            seed_admin_user(db, settings.ADMIN_EMAIL, settings.ADMIN_PASSWORD)
            
    print("🚀 TERMINÉ ! Votre base de données est flambant neuve. Uvicorn va recharger les changements.")

if __name__ == "__main__":
    reset_database()
