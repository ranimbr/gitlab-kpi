import sys
import os

# Add the parent directory to sys.path to allow imports from 'app'
sys.path.append(os.path.join(os.path.dirname(__file__), "..", ".."))

from sqlalchemy import text
from app.database.session import SessionLocal

def clear_database():
    db = SessionLocal()
    try:
        print("Starting ROBUST database cleanup...")
        
        # We want to clear everything EXCEPT app_user and gitlab_config.
        # However, gitlab_config is linked to site, and projects are linked to gitlab_config.
        # The user wants to KEEP gitlab_config.
        
        # 1. First, find all tables in the database
        res = db.execute(text("""
            SELECT tablename 
            FROM pg_catalog.pg_tables 
            WHERE schemaname = 'public'
        """))
        all_tables = [row[0] for row in res]
        print(f"Found tables: {all_tables}")
        
        # 2. Identify tables to keep
        tables_to_keep = ["app_user", "gitlab_config", "alembic_version"]
        tables_to_clear = [t for t in all_tables if t not in tables_to_keep]
        
        # Special case: 'site' is often linked by 'gitlab_config' (FK).
        # If we keep gitlab_config, we should probably keep the sites it references,
        # OR set gitlab_config.site_id to NULL before clearing 'site'.
        
        print(f"Updating gitlab_config to detach from sites...")
        db.execute(text("UPDATE gitlab_config SET site_id = NULL"))
        
        print(f"Tables to clear: {tables_to_clear}")
        
        # 3. Use TRUNCATE CASCADE for all target tables
        # Joining them in a single command is more efficient and handles cross-references
        if tables_to_clear:
            quoted_tables = [f'"{t}"' for t in tables_to_clear]
            truncate_query = f"TRUNCATE TABLE {', '.join(quoted_tables)} CASCADE"
            print(f"Executing: {truncate_query}")
            db.execute(text(truncate_query))
        
        db.commit()
        print("Database cleanup completed successfully (kept app_user and gitlab_config).")
    except Exception as e:
        print(f"Error during cleanup: {e}")
        db.rollback()
    finally:
        db.close()

if __name__ == "__main__":
    clear_database()
