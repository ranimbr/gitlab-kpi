from app.database.session import SessionLocal
from app.models.app_user import AppUser
from app.models.dashboard import Dashboard
from app.models.project import Project

def prime():
    db = SessionLocal()
    try:
        # 1. Récupérer l'Admin
        admin = db.query(AppUser).filter(AppUser.email == "admin@test.com").first()
        if not admin:
            print("Error: Admin not found")
            return
        
        # 2. Récupérer le Projet 1
        project = db.query(Project).get(1)
        if not project:
            print("Error: Project ID 1 not found")
            return

        # 3. Supprimer les vieux dashboards orphelins (Nettoyage Senior)
        db.query(Dashboard).filter(Dashboard.created_by == admin.id).delete()
        
        # 4. Créer le Dashboard de Pilotage Principal
        new_dash = Dashboard(
            name="Pilotage Stratégique - GitLab Docs",
            description="Vue consolidée des sites Madrid, Tunis et Paris",
            project_id=project.id,
            created_by=admin.id,
            is_public=True,
        )
        db.add(new_dash)
        db.flush() # Pour avoir l'ID
        
        # 5. Mettre à jour l'accès de l'utilisateur
        admin.dashboard_access = [new_dash.id]
        
        db.commit()
        print(f"Success: Dashboard #{new_dash.id} created and assigned to {admin.email}")

    except Exception as e:
        db.rollback()
        print(f"Error: {e}")
    finally:
        db.close()

if __name__ == "__main__":
    prime()
