import logging
from typing import List

from fastapi import HTTPException, status
from sqlalchemy.orm import Session

from app.core.security import hash_password, verify_password
from app.models.app_user import AppUser
from app.repositories.user_repository import AppUserRepository  # [FIX] nom correct
from app.schemas.user import CreateUserRequest, UpdateUserRequest

logger = logging.getLogger(__name__)


class UserService:
    """
    Service ADMIN de gestion des utilisateurs.

    Responsabilités :
      - Création / modification / suppression utilisateur
      - Activation / désactivation
      - Reset password (admin)
      - Changement de mot de passe (self-service)
    """

    def __init__(self):
        self.user_repo = AppUserRepository()  # [FIX] AppUserRepository (pas UserRepository)

    # =========================================================================
    # CREATE USER (Admin)
    # =========================================================================

    def create_user(self, db: Session, payload: CreateUserRequest) -> AppUser:

        if self.user_repo.email_exists(db, payload.email):
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail="Un utilisateur avec cet email existe déjà",
            )

        if payload.login and self.user_repo.get_by_login(db, payload.login):
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail="Ce login est déjà utilisé",
            )

        user = self.user_repo.create_user(
            db=db,
            email=payload.email,
            password=payload.password,          # hashé dans create_user()
            role=payload.role,
            login=payload.login,
            name=payload.name,
            dashboard_view_group=payload.dashboard_view_group,
        )

        db.commit()
        db.refresh(user)

        logger.info(f"User created — id={user.id} email={user.email} role={user.role}")
        return user

    # =========================================================================
    # GET USERS
    # =========================================================================

    def get_all_users(self, db: Session) -> List[AppUser]:
        return self.user_repo.get_all(db)

    def get_user(self, db: Session, user_id: int) -> AppUser:
        user = self.user_repo.get_by_id(db, user_id)
        if not user:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Utilisateur introuvable",
            )
        return user

    # =========================================================================
    # UPDATE USER (Admin)
    # =========================================================================

    def update_user(
        self, db: Session, user_id: int, payload: UpdateUserRequest
    ) -> AppUser:

        user = self.get_user(db, user_id)

        # [FIX] Appel de update_user() qui connaît le nom exact du champ
        # hashed_password (pas password_hash)
        self.user_repo.update_user(
            db=db,
            user=user,
            role=payload.role,
            is_active=payload.is_active,
            new_password=payload.new_password,
            dashboard_view_group=payload.dashboard_view_group,
        )

        db.commit()
        db.refresh(user)

        logger.info(f"User updated — id={user.id}")
        return user

    # =========================================================================
    # DELETE USER (Admin)
    # =========================================================================

    def delete_user(self, db: Session, user_id: int) -> None:
        user = self.get_user(db, user_id)
        db.delete(user)
        db.commit()
        logger.info(f"User deleted — id={user_id}")

    # =========================================================================
    # CHANGE PASSWORD (Self-service)
    # =========================================================================

    def change_password(
        self,
        db:               Session,
        user_id:          int,
        current_password: str,
        new_password:     str,
        confirm_password: str,
    ) -> None:

        if new_password != confirm_password:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Les nouveaux mots de passe ne correspondent pas",
            )

        user = self.get_user(db, user_id)

        # [FIX] champ correct hashed_password (pas password_hash)
        if not verify_password(current_password, user.hashed_password):
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="Mot de passe actuel incorrect",
            )

        self.user_repo.update_user(db=db, user=user, new_password=new_password)
        db.commit()

        logger.info(f"Password changed — user id={user_id}")
