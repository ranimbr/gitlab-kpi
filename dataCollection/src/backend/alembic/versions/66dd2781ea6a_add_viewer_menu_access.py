"""add_viewer_menu_access

Revision ID: 66dd2781ea6a
Revises: 10067eb6f8ff
Create Date: 2026-06-14 02:02:10.254155

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
from sqlalchemy import create_engine, text


# revision identifiers, used by Alembic.
revision: str = '66dd2781ea6a'
down_revision: Union[str, Sequence[str], None] = '10067eb6f8ff'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Upgrade schema."""
    from app.core.config import Settings
    settings = Settings()
    
    # Add menu access for Viewer profile (ID 7) in all databases
    # Menu IDs are different across databases:
    # auth_db: menu 11 = Analytics Comparison
    # gitlab_kpi1: menu 12 = Analytics Comparison
    # telnetdb: menu 11 = Analytics Comparison
    database_menu_ids = {
        "auth_db": [11, 12, 15],  # Analytics Comparison, Analytics Diagnostic, Analyses KPI
        "gitlab_kpi1": [12, 15],  # Analytics Comparison, Analyses KPI
        "telnetdb": [11, 15],  # Analytics Comparison, Analyses KPI
    }
    
    for db_name, menu_ids in database_menu_ids.items():
        if db_name == "auth_db":
            db_url = f"postgresql://{settings.POSTGRES_USER}:{settings.POSTGRES_PASSWORD}@{settings.POSTGRES_HOST}:{settings.POSTGRES_PORT}/{db_name}"
        else:
            db_url = f"postgresql://{settings.POSTGRES_USER}:{settings.POSTGRES_PASSWORD}@{settings.POSTGRES_HOST}:{settings.POSTGRES_PORT}/{db_name}"
        
        engine = create_engine(db_url)
        with engine.connect() as conn:
            # Add access to Analytics menus
            for menu_id in menu_ids:
                conn.execute(text(f"""
                    INSERT INTO profile_menu_item (profile_id, menu_item_id, has_access) 
                    VALUES (7, {menu_id}, true) 
                    ON CONFLICT (profile_id, menu_item_id) DO UPDATE SET has_access = true
                """))
                print(f"✅ Added access to menu {menu_id} for Viewer profile in {db_name}")
            
            # Also add basic access to Dashboard and Projects
            basic_menus = [1, 2]  # Dashboard, Projects
            for menu_id in basic_menus:
                conn.execute(text(f"""
                    INSERT INTO profile_menu_item (profile_id, menu_item_id, has_access) 
                    VALUES (7, {menu_id}, true) 
                    ON CONFLICT (profile_id, menu_item_id) DO UPDATE SET has_access = true
                """))
                print(f"✅ Added access to menu {menu_id} for Viewer profile in {db_name}")
            
            conn.commit()
        engine.dispose()
    
    print("✅ Viewer menu access configured in all databases")


def downgrade() -> None:
    """Downgrade schema."""
    from app.core.config import Settings
    settings = Settings()
    
    # Remove menu access for Viewer profile
    db_url = f"postgresql://{settings.POSTGRES_USER}:{settings.POSTGRES_PASSWORD}@{settings.POSTGRES_HOST}:{settings.POSTGRES_PORT}/auth_db"
    engine = create_engine(db_url)
    with engine.connect() as conn:
        conn.execute(text("DELETE FROM profile_menu_item WHERE profile_id = 7"))
        conn.commit()
        print("✅ Viewer menu access removed")
    engine.dispose()
