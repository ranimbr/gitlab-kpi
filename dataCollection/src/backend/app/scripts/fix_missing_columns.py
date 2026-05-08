import logging
from sqlalchemy import text
from app.database.session import engine

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger("fix_schema")

def fix_schema():
    logger.info("--- 🛠️ FIXING MISSING SCHEMA COLUMNS ---")
    
    with engine.connect() as conn:
        try:
            # On tente d'ajouter la colonne offboarding_date si elle manque
            logger.info("Adding 'offboarding_date' to 'developer' table...")
            conn.execute(text("ALTER TABLE developer ADD COLUMN IF NOT EXISTS offboarding_date DATE;"))
            
            # On en profite pour vérifier duration_ms et api_calls_count dans extraction_lot (Master Lot logic)
            logger.info("Checking 'extraction_lot' columns...")
            conn.execute(text("ALTER TABLE extraction_lot ADD COLUMN IF NOT EXISTS duration_ms INTEGER;"))
            conn.execute(text("ALTER TABLE extraction_lot ADD COLUMN IF NOT EXISTS api_calls_count INTEGER;"))
            conn.execute(text("ALTER TABLE extraction_lot ADD COLUMN IF NOT EXISTS step_progress JSONB;"))
            conn.execute(text("ALTER TABLE extraction_lot ADD COLUMN IF NOT EXISTS metadata_summary JSONB;"))
            
            conn.commit()
            logger.info("✅ Schema updated successfully.")
        except Exception as e:
            logger.error(f"❌ Failed to update schema: {e}")
            conn.rollback()

if __name__ == "__main__":
    fix_schema()
