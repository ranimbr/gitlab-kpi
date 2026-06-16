"""add_viewer_role_to_dynamic_system

Revision ID: add_viewer_dynamic
Revises: add_viewer_telnetdb
Create Date: 2026-06-13
"""
from alembic import op
import sqlalchemy as sa


# revision identifiers
revision = 'add_viewer_dynamic'
down_revision = 'add_viewer_telnetdb'


"""add_viewer_role_to_dynamic_system

Revision ID: add_viewer_dynamic
Revises: add_viewer_telnetdb
Create Date: 2026-06-13
"""
from alembic import op
import sqlalchemy as sa
from sqlalchemy import create_engine, text


# revision identifiers
revision = 'add_viewer_dynamic'
down_revision = 'add_viewer_telnetdb'


def upgrade():
    # Ajouter le rôle viewer à la table role
    try:
        op.execute("""
            INSERT INTO role (code, name, description, is_system, is_active, created_at, updated_at) VALUES
            ('viewer', 'Viewer', 'Utilisateur en lecture seule avec accès limité selon ses assignations', true, true, NOW(), NOW())
        """)
        print("✅ Rôle viewer ajouté à la table role")
    except sa.exc.ProgrammingError:
        print("Rôle viewer existe déjà")
    
    # Ajouter les permissions pour viewer
    try:
        op.execute("""
            INSERT INTO role_permission (role_id, permission_id)
            SELECT r.id, p.id
            FROM role r, permission p
            WHERE r.code = 'viewer'
            AND p.code IN (
                'view_dashboard', 'view_projects', 'view_commits', 'view_merge_requests',
                'view_developers', 'view_developer_profile', 'view_developer_performance',
                'view_extraction_lots', 'view_analytics', 'view_kpi_analysis',
                'view_own_data'
            )
        """)
        print("✅ Permissions ajoutées pour viewer")
    except sa.exc.ProgrammingError:
        print("Permissions viewer existent déjà")
    
    # Ajouter le profil Viewer à toutes les bases de données tenant
    databases = ['gitlab_kpi1', 'telnetdb']
    
    from app.core.config import Settings
    settings = Settings()
    
    for db_name in databases:
        try:
            db_url = f"postgresql://{settings.POSTGRES_USER}:{settings.POSTGRES_PASSWORD}@{settings.POSTGRES_HOST}:{settings.POSTGRES_PORT}/{db_name}"
            engine = create_engine(db_url)
            with engine.connect() as conn:
                try:
                    conn.execute(text("""
                        INSERT INTO profile (name, description, created_at, updated_at) VALUES
                        ('Viewer', 'Utilisateur en lecture seule avec accès flexible selon ses assignations (sites, équipes, projets)', NOW(), NOW())
                    """))
                    conn.commit()
                    print(f"✅ Profil Viewer ajouté dans {db_name}")
                except Exception as e:
                    if "duplicate key" in str(e).lower() or "already exists" in str(e).lower():
                        print(f"ℹ️  Profil Viewer existe déjà dans {db_name} - ignoré")
                    else:
                        print(f"Erreur pour {db_name}: {e}")
                        conn.rollback()
            engine.dispose()
        except Exception as e:
            print(f"Erreur de connexion à {db_name}: {e}")


def downgrade():
    # Supprimer les permissions viewer
    op.execute("""
        DELETE FROM role_permission
        WHERE role_id = (SELECT id FROM role WHERE code = 'viewer')
    """)
    
    # Supprimer le rôle viewer
    op.execute("DELETE FROM role WHERE code = 'viewer'")
    
    # Supprimer le profil Viewer de toutes les bases tenant
    databases = ['gitlab_kpi1', 'telnetdb']
    
    from app.core.config import Settings
    settings = Settings()
    
    for db_name in databases:
        try:
            db_url = f"postgresql://{settings.POSTGRES_USER}:{settings.POSTGRES_PASSWORD}@{settings.POSTGRES_HOST}:{settings.POSTGRES_PORT}/{db_name}"
            engine = create_engine(db_url)
            with engine.connect() as conn:
                try:
                    conn.execute(text("DELETE FROM profile WHERE name = 'Viewer'"))
                    conn.commit()
                    print(f"✅ Profil Viewer supprimé de {db_name}")
                except Exception as e:
                    print(f"Erreur suppression dans {db_name}: {e}")
                    conn.rollback()
            engine.dispose()
        except Exception as e:
            print(f"Erreur de connexion à {db_name}: {e}")
