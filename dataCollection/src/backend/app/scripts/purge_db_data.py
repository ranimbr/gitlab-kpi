import logging
from sqlalchemy import inspect, text
from app.database.session import engine

# Configurer le logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger("purge_db")

def purge_data():
    # Tables à NE PAS vider
    KEEP_TABLES = ["app_user", "alembic_version"]
    
    logger.info("--- 🗑️  DATABASE PURGE START ---")
    
    try:
        inspector = inspect(engine)
        all_tables = inspector.get_table_names()
        
        # Filtrer les tables à vider
        tables_to_purge = [t for t in all_tables if t not in KEEP_TABLES]
        
        if not tables_to_purge:
            logger.info("No tables to purge.")
            return

        with engine.begin() as conn:
            # Désactiver temporairement les contraintes pour plus de sécurité (optionnel avec CASCADE)
            logger.info(f"Purging {len(tables_to_purge)} tables...")
            
            # Construction de la commande TRUNCATE pour PostgreSQL
            tables_str = ", ".join([f'"{t}"' for t in tables_to_purge])
            truncate_query = text(f"TRUNCATE TABLE {tables_str} RESTART IDENTITY CASCADE;")
            
            conn.execute(truncate_query)
            logger.info("✅ All data tables purged successfully (CASCADE).")
            logger.info(f"Preserved tables: {', '.join(KEEP_TABLES)}")
            
    except Exception as e:
        logger.error(f"❌ Purge failed: {e}")
        
    logger.info("--- ✨ DATABASE PURGE FINISHED ---")

if __name__ == "__main__":
    purge_data()
