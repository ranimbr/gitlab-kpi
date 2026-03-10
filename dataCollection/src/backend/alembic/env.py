import os
import sys
from logging.config import fileConfig

from sqlalchemy import engine_from_config, pool
from alembic import context

# ── Ajouter le dossier racine au path ─────────────────────────────────────────
sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), "..")))

# ── Charger les settings ──────────────────────────────────────────────────────
from app.core.config import get_settings
settings = get_settings()

# ── Import de Base + TOUS les modèles (obligatoire pour autogenerate) ─────────
from app.models.base import Base
import app.models  # noqa: F401 — charge les 14 tables

# ── Config Alembic ────────────────────────────────────────────────────────────
config = context.config
config.set_main_option("sqlalchemy.url", settings.DATABASE_URL)

if config.config_file_name is not None:
    fileConfig(config.config_file_name)

target_metadata = Base.metadata


# ─── Mode offline ─────────────────────────────────────────────────────────────
def run_migrations_offline() -> None:
    url = config.get_main_option("sqlalchemy.url")
    context.configure(
        url                      = url,
        target_metadata          = target_metadata,
        literal_binds            = True,
        dialect_opts             = {"paramstyle": "named"},
        compare_type             = True,   # détecte les changements de type
        compare_server_default   = True,   # détecte les changements de default
    )
    with context.begin_transaction():
        context.run_migrations()


# ─── Mode online ──────────────────────────────────────────────────────────────
def run_migrations_online() -> None:
    connectable = engine_from_config(
        config.get_section(config.config_ini_section, {}),
        prefix        = "sqlalchemy.",
        poolclass     = pool.NullPool,
    )
    with connectable.connect() as connection:
        context.configure(
            connection               = connection,
            target_metadata          = target_metadata,
            compare_type             = True,
            compare_server_default   = True,
        )
        with context.begin_transaction():
            context.run_migrations()


if context.is_offline_mode():
    run_migrations_offline()
else:
    run_migrations_online()