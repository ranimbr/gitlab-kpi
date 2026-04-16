import os
import subprocess
import sys
import logging
from sqlalchemy import inspect
from app.database.session import engine
from app.core.config import get_settings

# Configurer le logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger("setup_db")

def setup_db():
    settings = get_settings()
    logger.info("--- 🚀 DATABASE SYNCHRONIZATION START ---")
    
    try:
        inspector = inspect(engine)
        tables = inspector.get_table_names()
        logger.info(f"Existing tables: {len(tables)}")
        
        # 1. Check if tables exist but alembic_version is missing
        has_site = "site" in tables
        has_alembic = "alembic_version" in tables
        
        if has_site and not has_alembic:
            logger.warning("⚠️  Tables exist but alembic_version is missing.")
            logger.info("👉 Stamping database with initial revision '084f2b91a770'...")
            # We stamp to the first revision to avoid 'Table already exists' during upgrade
            subprocess.run(["alembic", "stamp", "084f2b91a770"], check=True)
            logger.info("✅ Database stamped.")
        
        # 2. Run migrations (upgrade head)
        logger.info("🔄 Running migrations (alembic upgrade head)...")
        result = subprocess.run(["alembic", "upgrade", "head"], capture_output=True, text=True)
        
        if result.returncode != 0:
            if "already exists" in result.stderr or "dupliquée" in result.stderr:
                logger.warning("⚠️  Migrations conflict (likely columns already exist).")
                logger.info("👉 Stamping to 'head' to bypass initialization conflicts...")
                subprocess.run(["alembic", "stamp", "head"], check=True)
                logger.info("✅ Database stamped to head.")
            else:
                logger.error(f"❌ Alembic failed: {result.stderr}")
                logger.info("👉 Emergency fallback: Running SQLAlchemy create_all()...")
                from app.database.init_db import init_db
                init_db()
                logger.info("✅ Tables forced via create_all.")
        else:
            logger.info("✅ Migrations completed successfully.")
        
        # 3. Always ensure admin user exists and password is synced
        logger.info("👤 Ensuring admin user is in sync...")
        from app.scripts.create_admin import create_admin
        create_admin()
        
    except Exception as e:
        logger.error(f"❌ Database setup failed: {e}")
        
    logger.info("--- ✨ DATABASE SETUP FINISHED ---")

if __name__ == "__main__":
    setup_db()
