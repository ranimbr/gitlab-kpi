"""database/session.py — Dynamic DB Router."""
import logging
import contextvars
import urllib.parse
import threading
import time
from typing import Generator
from sqlalchemy import create_engine, text
from sqlalchemy.orm import Session, sessionmaker
from app.core.config import get_settings

logger = logging.getLogger(__name__)
settings = get_settings()

# Context variable to store active database name
current_db_var = contextvars.ContextVar("current_db", default="telnetdb")

# Thread lock for DB operations
db_lock = threading.Lock()
_last_used = {}
MAX_CACHED_ENGINES = 8  # Limit active connection pools

# Extract default database name from settings
try:
    parsed = urllib.parse.urlparse(settings.DATABASE_URL or "")
    DEFAULT_DB = parsed.path.lstrip('/') or "telnetdb"
except Exception:
    DEFAULT_DB = "telnetdb"

# Caches for engines and sessionmakers
_engines = {}
_sessionmakers = {}

# Base de données partagée pour l'authentification
AUTH_DB = "auth_db"

# Mapping des noms de bases vers les noms de schémas (pour mode Supabase)
DB_TO_SCHEMA_MAP = {
    "auth_db": "auth_schema",
    "telnetdb": "telnet_schema",
    "gitlab_kpi1": "gitlab_kpi_schema",
}

def get_schema_name(db_name: str) -> str:
    """Retourne le nom du schéma correspondant pour le mode schema"""
    return DB_TO_SCHEMA_MAP.get(db_name, db_name)

def get_auth_engine():
    """Returns the engine for the shared auth database (auth_db)"""
    return get_engine_for_db(AUTH_DB)

def get_auth_session():
    """Returns a session for the shared auth database (auth_db)"""
    auth_engine = get_auth_engine()
    if AUTH_DB not in _sessionmakers:
        _sessionmakers[AUTH_DB] = sessionmaker(bind=auth_engine, autoflush=False, autocommit=False)
    return _sessionmakers[AUTH_DB]()

def get_auth_db() -> Generator[Session, None, None]:
    """Dependency for FastAPI - returns a session for auth_db"""
    db = get_auth_session()
    try:
        yield db
    except Exception:
        db.rollback()
        raise
    finally:
        db.close()

def get_engine_for_db(db_name: str):
    if not db_name:
        db_name = DEFAULT_DB

    with db_lock:
        # Mode schémas (Supabase/Cloud) : utiliser un seul engine avec search_path
        if settings.USE_SCHEMAS:
            schema_name = get_schema_name(db_name)
            cache_key = f"schema_{schema_name}"

            if cache_key in _engines:
                _last_used[cache_key] = time.time()
                return _engines[cache_key]

            # Manage LRU cache for schema engines
            evictable = [key for key in _engines if key.startswith("schema_") and key != cache_key]
            if len(_engines) >= MAX_CACHED_ENGINES and evictable:
                oldest_key = min(evictable, key=lambda k: _last_used.get(k, 0))
                logger.info(f"[Schema Engine Eviction] Closing engine for '{oldest_key}'")
                try:
                    _engines[oldest_key].dispose()
                except Exception as e:
                    logger.warning(f"Failed to dispose of engine for '{oldest_key}': {e}")
                _engines.pop(oldest_key, None)
                _sessionmakers.pop(oldest_key, None)
                _last_used.pop(oldest_key, None)

            # Create schema if it doesn't exist
            create_schema_if_not_exists(schema_name)

            # Use the main database URL (no path modification for schema mode)
            db_url = settings.DATABASE_URL

            # Create the engine with schema in connect_args
            new_engine = create_engine(
                db_url,
                pool_pre_ping = True,
                pool_size     = 10,
                max_overflow  = 20,
                pool_timeout  = 30,
                pool_recycle  = 1800,
                echo          = settings.DEBUG,
                connect_args  = {"options": f"-c search_path={schema_name}"} if schema_name else {}
            )

            _engines[cache_key] = new_engine
            _last_used[cache_key] = time.time()

            # Initialize schema and seed defaults safely
            if settings.AUTO_CREATE_SCHEMAS:
                try:
                    with new_engine.begin() as connection:
                        db_hash = hash(schema_name) % (2**31 - 1)
                        connection.execute(text(f"SELECT pg_advisory_xact_lock({db_hash})"))

                        from app.models.base import Base
                        import app.models.gitlab_config        # noqa: F401
                        import app.models.site                 # noqa: F401
                        import app.models.project              # noqa: F401
                        import app.models.app_user             # noqa: F401
                        import app.models.audit_log            # noqa: F401
                        import app.models.developer_group      # noqa: F401
                        import app.models.developer            # noqa: F401
                        import app.models.developer_import_log # noqa: F401
                        import app.models.project_site         # noqa: F401
                        import app.models.developer_project    # noqa: F401
                        import app.models.developer_site       # noqa: F401
                        import app.models.period               # noqa: F401
                        import app.models.period_filter        # noqa: F401
                        import app.models.extraction_lot       # noqa: F401
                        import app.models.commit               # noqa: F401
                        import app.models.merge_request        # noqa: F401
                        import app.models.commit_merge_request # noqa: F401
                        import app.models.kpi_definition       # noqa: F401
                        import app.models.kpi_snapshot         # noqa: F401
                        import app.models.kpi_threshold        # noqa: F401
                        import app.models.alert                # noqa: F401
                        import app.models.dashboard            # noqa: F401
                        import app.models.menu_item            # noqa: F401
                        import app.models.profile              # noqa: F401

                        # Set search_path before creating tables
                        connection.execute(text(f"SET search_path TO {schema_name}"))
                        Base.metadata.create_all(bind=connection)
                        logger.info(f"✅ Schema initialized automatically for '{schema_name}'.")

                        from app.core.seed_data import seed_kpi_definitions, seed_admin_user
                        TempSessionLocal = sessionmaker(bind=connection, autoflush=False, autocommit=False)
                        with TempSessionLocal() as db_session:
                            seed_kpi_definitions(db_session)
                            if settings.ADMIN_EMAIL and settings.ADMIN_PASSWORD:
                                seed_admin_user(db_session, settings.ADMIN_EMAIL, settings.ADMIN_PASSWORD)
                            db_session.commit()
                except Exception as e:
                    logger.error(f"❌ Failed to initialize schema/seed for '{schema_name}': {e}", exc_info=True)

            return new_engine

        # Mode bases séparées (local/docker) : système actuel
        if db_name in _engines:
            _last_used[db_name] = time.time()
            return _engines[db_name]

        # Manage LRU cache for engines (evict least recently used, keeping default/auth db pinned)
        evictable = [db for db in _engines if db not in (AUTH_DB, DEFAULT_DB)]
        if len(_engines) >= MAX_CACHED_ENGINES and evictable:
            oldest_db = min(evictable, key=lambda db: _last_used.get(db, 0))
            logger.info(f"[DB Eviction] Closing engine for database '{oldest_db}' to release connection pool resources.")
            try:
                _engines[oldest_db].dispose()
            except Exception as e:
                logger.warning(f"Failed to dispose of engine for database '{oldest_db}': {e}")
            _engines.pop(oldest_db, None)
            _sessionmakers.pop(oldest_db, None)
            _last_used.pop(oldest_db, None)

        # Check/create database if it doesn't exist on server
        create_db_if_not_exists(db_name)

        # Construct URL for the specific database name
        parsed = urllib.parse.urlparse(settings.DATABASE_URL)
        db_url = urllib.parse.urlunparse(parsed._replace(path=f"/{db_name}"))

        # Create the engine
        new_engine = create_engine(
            db_url,
            pool_pre_ping = True,
            pool_size     = 10,
            max_overflow  = 20,
            pool_timeout  = 30,
            pool_recycle  = 1800,
            echo          = settings.DEBUG,
        )

        _engines[db_name] = new_engine
        _last_used[db_name] = time.time()

        # Initialize schema and seed defaults safely
        if settings.AUTO_CREATE_SCHEMAS:
            try:
                # Use a PostgreSQL advisory lock inside a transaction connection to synchronize multi-process initialization
                with new_engine.begin() as connection:
                    db_hash = hash(db_name) % (2**31 - 1)
                    # Acquire advisory lock (xact level: automatically released on transaction end)
                    connection.execute(text(f"SELECT pg_advisory_xact_lock({db_hash})"))

                    # Import all models to register them on Base.metadata
                    from app.models.base import Base
                    import app.models.gitlab_config        # noqa: F401
                    import app.models.site                 # noqa: F401
                    import app.models.project              # noqa: F401
                    import app.models.app_user             # noqa: F401
                    import app.models.audit_log            # noqa: F401
                    import app.models.developer_group      # noqa: F401
                    import app.models.developer            # noqa: F401
                    import app.models.developer_import_log # noqa: F401
                    import app.models.project_site         # noqa: F401
                    import app.models.developer_project    # noqa: F401
                    import app.models.developer_site       # noqa: F401
                    import app.models.period               # noqa: F401
                    import app.models.period_filter        # noqa: F401
                    import app.models.extraction_lot       # noqa: F401
                    import app.models.commit               # noqa: F401
                    import app.models.merge_request        # noqa: F401
                    import app.models.commit_merge_request # noqa: F401
                    import app.models.kpi_definition       # noqa: F401
                    import app.models.kpi_snapshot         # noqa: F401
                    import app.models.kpi_threshold        # noqa: F401
                    import app.models.alert                # noqa: F401
                    import app.models.dashboard            # noqa: F401
                    import app.models.menu_item            # noqa: F401
                    import app.models.profile              # noqa: F401

                    Base.metadata.create_all(bind=connection)
                    logger.info(f"✅ Schema initialized automatically for database '{db_name}'.")

                    # Seed default KPI definitions
                    from app.core.seed_data import seed_kpi_definitions, seed_admin_user
                    TempSessionLocal = sessionmaker(bind=connection, autoflush=False, autocommit=False)
                    with TempSessionLocal() as db_session:
                        seed_kpi_definitions(db_session)
                        if settings.ADMIN_EMAIL and settings.ADMIN_PASSWORD:
                            seed_admin_user(db_session, settings.ADMIN_EMAIL, settings.ADMIN_PASSWORD)
                        db_session.commit()
            except Exception as e:
                logger.error(f"❌ Failed to initialize schema/seed for database '{db_name}': {e}", exc_info=True)

        return new_engine

def create_schema_if_not_exists(schema_name: str):
    """Crée un schéma PostgreSQL s'il n'existe pas (mode Supabase)"""
    try:
        parsed = urllib.parse.urlparse(settings.DATABASE_URL)
        temp_engine = create_engine(settings.DATABASE_URL, isolation_level="AUTOCOMMIT")
        with temp_engine.connect() as conn:
            # Check if schema exists
            res = conn.execute(text("SELECT 1 FROM information_schema.schemata WHERE schema_name = :schema_name"), {"schema_name": schema_name})
            if not res.fetchone():
                conn.execute(text(f'CREATE SCHEMA "{schema_name}"'))
                logger.info(f"✅ Created schema '{schema_name}' on PostgreSQL server.")
        temp_engine.dispose()
    except Exception as e:
        logger.error(f"⚠️ Error checking/creating schema '{schema_name}': {e}")

def create_db_if_not_exists(db_name: str):
    # Don't try to create system databases
    if db_name in ("postgres", "template1"):
        return

    try:
        parsed = urllib.parse.urlparse(settings.DATABASE_URL)
        # Connect to system 'postgres' DB to perform creation
        postgres_url = urllib.parse.urlunparse(parsed._replace(path='/postgres'))
        temp_engine = create_engine(postgres_url, isolation_level="AUTOCOMMIT")
        with temp_engine.connect() as conn:
            # Check if database exists
            res = conn.execute(text("SELECT 1 FROM pg_database WHERE datname = :db_name"), {"db_name": db_name})
            if not res.fetchone():
                conn.execute(text(f'CREATE DATABASE "{db_name}"'))
                logger.info(f"✅ Created database '{db_name}' on PostgreSQL server.")
        temp_engine.dispose()
    except Exception as e:
        logger.error(f"⚠️ Error checking/creating database '{db_name}': {e}")

# Dynamic SessionLocal proxy callable
class DynamicSessionLocal:
    def __call__(self, **kwargs) -> Session:
        db_name = current_db_var.get()
        logger.info(f"[DynamicSessionLocal] Creating session for database: {db_name}")
        engine = get_engine_for_db(db_name)
        if db_name not in _sessionmakers:
            _sessionmakers[db_name] = sessionmaker(bind=engine, autoflush=False, autocommit=False)
        with db_lock:
            _last_used[db_name] = time.time()
        return _sessionmakers[db_name](**kwargs)

# Keep the variable name SessionLocal for compatibility
SessionLocal = DynamicSessionLocal()

# Fallback/Default engine for direct imports if any
engine = get_engine_for_db(DEFAULT_DB)

def get_db() -> Generator[Session, None, None]:
    db = SessionLocal()
    try:
        yield db
    except Exception:
        db.rollback()
        raise
    finally:
        db.close()