import base64
import hashlib
import logging
from datetime import datetime, timedelta, timezone
from typing import Any, Dict, Optional

from cryptography.fernet import Fernet, InvalidToken
from fastapi import Depends, HTTPException, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from jose import JWTError, jwt
from passlib.context import CryptContext
from sqlalchemy.orm import Session

from app.core.config import get_settings
from app.database.session import get_db

settings = get_settings()
logger = logging.getLogger(__name__)

# ─── Password Hashing ────────────────────────────────────────────────────────

pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")
security    = HTTPBearer(auto_error=True)


def hash_password(password: str) -> str:
    """Hash un mot de passe utilisateur via bcrypt."""
    return pwd_context.hash(password)


def verify_password(plain_password: str, hashed_password: str) -> bool:
    """Vérifie un mot de passe utilisateur contre son hash bcrypt."""
    return pwd_context.verify(plain_password, hashed_password)


# ─── JWT ─────────────────────────────────────────────────────────────────────

def create_access_token(
    data: Dict[str, Any],
    expires_delta: Optional[timedelta] = None,
) -> str:
    """Crée un JWT access token signé avec SECRET_KEY."""
    to_encode = data.copy()
    expire = datetime.now(timezone.utc) + (
        expires_delta or timedelta(minutes=settings.ACCESS_TOKEN_EXPIRE_MINUTES)
    )
    to_encode["exp"] = expire

    return jwt.encode(to_encode, settings.SECRET_KEY, algorithm=settings.ALGORITHM)


def decode_access_token(token: str) -> Optional[Dict[str, Any]]:
    """
    Décode un JWT.
    Retourne le payload ou None si invalide / expiré.
    """
    try:
        return jwt.decode(
            token, settings.SECRET_KEY, algorithms=[settings.ALGORITHM]
        )
    except JWTError:
        return None


# ─── Token GitLab Encryption (Fernet AES-128-CBC) ────────────────────────────

def _get_fernet() -> Fernet:
    """
    Retourne une instance Fernet initialisée avec ENCRYPTION_KEY.

    Si ENCRYPTION_KEY n'est pas configuré en .env, on dérive une clé
    déterministe depuis SECRET_KEY (pratique pour dev / tests).
    En PRODUCTION, définir impérativement ENCRYPTION_KEY dans .env.
    """
    key = settings.ENCRYPTION_KEY

    if key:
        raw = key.encode() if isinstance(key, str) else key
        # Fernet exige exactement 32 bytes en base64-url
        if len(raw) != 44:  # 32 octets encodés en base64-url = 44 chars
            raw = base64.urlsafe_b64encode(
                hashlib.sha256(raw).digest()
            )
    else:
        logger.warning(
            "ENCRYPTION_KEY not set — deriving from SECRET_KEY. "
            "Set ENCRYPTION_KEY in .env for production!"
        )
        raw = base64.urlsafe_b64encode(
            hashlib.sha256(settings.SECRET_KEY.encode()).digest()
        )

    return Fernet(raw)


def encrypt_token(plain_token: str) -> str:
    """
    Chiffre un token GitLab pour stockage sécurisé en base.
    Utilise Fernet (AES-128-CBC + HMAC-SHA256).
    """
    try:
        f = _get_fernet()
        return f.encrypt(plain_token.encode("utf-8")).decode("utf-8")
    except Exception as e:
        logger.error(f"Token encryption failed: {e}")
        raise ValueError("Token encryption failed") from e


def decrypt_token(encrypted_token: str) -> str:
    """
    Déchiffre un token GitLab stocké en base.

    Fallback : si le token n'est pas chiffré (données legacy ou dev),
    retourne le token brut — logged comme WARNING.
    """
    try:
        f = _get_fernet()
        return f.decrypt(encrypted_token.encode("utf-8")).decode("utf-8")
    except InvalidToken:
        # Token non chiffré (legacy / dev sans encryption)
        logger.warning(
            "decrypt_token: token does not appear to be encrypted — "
            "returning raw value. Encrypt all tokens in production."
        )
        return encrypted_token
    except Exception as e:
        logger.error(f"Token decryption failed: {e}")
        raise ValueError("Token decryption failed") from e


# ─── FastAPI Dependency ───────────────────────────────────────────────────────

def get_current_user(
    credentials: HTTPAuthorizationCredentials = Depends(security),
    db: Session = Depends(get_db),
):
    """
    Dependency FastAPI — récupère l'utilisateur connecté depuis le JWT Bearer.
    Lève HTTP 401 si token invalide / expiré / utilisateur inactif.
    """
    from app.models.app_user import AppUser  # évite circular import

    payload = decode_access_token(credentials.credentials)

    if payload is None:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid or expired token",
        )

    user_id_raw = payload.get("sub")
    if user_id_raw is None:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid token payload",
        )

    try:
        user_id = int(user_id_raw)
    except (TypeError, ValueError):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid user id in token",
        )

    user = db.query(AppUser).filter(AppUser.id == user_id).first()

    if user is None:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="User not found",
        )

    if not user.is_active:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="User account is inactive",
        )

    return user
