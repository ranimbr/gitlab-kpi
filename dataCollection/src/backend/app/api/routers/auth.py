"""
api/routers/auth.py

"""
import logging
from datetime import timedelta

from fastapi import APIRouter, Depends, HTTPException, status
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


@router.post("/register", response_model=UserResponse, status_code=201)
def register(request: RegisterRequest, db: Session = Depends(get_db)):
    if repo.email_exists(db, request.email):
        raise HTTPException(status_code=400, detail="Email already registered")

    if request.login and repo.get_by_login(db, request.login):
        raise HTTPException(status_code=400, detail="Login already taken")

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
def login(request: LoginRequest, db: Session = Depends(get_db)):
    user = None

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
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid credentials",
        )

    if not user.is_active:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="User account is inactive",
        )

    access_token = create_access_token(
        data           = {"sub": str(user.id), "role": user.role},
        expires_delta  = timedelta(minutes=settings.ACCESS_TOKEN_EXPIRE_MINUTES),
    )

    logger.info(f"Login success — user id={user.id} role={user.role}")
    return TokenResponse(
        access_token = access_token,
        expires_in   = settings.ACCESS_TOKEN_EXPIRE_MINUTES * 60,
    )


@router.get("/me", response_model=UserResponse)
def get_me(current_user: AppUser = Depends(get_current_user)):
    return current_user