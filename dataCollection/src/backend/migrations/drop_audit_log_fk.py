"""
Migration: Drop foreign key constraint on audit_log.user_id

Reason: The application uses a multi-database architecture where:
- auth_db contains the app_user table (shared authentication)
- Tenant databases (gitlab_kpi1, etc.) contain the audit_log table

PostgreSQL cannot enforce foreign key constraints across databases.
The user_id field is designed to be nullable and should store the user ID
from auth_db without a database-level FK constraint.
"""

from sqlalchemy import text

def upgrade():
    """Drop the foreign key constraint on audit_log.user_id"""
    # Drop the foreign key constraint
    sql = """
    ALTER TABLE audit_log 
    DROP CONSTRAINT IF EXISTS audit_log_user_id_fkey;
    """
    return text(sql)

def downgrade():
    """Re-add the foreign key constraint (not recommended for multi-db architecture)"""
    sql = """
    ALTER TABLE audit_log 
    ADD CONSTRAINT audit_log_user_id_fkey 
    FOREIGN KEY (user_id) REFERENCES app_user(id) ON DELETE SET NULL;
    """
    return text(sql)
