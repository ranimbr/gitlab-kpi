from typing import Generator

from sqlalchemy import create_engine
from sqlalchemy.orm import Session, sessionmaker

from app.core.config import get_settings

settings = get_settings()

# ─── Engine ──────────────────────────────────────────────────────────────────

engine = create_engine(
    settings.DATABASE_URL,
    pool_pre_ping  = True,   # détecte et écarte les connexions mortes
    pool_size      = 10,     # connexions persistantes dans le pool
    max_overflow   = 20,     # connexions temporaires si pool saturé
    pool_timeout   = 30,     # secondes avant timeout si pool plein
    pool_recycle   = 1800,   # recycle les connexions toutes les 30 min
                             # (évite les erreurs "server closed the connection")
    echo           = settings.DEBUG,  # log SQL si DEBUG=True
    # [FIX] future=True n'appartient QU'À create_engine (SQLAlchemy 1.4 → 2.x).
    # En SQLAlchemy 2.x, le moteur est déjà en mode "future" par défaut.
    # Ne pas le passer à sessionmaker → TypeError en SQLAlchemy 2.x.
)

# ─── Session Factory ─────────────────────────────────────────────────────────

SessionLocal = sessionmaker(
    bind        = engine,
    autoflush   = False,
    autocommit  = False,
    # [FIX] future=True SUPPRIMÉ — paramètre inexistant sur sessionmaker en 2.x
)

# ─── FastAPI Dependency ───────────────────────────────────────────────────────

def get_db() -> Generator[Session, None, None]:
    """
    Dependency FastAPI — fournit une session DB par requête HTTP.
    La session est automatiquement fermée (et rollback si erreur)
    à la fin de chaque requête.
    """
    db = SessionLocal()
    try:
        yield db
    except Exception:
        db.rollback()
        raise
    finally:
        db.close()
