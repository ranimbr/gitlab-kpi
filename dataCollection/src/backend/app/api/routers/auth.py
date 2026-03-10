from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session
from datetime import timedelta

from app.database.session import get_db
from app.schemas.auth import (
    RegisterRequest, LoginRequest,
    TokenResponse, UserResponse
)
from app.repositories.user_repository import AppUserRepository
from app.core.security import verify_password, create_access_token
from app.core.config import get_settings
from app.api.dependencies import get_current_user
from app.models.app_user import AppUser

router   = APIRouter(prefix="/auth", tags=["Auth"])
settings = get_settings()
repo     = AppUserRepository()


@router.post("/register", response_model=UserResponse, status_code=201)
def register(request: RegisterRequest, db: Session = Depends(get_db)):

    if repo.email_exists(db, request.email):
        raise HTTPException(
            status_code = status.HTTP_400_BAD_REQUEST,
            detail      = "Email already registered"
        )

    user = repo.create_user(
        db    = db,
        email = request.email,
        password = request.password,
        login = request.login,
        name  = request.name
    )
    db.commit()
    db.refresh(user)
    return user


@router.post("/login", response_model=TokenResponse)
def login(request: LoginRequest, db: Session = Depends(get_db)):

    user = repo.get_by_email(db, request.email)

    if not user or not verify_password(request.password, user.hashed_password):
        raise HTTPException(
            status_code = status.HTTP_401_UNAUTHORIZED,
            detail      = "Invalid email or password"
        )

    if not user.is_active:
        raise HTTPException(
            status_code = status.HTTP_403_FORBIDDEN,
            detail      = "User account is inactive"
        )

    access_token = create_access_token(
        data           = {"sub": str(user.id), "role": user.role},
        expires_delta  = timedelta(minutes=settings.ACCESS_TOKEN_EXPIRE_MINUTES)
    )

    return TokenResponse(access_token=access_token)


@router.get("/me", response_model=UserResponse)
def get_me(current_user: AppUser = Depends(get_current_user)):
    return current_user