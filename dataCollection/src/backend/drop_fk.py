from app.database.session import get_engine_for_db
from sqlalchemy import text

engine = get_engine_for_db('gitlab_kpi1')

with engine.connect() as conn:
    conn.execute(text('ALTER TABLE audit_log DROP CONSTRAINT IF EXISTS audit_log_user_id_fkey'))
    conn.commit()
    print('FK constraint dropped successfully')
