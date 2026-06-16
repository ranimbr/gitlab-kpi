"""
add_role_id_to_app_user

Migration pour ajouter la colonne role_id manquante à la table app_user.
Cette colonne est requise par le modèle AppUser mais était manquante dans la base de données.
"""
from alembic import op
import sqlalchemy as sa

# revision identifiers
revision = 'add_role_id_to_app_user'
down_revision = 'add_profile_management_menu_item'
branch_labels = None
depends_on = 'add_profile_management_menu_item'


def upgrade():
    # Ajouter la colonne role_id à app_user
    op.add_column('app_user', sa.Column('role_id', sa.Integer(), nullable=True))
    op.create_foreign_key(
        'fk_app_user_role',
        'app_user',
        'role',
        ['role_id'],
        ['id'],
        ondelete='SET NULL'
    )
    op.create_index('idx_appuser_role_obj', 'app_user', ['role_id'])


def downgrade():
    # Supprimer l'index et la colonne role_id
    op.drop_index('idx_appuser_role_obj', 'app_user')
    op.drop_constraint('fk_app_user_role', 'app_user', type_='foreignkey')
    op.drop_column('app_user', 'role_id')
