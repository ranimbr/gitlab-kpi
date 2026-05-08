"""
api/routers/auth.py

"""
import logging
import threading
import time
from datetime import timedelta

from fastapi import APIRouter, Depends, HTTPException, Request, status
from sqlalchemy.orm import Session

from app.api.dependencies import get_current_user
from app.core.config import get_settings
from app.core.security import create_access_token, hash_password, verify_password
from app.database.session import get_db
from app.models.app_user import AppUser
from app.repositories.user_repository import AppUserRepository
from app.schemas.auth import LoginRequest, RegisterRequest, TokenResponse, UserResponse

logger   = logging.getLogger(__name__)
router   = APIRouter(prefix="/auth", tags=["Auth"])
settings = get_settings()
repo     = AppUserRepository()
_LOGIN_ATTEMPTS = {}
_LOGIN_GUARD = threading.Lock()


def _http_error(status_code: int, code: str, message: str) -> HTTPException:
    return HTTPException(status_code=status_code, detail=f"{code}: {message}")


def _login_bucket_key(request: Request, login_hint: str) -> str:
    client_ip = request.client.host if request.client else "unknown"
    return f"{client_ip}:{login_hint.lower().strip()}"


def _is_rate_limited(key: str, max_attempts: int, lock_seconds: int) -> bool:
    now = time.time()
    with _LOGIN_GUARD:
        state = _LOGIN_ATTEMPTS.get(key)
        if not state:
            return False
        if state.get("locked_until", 0) > now:
            return True
        if now - state.get("window_start", now) > lock_seconds:
            _LOGIN_ATTEMPTS.pop(key, None)
            return False
    return False


def _register_failed_attempt(key: str, max_attempts: int, lock_seconds: int) -> None:
    now = time.time()
    with _LOGIN_GUARD:
        state = _LOGIN_ATTEMPTS.get(key)
        if not state or now - state.get("window_start", now) > lock_seconds:
            state = {"count": 0, "window_start": now, "locked_until": 0}
            _LOGIN_ATTEMPTS[key] = state
        state["count"] += 1
        if state["count"] >= max_attempts:
            state["locked_until"] = now + lock_seconds


def _reset_attempts(key: str) -> None:
    with _LOGIN_GUARD:
        _LOGIN_ATTEMPTS.pop(key, None)


@router.post("/register", response_model=UserResponse, status_code=201)
def register(request: RegisterRequest, db: Session = Depends(get_db)):
    if repo.email_exists(db, request.email):
        raise _http_error(400, "AUTH_EMAIL_ALREADY_REGISTERED", "Email already registered")

    if request.login and repo.get_by_login(db, request.login):
        raise _http_error(400, "AUTH_LOGIN_ALREADY_TAKEN", "Login already taken")

    # ✅ FIX : hash dans le router — pas de mot de passe en clair dans le repo
    hashed = hash_password(request.password)

    user = repo.create_user(
        db              = db,
        email           = request.email,
        hashed_password = hashed,
        login           = request.login,
        name            = request.name,
    )
    db.commit()
    db.refresh(user)
    logger.info(f"User registered — id={user.id} email={user.email}")
    return user


@router.post("/login", response_model=TokenResponse)
def login(request: LoginRequest, raw_request: Request, db: Session = Depends(get_db)):
    user = None
    max_attempts = max(1, settings.LOGIN_MAX_ATTEMPTS)
    lock_seconds = max(1, settings.LOGIN_LOCK_SECONDS)
    login_hint = request.username or request.email or "unknown"
    bucket_key = _login_bucket_key(raw_request, login_hint)

    if _is_rate_limited(bucket_key, max_attempts=max_attempts, lock_seconds=lock_seconds):
        raise _http_error(429, "AUTH_TOO_MANY_ATTEMPTS", "Too many login attempts. Retry later.")

    # Lookup par email (prioritaire)
    if request.email:
        user = repo.get_by_email(db, request.email)

    # Fallback sur username/login
    if not user and request.username:
        user = repo.get_by_login(db, request.username)

    # Fallback : email fourni sans @  → traité comme login
    if not user and request.email and "@" not in request.email:
        user = repo.get_by_login(db, request.email)

    if not user or not verify_password(request.password, user.hashed_password):
        _register_failed_attempt(bucket_key, max_attempts=max_attempts, lock_seconds=lock_seconds)
        raise _http_error(status.HTTP_401_UNAUTHORIZED, "AUTH_INVALID_CREDENTIALS", "Invalid credentials")

    if not user.is_active:
        _register_failed_attempt(bucket_key, max_attempts=max_attempts, lock_seconds=lock_seconds)
        raise _http_error(status.HTTP_403_FORBIDDEN, "AUTH_USER_INACTIVE", "User account is inactive")

    access_token = create_access_token(
        data           = {
            "sub": str(user.id), 
            "role": user.role,
            "name": user.name,
            "email": user.email
        },
        expires_delta  = timedelta(minutes=settings.ACCESS_TOKEN_EXPIRE_MINUTES),
    )

    _reset_attempts(bucket_key)
    logger.info(f"Login success — user id={user.id} role={user.role}")
    return TokenResponse(
        access_token = access_token,
        expires_in   = settings.ACCESS_TOKEN_EXPIRE_MINUTES * 60,
    )


@router.get("/me", response_model=UserResponse)
def get_me(current_user: AppUser = Depends(get_current_user)):
    return current_user