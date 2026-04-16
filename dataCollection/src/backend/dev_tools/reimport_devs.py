import os
import sys

# Add backend to path
BACKEND_DIR = os.path.dirname(os.path.abspath(__file__))
sys.path.append(BACKEND_DIR)

from app.database.session import SessionLocal
from app.services.admin.developer_service import DeveloperService
from app.models.app_user import AppUser

def reimport():
    # Correction du chemin : on monte de 2 niveaux depuis src/backend vers la racine dataCollection
    ROOT_DIR = os.path.dirname(os.path.dirname(BACKEND_DIR))
    csv_path = os.path.join(ROOT_DIR, "test_developpeurs_final.csv")
    print(f"Importing from {csv_path}...")
    
    if not os.path.exists(csv_path):
        print(f"ERROR: File not found: {csv_path}")
        return

    with open(csv_path, "rb") as f:
        content = f.read()
    
    db = SessionLocal()
    service = DeveloperService()
    
    try:
        # We need an admin user ID for 'created_by'
        admin = db.query(AppUser).filter(AppUser.is_admin == True).first()
        admin_id = admin.id if admin else None
        
        # Call the actual service logic
        import_results = service.import_from_file(
            db=db, 
            file_content=content, 
            file_name="test_developpeurs_final.csv", 
            imported_by=admin_id,
            create_missing_sites=True,
            create_missing_projects=True,
            create_missing_groups=True
        )
        # Service already commits if not dry_run
        print(f"SUCCESS: Import finished: {import_results['success_count']} devs imported.")
    except Exception as e:
        print(f"ERROR during import: {e}")
        import traceback
        traceback.print_exc()
        db.rollback()
    finally:
        db.close()

if __name__ == "__main__":
    reimport()
