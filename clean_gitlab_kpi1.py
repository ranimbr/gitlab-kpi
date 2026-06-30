import sys
sys.path.insert(0, 'dataCollection/src/backend')

from app.database.session import current_db_var, SessionLocal
from sqlalchemy import text

# Set database to gitlab_kpi1
current_db_var.set('gitlab_kpi1')

db = SessionLocal()

# Tables à CONSERVER (ne pas vider)
KEEP_TABLES = {
    'app_user',
    'gitlab_config', 
    'audit_log',
    'profile',  # relation avec profils
    'menu_item',  # relation avec gestion menu
}

# Lister toutes les tables
result = db.execute(text("SELECT tablename FROM pg_tables WHERE schemaname = 'public' ORDER BY tablename"))
all_tables = [row[0] for row in result]

print("=== Tables dans gitlab_kpi1 ===")
for table in all_tables:
    print(f"  - {table}")

# Tables à vider
tables_to_truncate = [t for t in all_tables if t not in KEEP_TABLES]

print(f"\n=== Tables à vider ({len(tables_to_truncate)}) ===")
for table in tables_to_truncate:
    print(f"  - {table}")

print("\n=== FIN DU LISTAGE - AUCUNE ACTION DE NETTOYAGE EXÉCUTÉE ===")

db.close()
