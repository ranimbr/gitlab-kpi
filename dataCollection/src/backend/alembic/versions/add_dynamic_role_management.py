"""
add_dynamic_role_management

Migration pour ajouter le système de gestion dynamique des rôles et permissions.
- Création des tables Role, Permission, RolePermission
- Ajout de role_id à AppUser (en gardant l'enum pour compatibilité)
- Seed des permissions par défaut
- Seed des rôles par défaut (migrés depuis l'enum UserRoleEnum)
- Seed des associations rôle-permission par défaut
"""
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

# revision identifiers
revision = 'add_dynamic_role_management'
down_revision = 'add_profile_menu_management'
branch_labels = None
depends_on = 'add_profile_menu_management'


def upgrade():
    # 1. Créer la table Permission (si elle n'existe pas)
    try:
        op.create_table(
            'permission',
            sa.Column('id', sa.Integer(), primary_key=True),
            sa.Column('code', sa.String(100), nullable=False, unique=True),
            sa.Column('name', sa.String(255), nullable=False),
            sa.Column('description', sa.String(500), nullable=True),
            sa.Column('category', sa.String(100), nullable=True),
            sa.Column('created_at', sa.DateTime(timezone=True), nullable=False, server_default=sa.text('NOW()')),
            sa.Column('updated_at', sa.DateTime(timezone=True), nullable=False, server_default=sa.text('NOW()')),
        )
        op.create_index('idx_permission_code', 'permission', ['code'])
        op.create_index('idx_permission_category', 'permission', ['category'])
    except sa.exc.ProgrammingError:
        print("Table permission already exists, skipping...")
    
    # 2. Créer la table Role (si elle n'existe pas)
    try:
        op.create_table(
            'role',
            sa.Column('id', sa.Integer(), primary_key=True),
            sa.Column('code', sa.String(100), nullable=False, unique=True),
            sa.Column('name', sa.String(255), nullable=False),
            sa.Column('description', sa.String(500), nullable=True),
            sa.Column('is_system', sa.Boolean(), nullable=False, server_default='false'),
            sa.Column('is_active', sa.Boolean(), nullable=False, server_default='true'),
            sa.Column('created_at', sa.DateTime(timezone=True), nullable=False, server_default=sa.text('NOW()')),
            sa.Column('updated_at', sa.DateTime(timezone=True), nullable=False, server_default=sa.text('NOW()')),
        )
        op.create_index('idx_role_code', 'role', ['code'])
        op.create_index('idx_role_active', 'role', ['is_active'])
    except sa.exc.ProgrammingError:
        print("Table role already exists, skipping...")
    
    # 3. Créer la table RolePermission (table d'association)
    try:
        op.create_table(
            'role_permission',
            sa.Column('id', sa.Integer(), primary_key=True),
            sa.Column('role_id', sa.Integer(), nullable=False),
            sa.Column('permission_id', sa.Integer(), nullable=False),
            sa.ForeignKeyConstraint(['role_id'], ['role.id'], ondelete='CASCADE'),
            sa.ForeignKeyConstraint(['permission_id'], ['permission.id'], ondelete='CASCADE'),
            sa.UniqueConstraint('role_id', 'permission_id', name='uq_role_permission'),
        )
        op.create_index('idx_rolepermission_role', 'role_permission', ['role_id'])
        op.create_index('idx_rolepermission_permission', 'role_permission', ['permission_id'])
    except sa.exc.ProgrammingError:
        print("Table role_permission already exists, skipping...")
    
    # 4. Ajouter role_id à AppUser (garder l'enum pour compatibilité)
    try:
        op.add_column('app_user', sa.Column('role_id', sa.Integer(), nullable=True))
        op.create_foreign_key(
            'fk_app_user_role',
            'app_user', 'role',
            ['role_id'], ['id'],
            ondelete='SET NULL'
        )
        op.create_index('idx_appuser_role_obj', 'app_user', ['role_id'])
    except sa.exc.ProgrammingError:
        print("Column role_id already exists in app_user, skipping...")
    
    # 5. Seed des permissions par défaut (si elles n'existent pas)
    try:
        op.execute("""
            INSERT INTO permission (code, name, description, category) VALUES
            ('view_dashboard', 'Voir Dashboard', 'Accès à la page Dashboard', 'general'),
            ('view_projects', 'Voir Projets', 'Accès à la liste des projets', 'general'),
            ('view_commits', 'Voir Commits', 'Accès à la liste des commits', 'general'),
            ('view_merge_requests', 'Voir Merge Requests', 'Accès à la liste des MRs', 'general'),
            ('view_developers', 'Voir Développeurs', 'Accès à la liste des développeurs', 'general'),
            ('view_developer_profile', 'Voir Profil Développeur', 'Accès au profil détaillé d''un développeur', 'general'),
            ('view_developer_performance', 'Voir Performance Développeur', 'Accès aux métriques de performance', 'general'),
            
            -- Permissions Admin
            ('manage_developers', 'Gérer Développeurs', 'Créer, modifier, supprimer des développeurs', 'admin'),
            ('import_developers', 'Importer Développeurs', 'Importer des développeurs via CSV/Excel', 'admin'),
            ('manage_periods', 'Gérer Périodes', 'Gérer les périodes d''analyse', 'admin'),
            ('manage_projects', 'Gérer Projets', 'Créer, modifier, supprimer des projets', 'admin'),
            ('manage_sites', 'Gérer Sites', 'Créer, modifier, supprimer des sites', 'admin'),
            ('manage_users', 'Gérer Utilisateurs', 'Créer, modifier, supprimer des utilisateurs', 'admin'),
            ('manage_gitlab_configs', 'Gérer Configs GitLab', 'Gérer les configurations GitLab', 'admin'),
            ('manage_kpi_definitions', 'Gérer Définitions KPI', 'Gérer les définitions de KPI', 'admin'),
            ('manage_dashboards', 'Gérer Dashboards', 'Créer, modifier, supprimer des dashboards', 'admin'),
            ('manage_profiles', 'Gérer Profils', 'Gérer les profils et menus', 'admin'),
            ('manage_roles', 'Gérer Rôles', 'Gérer les rôles et permissions', 'admin'),
            ('manage_scheduler', 'Gérer Scheduler', 'Gérer le planificateur de tâches', 'admin'),
            ('view_audit_log', 'Voir Audit Log', 'Accès au journal d''audit', 'admin'),
            
            -- Permissions Extraction
            ('view_extraction_lots', 'Voir Lots d''Extraction', 'Accès à la liste des lots d''extraction', 'extraction'),
            ('trigger_extraction', 'Déclencher Extraction', 'Déclencher une extraction de données', 'extraction'),
            ('manage_extraction_lots', 'Gérer Lots d''Extraction', 'Gérer les lots d''extraction', 'extraction'),
            
            -- Permissions Analytics
            ('view_analytics', 'Voir Analytics', 'Accès aux analyses et comparaisons', 'analytics'),
            ('view_kpi_analysis', 'Voir Analyse KPI', 'Accès à l''analyse des KPI', 'analytics'),
            
            -- Permissions Site/Group spécifiques
            ('manage_own_site', 'Gérer Son Site', 'Gérer uniquement son site assigné', 'scope'),
            ('manage_own_group', 'Gérer Son Groupe', 'Gérer uniquement son groupe assigné', 'scope'),
            ('manage_own_projects', 'Gérer Ses Projets', 'Gérer uniquement ses projets assignés', 'scope'),
            ('view_own_data', 'Voir Ses Données', 'Voir uniquement ses propres données', 'scope')
        """)
    except sa.exc.ProgrammingError:
        print("Permissions already seeded, skipping...")
    
    # 6. Seed des rôles par défaut (si ils n'existent pas)
    try:
        op.execute("""
            INSERT INTO role (code, name, description, is_system) VALUES
            ('super_admin', 'Super Admin', 'Accès total à toutes les fonctionnalités', true),
            ('site_manager', 'Site Manager', 'Gestionnaire de site - accès limité à son site', true),
            ('project_manager', 'Project Manager', 'Gestionnaire de projet - accès limité à ses projets', true),
            ('team_lead', 'Team Lead', 'Chef d''équipe - accès limité à son équipe', true),
            ('developer', 'Developer', 'Développeur - lecture seule de ses propres données', true)
        """)
    except sa.exc.ProgrammingError:
        print("Roles already seeded, skipping...")
    
    # 7. Seed des associations rôle-permission par défaut (si elles n'existent pas)
    try:
        # Super Admin: toutes les permissions
        op.execute("""
            INSERT INTO role_permission (role_id, permission_id)
            SELECT r.id, p.id
            FROM role r, permission p
            WHERE r.code = 'super_admin'
        """)
        
        # Site Manager: permissions générales + scope site
        op.execute("""
            INSERT INTO role_permission (role_id, permission_id)
            SELECT r.id, p.id
            FROM role r, permission p
            WHERE r.code = 'site_manager'
            AND p.code IN (
                'view_dashboard', 'view_projects', 'view_commits', 'view_merge_requests',
                'view_developers', 'view_developer_profile', 'view_developer_performance',
                'view_extraction_lots', 'view_analytics', 'view_kpi_analysis',
                'manage_own_site'
            )
        """)
        
        # Project Manager: permissions générales + scope projets
        op.execute("""
            INSERT INTO role_permission (role_id, permission_id)
            SELECT r.id, p.id
            FROM role r, permission p
            WHERE r.code = 'project_manager'
            AND p.code IN (
                'view_dashboard', 'view_projects', 'view_commits', 'view_merge_requests',
                'view_developers', 'view_developer_profile', 'view_developer_performance',
                'view_extraction_lots', 'view_analytics', 'view_kpi_analysis',
                'manage_own_projects'
            )
        """)
        
        # Team Lead: permissions générales + scope groupe
        op.execute("""
            INSERT INTO role_permission (role_id, permission_id)
            SELECT r.id, p.id
            FROM role r, permission p
            WHERE r.code = 'team_lead'
            AND p.code IN (
                'view_dashboard', 'view_projects', 'view_commits', 'view_merge_requests',
                'view_developers', 'view_developer_profile', 'view_developer_performance',
                'view_extraction_lots', 'view_analytics', 'view_kpi_analysis',
                'manage_own_group'
            )
        """)
        
        # Developer: permissions lecture seule + scope own data
        op.execute("""
            INSERT INTO role_permission (role_id, permission_id)
            SELECT r.id, p.id
            FROM role r, permission p
            WHERE r.code = 'developer'
            AND p.code IN (
                'view_dashboard', 'view_projects', 'view_commits', 'view_merge_requests',
                'view_developer_profile', 'view_own_data'
            )
        """)
    except sa.exc.ProgrammingError:
        print("Role permissions already seeded, skipping...")


def downgrade():
    # 7. Supprimer les associations rôle-permission
    op.execute("DELETE FROM role_permission")
    
    # 6. Supprimer les rôles
    op.execute("DELETE FROM role")
    
    # 5. Supprimer les permissions
    op.execute("DELETE FROM permission")
    
    # 4. Supprimer role_id de AppUser
    op.drop_index('idx_appuser_role_obj', 'app_user')
    op.drop_constraint('fk_app_user_role', 'app_user', type_='foreignkey')
    op.drop_column('app_user', 'role_id')
    
    # 3. Supprimer RolePermission
    op.drop_index('idx_rolepermission_permission', 'role_permission')
    op.drop_index('idx_rolepermission_role', 'role_permission')
    op.drop_constraint('uq_role_permission', 'role_permission', type_='unique')
    op.drop_table('role_permission')
    
    # 2. Supprimer Role
    op.drop_index('idx_role_active', 'role')
    op.drop_index('idx_role_code', 'role')
    op.drop_table('role')
    
    # 1. Supprimer Permission
    op.drop_index('idx_permission_category', 'permission')
    op.drop_index('idx_permission_code', 'permission')
    op.drop_table('permission')
