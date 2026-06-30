import sys
from app.database.session import DynamicSessionLocal
from app.models.app_user import AppUser

def fix_user_id_1():
    session = DynamicSessionLocal('gitlab_kpi1')
    
    # Check if user ID 1 exists
    user = session.query(AppUser).filter(AppUser.id == 1).first()
    
    if user:
        print(f"User ID 1 already exists: {user.email} ({user.name})")
    else:
        print("User ID 1 does not exist. Creating...")
        
        # Create user ID 1
        new_user = AppUser(
            id=1,
            email="admin@kpi-dashboard.com",
            login="admin",
            name="System Admin",
            hashed_password="$2b$12$placeholder",  # Placeholder password
            role="super_admin",
            is_active=True,
            dashboard_access=True
        )
        
        session.add(new_user)
        session.commit()
        print("User ID 1 created successfully")
    
    session.close()

if __name__ == "__main__":
    fix_user_id_1()
