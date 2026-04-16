from app.database.session import SessionLocal
from sqlalchemy import text
from app.models.base import Base
import app.models.app_user
import app.models.developer
import app.models.project
import app.models.gitlab_config
import app.models.commit
import app.models.merge_request
import app.models.dashboard
import app.models.extraction_lot
import app.models.site

db = SessionLocal()
tables = [mapper.local_table.name for mapper in Base.registry.mappers]
tables_to_truncate = [t for t in tables if t not in ('app_user', 'gitlab_config', 'site', 'gitlab_config_site')]

try:
    # ── Forcer la fermeture des autres connexions pour éviter les locks ──────
    db.execute(text("""
        SELECT pg_terminate_backend(pid) 
        FROM pg_stat_activity 
        WHERE datname = 'kpi_dashboard' 
          AND pid <> pg_backend_pid();
    """))
    db.commit()

    db.execute(text('SET lock_timeout = "10s";'))
    
    # Tables à vider (sauf admin et config critique)
    for table in tables_to_truncate:
        print(f'Truncating {table}...')
        try:
            db.execute(text(f'TRUNCATE TABLE "{table}" CASCADE;'))
            db.commit()
        except Exception as e:
            print(f'Warning: Could not-truncate {table}: {e}')
            db.rollback()

    print('\nDATABASE CLEANED SUCCESSFULLY!')
except Exception as e:
    db.rollback()
    import traceback
    traceback.print_exc()
    print('FATAL ERROR TRUNCATING', str(e))
finally:
    db.close()
