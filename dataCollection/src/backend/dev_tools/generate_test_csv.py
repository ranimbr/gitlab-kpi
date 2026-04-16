import sys
import csv
import os
import random

from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker

# Ajouter le chemin du backend au PYTHONPATH
sys.path.insert(0, os.path.dirname(__file__))

from app.core.config import get_settings
from app.models.developer import Developer
from app.models.project import Project

settings = get_settings()
engine = create_engine(settings.DATABASE_URL)
SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)
db = SessionLocal()

def generate_csv():
    try:
        devs = db.query(Developer).all()
        projects = db.query(Project).all()
        
        if not devs:
            print("Aucun développeur trouvé dans la base de données réelle.")
            return
            
        project_names = [p.name for p in projects if p.name]
        if not project_names:
            project_names = ["Projet_A", "Projet_B"]
            
        sites_list = ["Tunis", "Paris", "Sfax", "Lyon"]
        groups_list = ["Squad Backend", "Squad Frontend", "QA Automatisée", "DevOps", "Data Engineering"]

        out_path = "C:/Users/ranim/Downloads/gitlab-kpi-dashboard-versionaprescorrection - Copie/dataCollection/test_developpeurs_entreprise.csv"
        
        with open(out_path, "w", newline="", encoding="utf-8-sig") as f:
            writer = csv.writer(f)
            writer.writerow(["name", "email", "gitlab_username", "sites", "projects", "group"])
            
            for d in devs:
                # Si le dév n'a pas de gitlab_username, on skip pour éviter les soucis d'extraction
                if not d.gitlab_username:
                    continue
                    
                # On attribue un site, un groupe et un projet au hasard
                assigned_site = random.choice(sites_list)
                assigned_group = random.choice(groups_list)
                
                # Affecter 1 ou 2 projets
                num_projects = random.randint(1, min(2, len(project_names)))
                assigned_projects = random.sample(project_names, num_projects)
                projects_str = ";".join(assigned_projects)
                
                writer.writerow([
                    d.name or d.gitlab_username,
                    d.email or f"{d.gitlab_username}@example.com",
                    d.gitlab_username,
                    assigned_site,
                    projects_str,
                    assigned_group
                ])
                
        print(f"✅ Génération terminée. Fichier: {out_path}")

    except Exception as e:
        print(f"❌ Erreur: {e}")
    finally:
        db.close()

if __name__ == "__main__":
    generate_csv()
