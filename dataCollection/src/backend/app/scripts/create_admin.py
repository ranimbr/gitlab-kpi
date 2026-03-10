from sqlalchemy.orm import Session

from app.database.session import SessionLocal
from app.core.security import hash_password

# ✅ Charge tous les modèles
import app.models  

from app.models.app_user import AppUser


def create_admin():
    db: Session = SessionLocal()

    try:
        existing_admin = db.query(AppUser).filter(AppUser.role == "admin").first()

        if existing_admin:
            print("Admin already exists.")
            return

        admin = AppUser(
            email="admin@test.com",
            hashed_password=hash_password("admin123"),
            role="admin",
            is_active=True
        )

        db.add(admin)
        db.commit()

        print("Admin created successfully.")

    except Exception as e:
        db.rollback()
        print("Error:", e)

    finally:
        db.close()


if __name__ == "__main__":
    create_admin()
