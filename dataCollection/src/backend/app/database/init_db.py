"""
database/init_db.py

Initialisation de la base de données PostgreSQL.
Crée toutes les tables et les index DDL (via event.listen).

⚠️  En production : utiliser Alembic pour les migrations.
    init_db() ne doit être utilisé qu'en développement initial
    ou pour les tests (create_all est idempotent si les tables existent déjà).
"""

import logging
from sqlalchemy.orm import Session
from app.database.session import engine
from app.models.base import Base
from app.models.app_user import AppUser
from passlib.context import CryptContext

# ── Configuration ──────────────────────────────────────────────────────────
from app.models.gitlab_config        import GitLabConfig       # noqa: F401
from app.models.site                 import Site               # noqa: F401
from app.models.project              import Project            # noqa: F401

# ── Utilisateurs & Accès ───────────────────────────────────────────────────
from app.models.app_user             import AppUser            # noqa: F401
from app.models.audit_log            import AuditLog           # noqa: F401

# ── Organisation Développeurs ──────────────────────────────────────────────
from app.models.developer_group      import DeveloperGroup     # noqa: F401
from app.models.developer            import Developer          # noqa: F401
from app.models.developer_import_log import DeveloperImportLog # noqa: F401

# ── Tables de jonction Many-to-Many ───────────────────────────────────────
from app.models.project_site         import ProjectSite        # noqa: F401
from app.models.developer_project    import DeveloperProject   # noqa: F401
from app.models.developer_site       import DeveloperSite      # noqa: F401

# ── Périodes & Extraction ──────────────────────────────────────────────────
from app.models.period               import Period             # noqa: F401
from app.models.period_filter        import PeriodFilter       # noqa: F401
from app.models.extraction_lot       import ExtractionLot      # noqa: F401

# ── Données GitLab ─────────────────────────────────────────────────────────
from app.models.commit               import Commit             # noqa: F401
from app.models.merge_request        import MergeRequest       # noqa: F401
from app.models.commit_merge_request import CommitMergeRequest # noqa: F401

# ── KPIs ───────────────────────────────────────────────────────────────────
from app.models.kpi_definition       import KpiDefinition      # noqa: F401
from app.models.kpi_snapshot         import KpiSnapshot        # noqa: F401
from app.models.kpi_threshold        import KpiThreshold       # noqa: F401
from app.models.alert                import Alert              # noqa: F401

# ── Dashboard ──────────────────────────────────────────────────────────────
from app.models.dashboard            import Dashboard          # noqa: F401

logger = logging.getLogger(__name__)
pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")


def seed_admin_user() -> None:
    """
    [ENTERPRISE READY] Garantit que l'utilisateur admin avec ID=1 existe toujours.
    
    Cette fonction est appelée automatiquement lors de l'initialisation de la base de données
    pour garantir que user_id=1 existe, ce qui est requis par le système d'audit_log.
    
    Solution enterprise-ready:
    - Idempotente: peut être appelée plusieurs fois sans créer de doublons
    - Intégrée dans le pipeline d'initialisation standard
    - Automatique à chaque déploiement
    """
    try:
        session = Session(bind=engine)
        
        # Vérifier si l'utilisateur admin avec ID=1 existe
        admin = session.query(AppUser).filter(AppUser.id == 1).first()
        
        if admin:
            logger.info(f"✅ Admin user ID=1 existe déjà: {admin.login}")
        else:
            logger.info("🔧 Création de l'utilisateur admin avec ID=1...")
            
            # Vérifier si un admin existe déjà avec un autre ID
            existing_admin = session.query(AppUser).filter(AppUser.role == "super_admin").first()
            
            if existing_admin:
                logger.warning(f"⚠️  Admin existe déjà avec ID={existing_admin.id}, mise à jour à ID=1")
                existing_admin.id = 1
                session.commit()
                logger.info("✅ Admin ID mis à jour à 1")
            else:
                # Créer l'utilisateur admin avec ID=1
                admin_user = AppUser(
                    id=1,
                    email="admin@test.com",
                    login="admin",
                    name="Admin User",
                    hashed_password=pwd_context.hash("Admin1234!"),
                    role="super_admin",
                    is_active=True,
                    dashboard_access=[]
                )
                session.add(admin_user)
                session.commit()
                logger.info("✅ Admin user ID=1 créé avec succès")
        
        session.close()
        
    except Exception as e:
        logger.error(f"❌ Erreur lors du seed de l'utilisateur admin: {e}", exc_info=True)
        if 'session' in locals():
            session.rollback()
            session.close()
        raise


def init_db() -> None:
    """
    Crée toutes les tables PostgreSQL.
    Les index DDL (DDL event.listen) sont déclenchés automatiquement
    lors du create_all par SQLAlchemy.

    Tables créées / vérifiées dans l'ordre FK :
        site → gitlab_config → project
        app_user → developer_group → developer → developer_import_log
        project_site, developer_project, developer_site
        period → extraction_lot
        git_commit → merge_request → commit_merge_request
        kpi_definition → kpi_snapshot → kpi_threshold → alert
        dashboard → period_filter
        audit_log
    """
    from app.core.config import get_settings
    settings = get_settings()
    if settings.USE_SCHEMAS:
        logger.info("ℹ️ Mode schémas activé (Supabase) : l'initialisation des tables se fait dynamiquement. Ignorer init_db().")
        return

    try:
        Base.metadata.create_all(bind=engine)
        logger.info("✅ Toutes les tables créées / vérifiées avec succès.")
        logger.info("✅ Index DDL (COALESCE, index partiels) appliqués.")
        
        # [ENTERPRISE READY] Seed data - Garantit que user_id=1 existe
        seed_admin_user()
        
    except Exception as e:
        logger.error(f"❌ Échec de l'initialisation de la base : {e}", exc_info=True)
        raise