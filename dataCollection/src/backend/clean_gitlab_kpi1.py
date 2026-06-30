import sys
sys.path.insert(0, '.')

from app.database.session import current_db_var, SessionLocal
from sqlalchemy import text

current_db_var.set('gitlab_kpi1')
db = SessionLocal()

KEEP = {'app_user', 'gitlab_config', 'audit_log', 'profile', 'menu_item'}

result = db.execute(text("SELECT tablename FROM pg_tables WHERE schemaname = 'public' ORDER BY tablename"))
all_tables = [row[0] for row in result]

print('Tables in gitlab_kpi1:')
for t in all_tables:
    print(f'  {t}')

to_truncate = [t for t in all_tables if t not in KEEP]

print(f'\nTables to truncate: {len(to_truncate)}')
for t in to_truncate:
    print(f'  {t}')

print('\nExecuting TRUNCATE...')
for t in to_truncate:
    db.execute(text(f'TRUNCATE TABLE {t} CASCADE'))
    print(f'  Truncated {t}')

db.commit()
print('Done')
db.close()
