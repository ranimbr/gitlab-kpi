import sys
import os

sys.path.append(os.path.dirname(os.path.abspath(__file__)))

from sqlalchemy import delete, text
from app.database.session import SessionLocal

# Tables to wipe out
TABLES_TO_CLEAN = [
    "kpi_snapshot",
    "kpi_threshold",
    "kpi_definition",
    "extraction_lot",
    "audit_log",
    "merge_request",
    "git_commit",
    "developer_project",
    "developer",
    "project",
    "app_user"
]

def clean_database():
    print("🧹 Nettoyage PROFOND de la base de données...")
    db = SessionLocal()
    try:
        # Save Admin user and GitLab Config
        admin_user = db.execute(text("SELECT * FROM app_user WHERE role='super_admin'")).fetchone()
        gitlab_config = db.execute(text("SELECT * FROM gitlab_config")).fetchone()
        
        # Supprimer les tables
        for table in TABLES_TO_CLEAN:
            print(f"  - Suppression des données de la table : {table}...")
            db.execute(text(f"TRUNCATE TABLE {table} CASCADE"))
            
        print("\n✅ Toutes les données ont été effacées.")

        # Re-insert Admin if existed
        if admin_user:
            print("🛡️ Restauration de l'utilisateur SUPER_ADMIN...")
            db.execute(text(f"""
                INSERT INTO app_user (id, login, email, hashed_password, role, is_active)
                VALUES (:id, :login, :email, :hashed_password, :role, :is_active)
            """), {
                "id": admin_user.id,
                "login": getattr(admin_user, 'login', None),
                "email": admin_user.email,
                "hashed_password": admin_user.hashed_password,
                "role": admin_user.role,
                "is_active": admin_user.is_active
            })
            
        db.commit()
        print("\n✨ NETTOYAGE TERMINÉ AVEC SUCCÈS. ✨")
        print("💡 Vous pouvez maintenant importer votre propre CSV via le Setup Wizard.")

    except Exception as e:
        db.rollback()
        print(f"❌ Erreur lors du nettoyage : {e}")
    finally:
        db.close()

if __name__ == "__main__":
    clean_database()
