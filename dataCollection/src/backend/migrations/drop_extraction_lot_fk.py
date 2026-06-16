"""
Migration: Drop foreign key constraint on extraction_lot.triggered_by

Reason: The application uses a multi-database architecture where:
- auth_db contains the app_user table (shared authentication)
- Tenant databases (gitlab_kpi1, etc.) contain the extraction_lot table

PostgreSQL cannot enforce foreign key constraints across databases.
The triggered_by field is designed to be nullable and should store the user ID
from auth_db without a database-level FK constraint.
"""

from sqlalchemy import text
from app.database.session import get_engine_for_db
from app.core.config import get_settings
import logging

logger = logging.getLogger(__name__)
settings = get_settings()

def migrate():
    """Drop the foreign key constraint from extraction_lot.triggered_by"""
    
    # List of tenant databases that need this migration
    tenant_dbs = ["gitlab_kpi1"]  # Add more tenant DBs as needed
    
    for db_name in tenant_dbs:
        try:
            engine = get_engine_for_db(db_name)
            
            with engine.connect() as conn:
                # Check if constraint exists
                check_query = text("""
                    SELECT COUNT(*) 
                    FROM information_schema.table_constraints 
                    WHERE constraint_name = 'extraction_lot_triggered_by_fkey'
                    AND table_name = 'extraction_lot'
                """)
                result = conn.execute(check_query)
                constraint_exists = result.scalar() > 0
                
                if constraint_exists:
                    # Drop the constraint
                    alter_query = text("""
                        ALTER TABLE extraction_lot 
                        DROP CONSTRAINT extraction_lot_triggered_by_fkey
                    """)
                    conn.execute(alter_query)
                    conn.commit()
                    logger.info(f"✅ Dropped extraction_lot_triggered_by_fkey constraint from database '{db_name}'")
                else:
                    logger.info(f"ℹ️  Constraint extraction_lot_triggered_by_fkey does not exist in database '{db_name}' (already migrated)")
                    
        except Exception as e:
            logger.error(f"❌ Failed to migrate database '{db_name}': {e}")
            raise

if __name__ == "__main__":
    logger.info("Starting migration: Drop extraction_lot.triggered_by foreign key constraint")
    migrate()
    logger.info("Migration completed successfully")
