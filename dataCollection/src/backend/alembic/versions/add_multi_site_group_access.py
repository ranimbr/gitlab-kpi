"""
add_multi_site_group_access

Migration pour ajouter le support multi-sites et multi-équipes.
- Création de la table user_site_access (liaison many-to-many AppUser ↔ Site)
- Création de la table user_group_access (liaison many-to-many AppUser ↔ DeveloperGroup)
- Permet aux utilisateurs d'avoir accès à plusieurs sites et plusieurs équipes
"""
from alembic import op
import sqlalchemy as sa

# revision identifiers
revision = 'add_multi_site_group_access'
down_revision = 'add_dynamic_role_management'
branch_labels = None
depends_on = 'add_dynamic_role_management'


def upgrade():
    # 1. Créer la table user_site_access
    op.create_table(
        'user_site_access',
        sa.Column('id', sa.Integer(), primary_key=True, autoincrement=True),
        sa.Column('user_id', sa.Integer(), nullable=False),
        sa.Column('site_id', sa.Integer(), nullable=False),
        sa.Column('is_primary', sa.Boolean(), nullable=False, server_default='false'),
        sa.Column('assigned_at', sa.DateTime(timezone=True), nullable=False, server_default=sa.text('NOW()')),
        sa.ForeignKeyConstraint(['user_id'], ['app_user.id'], ondelete='CASCADE'),
        sa.ForeignKeyConstraint(['site_id'], ['site.id'], ondelete='CASCADE'),
    )
    op.create_index('idx_usersite_user', 'user_site_access', ['user_id'])
    op.create_index('idx_usersite_site', 'user_site_access', ['site_id'])
    op.create_index('idx_usersite_primary', 'user_site_access', ['user_id', 'is_primary'])
    op.create_unique_constraint('uq_usersite_user_site', 'user_site_access', ['user_id', 'site_id'])
    
    # 2. Créer la table user_group_access
    op.create_table(
        'user_group_access',
        sa.Column('id', sa.Integer(), primary_key=True, autoincrement=True),
        sa.Column('user_id', sa.Integer(), nullable=False),
        sa.Column('group_id', sa.Integer(), nullable=False),
        sa.Column('is_primary', sa.Boolean(), nullable=False, server_default='false'),
        sa.Column('assigned_at', sa.DateTime(timezone=True), nullable=False, server_default=sa.text('NOW()')),
        sa.ForeignKeyConstraint(['user_id'], ['app_user.id'], ondelete='CASCADE'),
        sa.ForeignKeyConstraint(['group_id'], ['developer_group.id'], ondelete='CASCADE'),
    )
    op.create_index('idx_usergroup_user', 'user_group_access', ['user_id'])
    op.create_index('idx_usergroup_group', 'user_group_access', ['group_id'])
    op.create_index('idx_usergroup_primary', 'user_group_access', ['user_id', 'is_primary'])
    op.create_unique_constraint('uq_usergroup_user_group', 'user_group_access', ['user_id', 'group_id'])


def downgrade():
    # 2. Supprimer user_group_access
    op.drop_constraint('uq_usergroup_user_group', 'user_group_access', type_='unique')
    op.drop_index('idx_usergroup_primary', 'user_group_access')
    op.drop_index('idx_usergroup_group', 'user_group_access')
    op.drop_index('idx_usergroup_user', 'user_group_access')
    op.drop_table('user_group_access')
    
    # 1. Supprimer user_site_access
    op.drop_constraint('uq_usersite_user_site', 'user_site_access', type_='unique')
    op.drop_index('idx_usersite_primary', 'user_site_access')
    op.drop_index('idx_usersite_site', 'user_site_access')
    op.drop_index('idx_usersite_user', 'user_site_access')
    op.drop_table('user_site_access')
