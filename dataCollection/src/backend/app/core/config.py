"""
core/config.py

CORRECTIONS :

    1. FIX — model_post_init avec object.__setattr__ → remplacé par
       @model_validator(mode='after') — idiome Pydantic v2 propre.

    2. FIX — main.py utilisait getattr(settings, "ADMIN_EMAIL") et
       getattr(settings, "ADMIN_PASSWORD") → AttributeError silencieux
       si les variables sont absentes (getattr retourne None mais logge rien).
       ✅ FIX : ADMIN_EMAIL et ADMIN_PASSWORD déclarés explicitement dans Settings
       avec default=None → accès direct settings.ADMIN_EMAIL dans main.py.

    3. AJOUT — LOG_FILE configurable (évite "app.log" hardcodé en CWD).
"""
from __future__ import annotations

import json
import logging
from functools import lru_cache
from typing import List, Optional

from pydantic import model_validator
from pydantic_settings import BaseSettings

logger = logging.getLogger(__name__)

# INDICATEUR DE VERSION - MODIFIÉ POUR DÉBOGGER
print("[CONFIG] Module loaded - VERSION 2026-06-09-00:18")

class Settings(BaseSettings):

    # ── Application ──────────────────────────────────────────────────────────
    APP_NAME:    str  = "KPI GitLab Dashboard"
    APP_VERSION: str  = "3.0.0"
    DEBUG:       bool = False

    # ── Database ─────────────────────────────────────────────────────────────
    # Base Auth (pour login/users)
    POSTGRES_AUTH_HOST:     str = "localhost"
    POSTGRES_AUTH_PORT:     str = "5432"
    POSTGRES_AUTH_USER:     str = "postgres"
    POSTGRES_AUTH_PASSWORD: str = "postgres"
    POSTGRES_AUTH_DB:       str = "auth_db"

    # Base Tenant Telnet (accessible via topbar)
    POSTGRES_TELNET_HOST:     str = "localhost"
    POSTGRES_TELNET_PORT:     str = "5432"
    POSTGRES_TELNET_USER:     str = "postgres"
    POSTGRES_TELNET_PASSWORD: str = "postgres"
    POSTGRES_TELNET_DB:       str = "telnet_db"

    # Base Tenant GitLab KPI (accessible via topbar - DB principale)
    POSTGRES_USER:     str = "postgres"
    POSTGRES_PASSWORD: str = "postgres"
    POSTGRES_HOST:     str = "localhost"
    POSTGRES_PORT:     str = "5432"
    POSTGRES_DB:       str = "gitlab_kpi1"

    # DATABASE_URL peut être fourni directement dans .env (ex: docker-compose)
    # Sinon, il est construit depuis les variables POSTGRES_* ci-dessus.
    DATABASE_URL: Optional[str] = None
    AUTO_CREATE_SCHEMAS: bool = True

    # ── GitLab ───────────────────────────────────────────────────────────────
    GITLAB_BASE_URL: str           = "https://gitlab.com/api/v4"
    GITLAB_TOKEN:    Optional[str] = None

    # ── JWT ──────────────────────────────────────────────────────────────────
    SECRET_KEY:                  str = "change-me-in-production-min-32-chars-!!"
    ALGORITHM:                   str = "HS256"
    ACCESS_TOKEN_EXPIRE_MINUTES: int = 60
    LOGIN_MAX_ATTEMPTS:          int = 5
    LOGIN_LOCK_SECONDS:          int = 300

    # ── Encryption (token GitLab stocké chiffré en base) ─────────────────────
    # Fernet key : 32 bytes encodés en base64-url (44 chars ASCII)
    # Générer : python -c "from cryptography.fernet import Fernet; print(Fernet.generate_key().decode())"
    ENCRYPTION_KEY: Optional[str] = None

    # ── Scheduler ────────────────────────────────────────────────────────────
    SCHEDULER_ENABLED: bool = True

    # ── Notifications (Email) ────────────────────────────────────────────────
    # Resend API (preferred for Render deployment)
    RESEND_API_KEY: Optional[str] = None
    RESEND_FROM: Optional[str] = None  # Will use noreply@telnet.com if not set
    
    # SMTP (fallback, blocked on Render free tier)
    SMTP_HOST: str = "smtp.gmail.com"
    SMTP_PORT: int = 587
    SMTP_USERNAME: Optional[str] = None
    SMTP_PASSWORD: Optional[str] = None
    SMTP_FROM: Optional[str] = None  # Will use SMTP_USERNAME if not set
    SMTP_USE_TLS: bool = True
    ADMIN_EMAILS: List[str] = []  # List of admin emails for alerts

    # ── Frontend URL (for password reset links) ─────────────────────────────
    FRONTEND_URL: str = os.getenv("FRONTEND_URL", "https://gitlab-kpi-z68x-3bmecmpnj-ranimbr-s-projects.vercel.app")

    # ── Notifications (Slack) ────────────────────────────────────────────────
    SLACK_WEBHOOK_URL: Optional[str] = None

    # ── Retry Configuration ───────────────────────────────────────────────────
    EXTRACTION_MAX_RETRIES: int = 3
    EXTRACTION_RETRY_DELAYS: List[int] = [60, 300, 1500, 7200, 36000]  # seconds: 1min, 5min, 25min, 2h, 10h

    # ── CORS ─────────────────────────────────────────────────────────────────
    # Dev  → ["http://localhost:5173", "http://localhost:3000"]
    # Prod → ["https://dashboard.monentreprise.com"]
    # .env → ALLOWED_ORIGINS='["https://dashboard.example.com"]'
    ALLOWED_ORIGINS: List[str] = []
    
    @model_validator(mode="after")
    def parse_allowed_origins(self) -> "Settings":
        print(f"[CONFIG] parse_allowed_origins called - ALLOWED_ORIGINS={self.ALLOWED_ORIGINS}, type={type(self.ALLOWED_ORIGINS)}")
        if isinstance(self.ALLOWED_ORIGINS, str):
            try:
                self.ALLOWED_ORIGINS = json.loads(self.ALLOWED_ORIGINS)
                print(f"[CONFIG] Parsed ALLOWED_ORIGINS: {self.ALLOWED_ORIGINS}")
            except Exception as e:
                print(f"[CONFIG] Failed to parse ALLOWED_ORIGINS: {e}")
                self.ALLOWED_ORIGINS = []
        return self

    # ── Fichiers dump extraction ──────────────────────────────────────────────
    # Dev  → "dumps"
    # Prod → "/var/data/kpi-dumps"
    DUMP_DIR: str = "dumps"

    # ── Logs ─────────────────────────────────────────────────────────────────
    # Dev  → "logs/app.log"
    # Prod → "/var/log/kpi-dashboard/app.log"
    LOG_FILE: str = "logs/app.log"

    # ── Admin par défaut (optionnel) ─────────────────────────────────────────
    # ✅ AJOUT : déclarés explicitement dans Settings pour accès direct
    # dans main.py sans getattr() — évite AttributeError silencieux.
    # Laisser vides en prod et créer l'admin manuellement via POST /admin/users.
    # En dev : ADMIN_EMAIL=admin@company.com ADMIN_PASSWORD=Admin1234! dans .env
    ADMIN_EMAIL:    Optional[str] = None
    ADMIN_PASSWORD: Optional[str] = None

    # ── Pydantic config ───────────────────────────────────────────────────────
    model_config = {
        "env_file":          ".env",
        "env_file_encoding": "utf-8",
        "case_sensitive":    False,
        "extra":             "ignore",
    }

    # ── Post-init : construction de DATABASE_URL ──────────────────────────────
    # ✅ FIX : @model_validator(mode='after') — idiome Pydantic v2 propre.
    #          object.__setattr__ était nécessaire en v1 / frozen models.
    @model_validator(mode="after")
    def build_database_url(self) -> "Settings":
        if not self.DATABASE_URL:
            self.DATABASE_URL = (
                f"postgresql://{self.POSTGRES_USER}:{self.POSTGRES_PASSWORD}"
                f"@{self.POSTGRES_HOST}:{self.POSTGRES_PORT}/{self.POSTGRES_DB}"
            )
        return self


@lru_cache
def get_settings() -> Settings:
    """
    Retourne les settings mis en cache (singleton).
    lru_cache → instance unique — évite de relire .env à chaque requête.
    """
    return Settings()