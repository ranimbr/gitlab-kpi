# core/config.py
from pydantic_settings import BaseSettings
from functools import lru_cache
from typing import Optional, List

class Settings(BaseSettings):

    # ───────── Application ─────────

    APP_NAME:    str = "KPI GitLab Dashboard"
    APP_VERSION: str = "3.0.0"
    DEBUG:       bool = False

    # ───────── Database ─────────

    POSTGRES_USER:     str
    POSTGRES_PASSWORD: str
    POSTGRES_HOST:     str = "localhost"
    POSTGRES_PORT:     str = "5432"
    POSTGRES_DB:       str

    DATABASE_URL: Optional[str] = None

    def model_post_init(self, __context):
        if not self.DATABASE_URL:
            object.__setattr__(
                self,
                "DATABASE_URL",
                f"postgresql://{self.POSTGRES_USER}:{self.POSTGRES_PASSWORD}"
                f"@{self.POSTGRES_HOST}:{self.POSTGRES_PORT}/{self.POSTGRES_DB}"
            )

    # ───────── GitLab ─────────

    GITLAB_BASE_URL: str = "https://gitlab.com/api/v4"
    GITLAB_TOKEN:    Optional[str] = None

    # ───────── JWT ─────────

    SECRET_KEY:                  str
    ALGORITHM:                   str = "HS256"
    ACCESS_TOKEN_EXPIRE_MINUTES: int = 60

    # ───────── Encryption ─────────

    ENCRYPTION_KEY: Optional[str] = None

    # ───────── Scheduler ─────────

    SCHEDULER_ENABLED: bool = True

    # ✅ CORRECTION POINT 6 — CORS configurable par environnement
    # Dev    → ["http://localhost:5173", "http://localhost:3000"]
    # Prod   → ["https://dashboard.monentreprise.com"]
    # .env   → ALLOWED_ORIGINS=["http://localhost:5173"]
    ALLOWED_ORIGINS: List[str] = [
        "http://localhost:5173",
        "http://localhost:3000",
    ]

    # ✅ CORRECTION POINT 8 — Répertoire des dumps configurable
    # Dev  → "dumps"
    # Prod → "/var/data/kpi-dumps"
    DUMP_DIR: str = "dumps"

    model_config = {
        "env_file":          ".env",
        "env_file_encoding": "utf-8",
        "case_sensitive":    False,
        "extra":             "ignore",
    }


@lru_cache
def get_settings() -> Settings:
    return Settings()