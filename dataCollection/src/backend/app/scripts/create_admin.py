from sqlalchemy.orm import Session

from app.database.session import SessionLocal
from app.core.security import hash_password

import app.models

from app.models.app_user import AppUser, UserRoleEnum


def create_admin():
    db: Session = SessionLocal()

    try:
        existing_admin = db.query(AppUser).filter(
            AppUser.role == UserRoleEnum.super_admin
        ).first()

        if existing_admin:
            print(f"Super admin already exists: {existing_admin.email}")
            return

        admin = AppUser(
            email="admin@test.com",
            hashed_password=hash_password("admin123"),
            role=UserRoleEnum.super_admin,
            is_active=True,
            name="Super Admin",
        )

        db.add(admin)
        db.commit()
        print("✅ Super admin created successfully.")
        print("   Email    : admin@test.com")
        print("   Password : admin123")

    except Exception as e:
        db.rollback()
        print("Error:", e)

    finally:
        db.close()


if __name__ == "__main__":
    create_admin()