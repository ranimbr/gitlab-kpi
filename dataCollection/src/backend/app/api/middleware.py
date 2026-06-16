"""api/middleware.py — Dynamic DB selection middleware."""
import re
import logging
from fastapi import Request
from starlette.middleware.base import BaseHTTPMiddleware
from app.database.session import current_db_var, DEFAULT_DB, get_schema_name
from app.core.config import get_settings

logger = logging.getLogger(__name__)
settings = get_settings()

# Strict regex to prevent any SQL Injection or path traversal via database name
DB_NAME_PATTERN = re.compile(r"^[a-zA-Z0-9_]{1,50}$")

# Base de données partagée pour l'authentification
AUTH_DB = "auth_db"

# Routes d'authentification qui doivent utiliser la base partagée
AUTH_ROUTES = ["/auth/login", "/auth/register", "/auth/me", "/auth/logout", "/users/me/password"]

class DatabaseSelectorMiddleware(BaseHTTPMiddleware):
    async def dispatch(self, request: Request, call_next):
        # Déterminer si c'est une requête d'authentification
        is_auth_route = any(request.url.path.startswith(route) for route in AUTH_ROUTES)

        if is_auth_route:
            # Utiliser toujours la base partagée pour l'authentification
            db_name = AUTH_DB
            logger.info(f"[Auth Route] Request to {request.url.path} - Using auth database: {db_name}")
        else:
            # Extraire db name du Header ou Query Param pour les requêtes métier
            db_name = (
                request.headers.get("X-Database-Select") or
                request.query_params.get("db") or
                DEFAULT_DB
            )
            logger.info(f"[DB Switch] Request to {request.url.path} - Using database: {db_name}")

        # Valider le format du nom de base
        if not DB_NAME_PATTERN.match(db_name):
            logger.warning(f"Invalid database name requested: '{db_name}'. Falling back to default.")
            db_name = DEFAULT_DB

        # Mode schémas : utiliser le nom du schéma au lieu du nom de la base
        if settings.USE_SCHEMAS:
            schema_name = get_schema_name(db_name)
            logger.info(f"[Schema Mode] Mapping '{db_name}' -> schema '{schema_name}'")
            # Toujours utiliser le nom de la base pour le contextvar (session.py gère le mapping)
            # mais logger pour le debugging
        else:
            logger.info(f"[Database Mode] Using separate database: {db_name}")

        # Définir le contextvar pour la durée de cette requête
        token = current_db_var.set(db_name)
        try:
            response = await call_next(request)
            return response
        finally:
            current_db_var.reset(token)
