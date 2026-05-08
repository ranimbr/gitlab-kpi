import sys
import os

# Add the parent directory to sys.path to allow imports from 'app'
sys.path.append(os.path.join(os.path.dirname(__file__), "..", ".."))

from sqlalchemy import text
from app.database.session import SessionLocal

def clear_database():
    db = SessionLocal()
    try:
        print("Starting database cleanup...")
        
        # Order is important for foreign keys if CASCADE is not used
        # We'll use TRUNCATE ... CASCADE for PostgreSQL as it's the safest/fastest
        tables = [
            "kpi_snapshot",
            "commit",
            "merge_request",
            "extraction_lot",
            "developer_project",
            "developer",
            "project",
            "period",
            "site",
            "squad",
            "audit_log"
        ]
        
        for table in tables:
            try:
                print(f"Clearing table: {table}")
                # We use DELETE because TRUNCATE might require superuser or have specific locks
                # and DELETE with CASCADE (if defined in models) or manual order is fine.
                # Actually, many models have ondelete="CASCADE" in their foreign keys.
                db.execute(text(f"DELETE FROM {table}"))
            except Exception as e:
                print(f"Warning: Could not clear table {table}: {e}")
                db.rollback()
        
        db.commit()
        print("Database cleanup completed successfully (kept app_user and gitlab_config).")
    except Exception as e:
        print(f"Error during cleanup: {e}")
        db.rollback()
    finally:
        db.close()

if __name__ == "__main__":
    clear_database()
