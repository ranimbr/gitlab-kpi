"""
Script temporaire pour initialiser auth_db sur Neon.
Exécuter: python init_auth_db.py
"""
import os
import sys
from sqlalchemy import create_engine
from sqlalchemy.orm import Session
from passlib.context import CryptContext

# Ajouter le répertoire parent au path
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from app.models.base import Base
from app.models.app_user import AppUser

# Importer tous les modèles pour créer les tables
from app.models.gitlab_config        import GitLabConfig
from app.models.site                 import Site
from app.models.project              import Project
from app.models.audit_log            import AuditLog
from app.models.developer_group      import DeveloperGroup
from app.models.developer            import Developer
from app.models.developer_import_log import DeveloperImportLog
from app.models.project_site         import ProjectSite
from app.models.developer_project    import DeveloperProject
from app.models.developer_site       import DeveloperSite
from app.models.period               import Period
from app.models.period_filter        import PeriodFilter
from app.models.extraction_lot       import ExtractionLot
from app.models.commit               import Commit
from app.models.merge_request        import MergeRequest
from app.models.commit_merge_request import CommitMergeRequest
from app.models.kpi_definition       import KpiDefinition
from app.models.kpi_snapshot         import KpiSnapshot
from app.models.kpi_threshold        import KpiThreshold
from app.models.alert                import Alert

# Récupérer l'URL de auth_db depuis les variables d'environnement
AUTH_DB_URL = os.getenv("AUTH_DB_URL")

# Si non défini, utiliser l'URL par défaut (à remplacer par l'utilisateur)
if not AUTH_DB_URL:
    AUTH_DB_URL = "postgresql://neondb_owner:npg_foR1DzQkTW0t@ep-broad-base-as5h1h5g.c-4.eu-central-1.aws.neon.tech/neondb?sslmode=require"
    print("⚠️  AUTH_DB_URL non défini, utilisation de l'URL par défaut")

print(f"🔧 Connexion à auth_db...")
engine = create_engine(AUTH_DB_URL)

print(f"🔧 Création des tables dans auth_db...")
Base.metadata.create_all(bind=engine)
print(f"✅ Tables créées avec succès dans auth_db")

print(f"🔧 Création de l'utilisateur admin...")
session = Session(bind=engine)
pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")

# Vérifier si l'admin existe déjà
admin = session.query(AppUser).filter(AppUser.id == 1).first()

if not admin:
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
    print(f"✅ Admin user créé avec succès")
else:
    print(f"✅ Admin user existe déjà")

session.close()
print(f"✅ auth_db initialisé avec succès")
