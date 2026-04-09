from sqlalchemy.orm import Session

from app.database.session import SessionLocal
from app.core.security import hash_password

import app.models

from app.models.app_user import AppUser, UserRoleEnum


from app.core.config import get_settings

def create_admin():
    settings = get_settings()
    db: Session = SessionLocal()
    
    email = settings.ADMIN_EMAIL or "admin@test.com"
    password = settings.ADMIN_PASSWORD or "admin123"

    try:
        # On cherche l'utilisateur par son email
        admin = db.query(AppUser).filter(AppUser.email == email).first()

        if admin:
            print(f"Super admin already exists ({email}). Updating password...")
            admin.hashed_password = hash_password(password)
            admin.role = UserRoleEnum.super_admin
        else:
            print(f"Creating new super admin: {email}")
            admin = AppUser(
                email=email,
                hashed_password=hash_password(password),
                role=UserRoleEnum.super_admin,
                is_active=True,
                name="Super Admin",
            )
            db.add(admin)
        
        db.commit()
        print(f"✅ Super admin localized successfully.")
        print(f"   Email    : {email}")
        print(f"   Password : {password}")

    except Exception as e:
        db.rollback()
        print("Error:", e)

    finally:
        db.close()


if __name__ == "__main__":
    create_admin()