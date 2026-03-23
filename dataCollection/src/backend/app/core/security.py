"""
core/security.py

CORRECTION — _get_fernet() :
    Contrôle `if len(raw) != 44` sur des bytes après .encode().
    
    Problème : si ENCRYPTION_KEY contient des caractères non-ASCII
    (ex: unicode), `.encode()` produit plus de bytes que de chars
    → len(bytes) != len(str) → la vérification était incorrecte.
    
    ✅ FIX : comparer len(key) sur la STRING d'origine (avant encode)
    et valider que c'est un base64-url valide via base64.urlsafe_b64decode().
    Si invalide → dériver depuis SECRET_KEY.
"""
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
logger   = logging.getLogger(__name__)

# ── Password Hashing ──────────────────────────────────────────────────────────

pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")
security    = HTTPBearer(auto_error=True)


def hash_password(password: str) -> str:
    """Hash un mot de passe utilisateur via bcrypt."""
    return pwd_context.hash(password)


def verify_password(plain_password: str, hashed_password: str) -> bool:
    """Vérifie un mot de passe utilisateur contre son hash bcrypt."""
    return pwd_context.verify(plain_password, hashed_password)


# ── JWT ───────────────────────────────────────────────────────────────────────

def create_access_token(
    data:          Dict[str, Any],
    expires_delta: Optional[timedelta] = None,
) -> str:
    """Crée un JWT access token signé avec SECRET_KEY."""
    to_encode        = data.copy()
    to_encode["exp"] = datetime.now(timezone.utc) + (
        expires_delta or timedelta(minutes=settings.ACCESS_TOKEN_EXPIRE_MINUTES)
    )
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


# ── Token GitLab Encryption (Fernet AES-128-CBC) ─────────────────────────────

def _derive_key_from_secret() -> bytes:
    """
    Dérive une clé Fernet déterministe depuis SECRET_KEY.
    Utilisé en dev/test quand ENCRYPTION_KEY n'est pas défini.
    """
    return base64.urlsafe_b64encode(
        hashlib.sha256(settings.SECRET_KEY.encode("utf-8")).digest()
    )


def _get_fernet() -> Fernet:
    """
    Retourne une instance Fernet pour chiffrement/déchiffrement.

    Priorité :
        1. ENCRYPTION_KEY depuis .env (recommandé en production)
        2. Dérivé depuis SECRET_KEY (dev/test uniquement)

    ✅ FIX : validation correcte de ENCRYPTION_KEY.
        - Test sur len(key_str) (STRING, pas bytes) pour compter les chars
        - Validation que c'est un base64-url valide via urlsafe_b64decode()
        - Si invalide → dérivation depuis SECRET_KEY avec warning

    Générer une clé valide :
        python -c "from cryptography.fernet import Fernet; print(Fernet.generate_key().decode())"
    """
    key_str = settings.ENCRYPTION_KEY

    if key_str:
        # ✅ FIX : len() sur la STRING d'origine, pas sur les bytes encodés
        is_valid_fernet_key = False
        try:
            # Une clé Fernet valide = 32 bytes en base64-url = 44 chars ASCII
            if len(key_str) == 44:
                decoded = base64.urlsafe_b64decode(key_str + "==")  # padding tolérant
                if len(decoded) == 32:
                    is_valid_fernet_key = True
        except Exception:
            pass

        if is_valid_fernet_key:
            return Fernet(key_str.encode("utf-8"))
        else:
            # Clé fournie mais format invalide → dériver depuis elle-même
            logger.warning(
                "ENCRYPTION_KEY format is invalid (expected 44-char base64-url string). "
                "Deriving key from ENCRYPTION_KEY value. "
                "Generate a proper key with: python -c \"from cryptography.fernet import Fernet; print(Fernet.generate_key().decode())\""
            )
            derived = base64.urlsafe_b64encode(
                hashlib.sha256(key_str.encode("utf-8")).digest()
            )
            return Fernet(derived)

    # Pas de ENCRYPTION_KEY → dériver depuis SECRET_KEY (dev uniquement)
    logger.warning(
        "ENCRYPTION_KEY not configured — deriving from SECRET_KEY. "
        "This is acceptable for development but NOT for production. "
        "Set ENCRYPTION_KEY in .env!"
    )
    return Fernet(_derive_key_from_secret())


def encrypt_token(plain_token: str) -> str:
    """
    Chiffre un token GitLab pour stockage sécurisé en base.
    Utilise Fernet (AES-128-CBC + HMAC-SHA256).
    """
    try:
        return _get_fernet().encrypt(plain_token.encode("utf-8")).decode("utf-8")
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
        return _get_fernet().decrypt(encrypted_token.encode("utf-8")).decode("utf-8")
    except InvalidToken:
        # Token non chiffré (legacy / dev sans encryption configurée)
        logger.warning(
            "decrypt_token: token does not appear to be Fernet-encrypted — "
            "returning raw value. Encrypt all tokens in production."
        )
        return encrypted_token
    except Exception as e:
        logger.error(f"Token decryption failed: {e}")
        raise ValueError("Token decryption failed") from e


# ── FastAPI Dependency ────────────────────────────────────────────────────────

def get_current_user(
    credentials: HTTPAuthorizationCredentials = Depends(security),
    db:          Session                       = Depends(get_db),
):
    """
    Dependency FastAPI — récupère l'utilisateur connecté depuis le JWT Bearer.
    Lève HTTP 401 si token invalide / expiré / utilisateur inexistant.
    Lève HTTP 403 si utilisateur inactif.

    Import local de AppUser pour éviter les imports circulaires :
        security.py → AppUser → (via relations) → security.py
    """
    from app.models.app_user import AppUser  # import local intentionnel

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