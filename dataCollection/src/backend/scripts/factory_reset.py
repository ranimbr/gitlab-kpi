
import os
import shutil
from pathlib import Path
from sqlalchemy import text
from app.database.session import SessionLocal
from app.models.site import Site
from app.models.developer_group import DeveloperGroup
from app.models.project import Project
from app.models.gitlab_config import GitLabConfig
from app.models.period import Period

def run_factory_reset():
    print("--- Demarrage du FACTORY RESET (Senior Grade) ---")
    db = SessionLocal()
    try:
        # 1. Nettoyage de la base de donnees (Ordre strict des FK)
        # Note: On utilise des guillemets pour "commit" car c'est un mot reservé SQL
        tables_to_wipe = [
            "comment",
            "commit_merge_request",
            "alert",
            "kpi_snapshot",
            "\"commit\"",
            "merge_request",
            "extraction_lot",
            "developer_project",
            "developer_site",
            "developer_group_site",
            "developer",
            "developer_group",
            "site",
            "project"
        ]

        print("--- Nettoyage des tables ---")
        for table in tables_to_wipe:
            try:
                db.execute(text(f"DELETE FROM {table}"))
                db.commit() # Commit immediat pour eviter le blocage de transaction sur erreur
                print(f"  OK: Table {table} videe.")
            except Exception as e:
                db.rollback()
                print(f"  SKIP: {table} (doublon ou contrainte deja geree) : {str(e)[:50]}...")

        # 2. Nettoyage des fichiers Dumps
        dump_dir = Path("dumps")
        if dump_dir.exists():
            print("--- Nettoyage des fichiers ---")
            for f in dump_dir.glob("*.json"):
                try:
                    f.unlink()
                    print(f"  DEL: Supprime : {f.name}")
                except:
                    pass
        
        # 3. Re-initialisation du socle Baseline
        print("--- Initialisation du socle Baseline ---")
        
        # Sites
        sites_map = {}
        sites_data = [
            {"name": "Tunis", "country": "Tunisie", "timezone": "Africa/Tunis"},
            {"name": "Paris", "country": "France", "timezone": "Europe/Paris"},
            {"name": "Madrid", "country": "Espagne", "timezone": "Europe/Madrid"}
        ]
        for s_data in sites_data:
            s = Site(**s_data)
            db.add(s)
            db.flush()
            sites_map[s.name] = s
        
        # Squads
        groups_data = [
            {"name": "Squad A", "description": "Equipe de Developpement A"},
            {"name": "Squad B", "description": "Equipe de Developpement B"}
        ]
        for g_data in groups_data:
            g = DeveloperGroup(**g_data)
            # Liaison optionnelle au site Tunis par defaut pour la demo
            if "Tunis" in sites_map:
                g.sites.append(sites_map["Tunis"])
            db.add(g)
        
        db.flush()

        # Projets
        cfg = db.query(GitLabConfig).first()
        if not cfg:
            print("--- Erreur : Aucune configuration GitLab trouvee. ---")
            return

        projects_data = [
            {
                "name": "gitlab-org/gitlab-docs",
                "gitlab_project_id": 1794617,
                "gitlab_config_id": cfg.id,
                "description": "Documentation officielle GitLab",
                "is_active": True
            },
            {
                "name": "gitlab-com/runbooks",
                "gitlab_project_id": 1148549,
                "gitlab_config_id": cfg.id,
                "description": "Runbooks infrastructure GitLab",
                "is_active": True
            }
        ]
        for p_data in projects_data:
            db.add(Project(**p_data))
        
        db.commit()
        print("--- STATUS FINAL ---")
        print("OK: Base de donnees reinitialisee.")
        print("OK: Sites (3) et Squads (2) crees.")
        print(f"OK: Projets (2) rattaches a la config : {cfg.domain}")
        print("\nBRAVO: PRET POUR LA DEMONSTRATION DE GENERICITE !")

    except Exception as e:
        db.rollback()
        print(f"--- ERREUR CRITIQUE lors du reset : {str(e)}")
    finally:
        db.close()

if __name__ == "__main__":
    run_factory_reset()
