"""
add_profile_menu_management

Migration pour ajouter le système de gestion des profils et menus.
- Création des tables Profile, MenuItem, ProfileMenuItem
- Ajout de profile_id et project_ids à AppUser
- Ajout du rôle project_manager à UserRoleEnum
"""
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

# revision identifiers
revision = 'add_profile_menu_management'
down_revision = '5af652e3cdb7'
branch_labels = None
depends_on = '5af652e3cdb7'


def upgrade():
    # 1. Créer l'enum type pour UserRoleEnum avec project_manager
    # PostgreSQL : créer un nouveau type et migrer les données
    # On saute cette étape car l'enum existe déjà dans la base de données
    
    # 2. Créer la table Profile
    op.create_table(
        'profile',
        sa.Column('id', sa.Integer(), primary_key=True),
        sa.Column('name', sa.String(100), nullable=False, unique=True),
        sa.Column('description', sa.String(500), nullable=True),
        sa.Column('created_at', sa.DateTime(timezone=True), nullable=False, server_default=sa.text('NOW()')),
        sa.Column('updated_at', sa.DateTime(timezone=True), nullable=False, server_default=sa.text('NOW()')),
    )
    op.create_index('idx_profile_name', 'profile', ['name'])
    
    # 3. Créer la table MenuItem
    op.create_table(
        'menu_item',
        sa.Column('id', sa.Integer(), primary_key=True),
        sa.Column('label', sa.String(100), nullable=False),
        sa.Column('route', sa.String(255), nullable=True),
        sa.Column('icon', sa.String(50), nullable=True),
        sa.Column('parent_id', sa.Integer(), nullable=True),
        sa.Column('order_index', sa.Integer(), nullable=False, server_default='0'),
        sa.Column('is_active', sa.Boolean(), nullable=False, server_default='true'),
        sa.ForeignKeyConstraint(['parent_id'], ['menu_item.id'], ondelete='CASCADE'),
    )
    op.create_index('idx_menuitem_label', 'menu_item', ['label'])
    op.create_index('idx_menuitem_route', 'menu_item', ['route'])
    op.create_index('idx_menuitem_parent', 'menu_item', ['parent_id'])
    op.create_index('idx_menuitem_order', 'menu_item', ['order_index'])
    
    # 4. Créer la table ProfileMenuItem (table d'association)
    op.create_table(
        'profile_menu_item',
        sa.Column('profile_id', sa.Integer(), primary_key=True, nullable=False),
        sa.Column('menu_item_id', sa.Integer(), primary_key=True, nullable=False),
        sa.Column('has_access', sa.Boolean(), nullable=False, server_default='false'),
        sa.ForeignKeyConstraint(['profile_id'], ['profile.id'], ondelete='CASCADE'),
        sa.ForeignKeyConstraint(['menu_item_id'], ['menu_item.id'], ondelete='CASCADE'),
    )
    op.create_index('idx_profilemenu_profile', 'profile_menu_item', ['profile_id'])
    op.create_index('idx_profilemenu_menu', 'profile_menu_item', ['menu_item_id'])
    op.create_index('idx_profilemenu_access', 'profile_menu_item', ['profile_id', 'has_access'])
    
    # 5. Ajouter profile_id à AppUser
    op.add_column('app_user', sa.Column('profile_id', sa.Integer(), nullable=True))
    op.create_foreign_key(
        'fk_app_user_profile',
        'app_user', 'profile',
        ['profile_id'], ['id'],
        ondelete='SET NULL'
    )
    op.create_index('idx_appuser_profile', 'app_user', ['profile_id'])
    
    # 6. Ajouter project_ids à AppUser (PostgreSQL ARRAY)
    op.add_column('app_user', sa.Column('project_ids', postgresql.ARRAY(sa.Integer()), nullable=True, server_default='{}'))


def downgrade():
    # 6. Supprimer project_ids de AppUser
    op.drop_column('app_user', 'project_ids')
    
    # 5. Supprimer profile_id de AppUser
    op.drop_index('idx_appuser_profile', 'app_user')
    op.drop_constraint('fk_app_user_profile', 'app_user', type_='foreignkey')
    op.drop_column('app_user', 'profile_id')
    
    # 4. Supprimer ProfileMenuItem
    op.drop_index('idx_profilemenu_access', 'profile_menu_item')
    op.drop_index('idx_profilemenu_menu', 'profile_menu_item')
    op.drop_index('idx_profilemenu_profile', 'profile_menu_item')
    op.drop_table('profile_menu_item')
    
    # 3. Supprimer MenuItem
    op.drop_index('idx_menuitem_order', 'menu_item')
    op.drop_index('idx_menuitem_parent', 'menu_item')
    op.drop_index('idx_menuitem_route', 'menu_item')
    op.drop_index('idx_menuitem_label', 'menu_item')
    op.drop_constraint('menu_item_parent_id_fkey', 'menu_item', type_='foreignkey')
    op.drop_table('menu_item')
    
    # 2. Supprimer Profile
    op.drop_index('idx_profile_name', 'profile')
    op.drop_table('profile')
    
    # 1. Supprimer project_manager de UserRoleEnum (optionnel, PostgreSQL ne permet pas de supprimer une valeur d'enum facilement)
    # On laisse le type tel quel pour éviter les problèmes
