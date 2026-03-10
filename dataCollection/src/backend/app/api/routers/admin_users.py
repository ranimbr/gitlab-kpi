import logging

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session
from typing import List

from app.database.session import get_db
from app.api.dependencies import get_current_admin, get_current_user
from app.core.security import verify_password
from app.models.app_user import AppUser
from app.repositories.user_repository import AppUserRepository
from app.schemas.user import (
    ChangePasswordRequest,
    CreateUserRequest,
    UpdateUserRequest,
    UserManagementResponse,
)

logger = logging.getLogger(__name__)

router = APIRouter(tags=["User Management"])
repo   = AppUserRepository()


# ─── Liste des utilisateurs (Admin) ──────────────────────────────────────────

@router.get("/admin/users", response_model=List[UserManagementResponse])
def list_users(
    db:            Session = Depends(get_db),
    current_admin: AppUser = Depends(get_current_admin),
):
    """
    [FIX] get_all() retourne List[T], pas un objet Query.
    On ne peut pas chaîner .order_by() dessus.
    Correction : tri Python après récupération ou requête directe.
    """
    users = (
        db.query(AppUser)
        .order_by(AppUser.created_at.desc())
        .all()
    )
    return users


# ─── Créer un utilisateur (Admin) ────────────────────────────────────────────

@router.post(
    "/admin/users",
    response_model=UserManagementResponse,
    status_code=status.HTTP_201_CREATED,
)
def create_user(
    request:       CreateUserRequest,
    db:            Session = Depends(get_db),
    current_admin: AppUser = Depends(get_current_admin),
):
    if repo.email_exists(db, request.email):
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Email already registered",
        )

    if request.login and repo.get_by_login(db, request.login):
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Login already taken",
        )

    user = repo.create_user(
        db=db,
        email=request.email,
        password=request.password,
        role=request.role,
        login=request.login,
        name=request.name,
        dashboard_view_group=request.dashboard_view_group,
    )

    db.commit()
    db.refresh(user)

    logger.info(f"User created by admin {current_admin.id} — new user id={user.id}")
    return user


# ─── Modifier un utilisateur (Admin) ─────────────────────────────────────────

@router.put("/admin/users/{user_id}", response_model=UserManagementResponse)
def update_user(
    user_id:       int,
    request:       UpdateUserRequest,
    db:            Session = Depends(get_db),
    current_admin: AppUser = Depends(get_current_admin),
):
    user = repo.get_by_id(db, user_id)
    if not user:
        raise HTTPException(status_code=404, detail="User not found")

    # Empêcher l'admin de se désactiver lui-même
    if user.id == current_admin.id and request.is_active is False:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="You cannot deactivate your own account",
        )

    # Empêcher l'admin de se dégrader lui-même
    if user.id == current_admin.id and request.role == "user":
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="You cannot downgrade your own admin role",
        )

    repo.update_user(
        db=db,
        user=user,
        role=request.role,
        is_active=request.is_active,
        new_password=request.new_password,
        dashboard_view_group=request.dashboard_view_group,
    )

    db.commit()
    db.refresh(user)

    logger.info(f"User updated by admin {current_admin.id} — user id={user.id}")
    return user


# ─── Supprimer un utilisateur (Admin) ────────────────────────────────────────

@router.delete("/admin/users/{user_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_user(
    user_id:       int,
    db:            Session = Depends(get_db),
    current_admin: AppUser = Depends(get_current_admin),
):
    user = repo.get_by_id(db, user_id)
    if not user:
        raise HTTPException(status_code=404, detail="User not found")

    if user.id == current_admin.id:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="You cannot delete your own account",
        )

    db.delete(user)
    db.commit()

    logger.info(f"User deleted by admin {current_admin.id} — user id={user_id}")
    return None


# ─── Profil personnel ────────────────────────────────────────────────────────

@router.get("/users/me", response_model=UserManagementResponse)
def get_my_profile(current_user: AppUser = Depends(get_current_user)):
    return current_user


# ─── Changer mot de passe (self-service) ─────────────────────────────────────

@router.put("/users/me/password", status_code=status.HTTP_200_OK)
def change_my_password(
    request:      ChangePasswordRequest,
    db:           Session = Depends(get_db),
    current_user: AppUser = Depends(get_current_user),
):
    # [FIX] hashed_password (pas password_hash)
    if not verify_password(request.current_password, current_user.hashed_password):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Current password is incorrect",
        )

    if request.new_password != request.confirm_password:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="New passwords do not match",
        )

    repo.update_user(db=db, user=current_user, new_password=request.new_password)
    db.commit()

    logger.info(f"Password changed — user id={current_user.id}")
    return {"message": "Password updated successfully"}
