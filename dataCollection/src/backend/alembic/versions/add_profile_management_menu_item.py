"""
add_profile_management_menu_item

Migration pour ajouter le menu item de gestion des profils.
- Ajoute le menu "Gestion des Profils" pour accéder à la page ProfileManagementPage
"""
from alembic import op
import sqlalchemy as sa

# revision identifiers
revision = 'add_profile_management_menu_item'
down_revision = 'add_profile_menu_management'
branch_labels = None
depends_on = 'add_profile_menu_management'


def upgrade():
    # Insérer le menu item pour la gestion des profils
    # Note: Le label doit commencer par "Admin - " pour apparaître dans la section Configuration
    op.execute("""
        INSERT INTO menu_item (label, route, icon, parent_id, order_index, is_active, created_at, updated_at)
        VALUES ('Admin - Profils', '/admin/profiles', 'ri-user-settings-line', NULL, 100, true, NOW(), NOW())
    """)


def downgrade():
    # Supprimer le menu item de gestion des profils
    op.execute("""
        DELETE FROM menu_item 
        WHERE label = 'Admin - Profils' 
        AND route = '/admin/profiles'
    """)
