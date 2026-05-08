"""
services/admin/user_service.py

CORRECTIONS (modèles mis à jour) :
─────────────────────────────────────
1. UserRoleEnum : 4 rôles (super_admin, site_manager, team_lead, developer).
2. create_user() : ajout site_id et group_id.
3. update_user() : ajout site_id et group_id.
"""
import logging
from typing import List, Optional

from fastapi import HTTPException, status
from sqlalchemy.orm import Session

from app.core.security import hash_password, verify_password
from app.models.app_user import AppUser
from app.repositories.audit_log_repository import AuditLogRepository
from app.repositories.user_repository import AppUserRepository
from app.schemas.user import CreateUserRequest, UpdateUserRequest

logger = logging.getLogger(__name__)


class UserService:

    def __init__(self):
        self.user_repo  = AppUserRepository()
        self.audit_repo = AuditLogRepository()

    def create_user(
        self,
        db:         Session,
        payload:    CreateUserRequest,
        created_by: Optional[int] = None,
        ip_address: Optional[str] = None,
    ) -> AppUser:

        if self.user_repo.email_exists(db, payload.email):
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail="Un utilisateur avec cet email existe déjà.",
            )
        if payload.login and self.user_repo.get_by_login(db, payload.login):
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail="Ce login est déjà utilisé.",
            )

        hashed = hash_password(payload.password)

        user = self.user_repo.create_user(
            db               = db,
            email            = payload.email,
            hashed_password  = hashed,
            role             = payload.role,
            login            = payload.login,
            name             = payload.name,
            dashboard_access = payload.dashboard_access,
            # ✅ AJOUT
            site_id          = payload.site_id,
            group_id         = payload.group_id,
        )

        self.audit_repo.log(
            db=db, user_id=created_by, action="CREATE_USER",
            entity_type="AppUser", entity_id=user.id,
            entity_name=user.name or user.email,
            new_value={"email": user.email, "role": user.role.value},
            ip_address=ip_address,
        )

        db.commit()
        db.refresh(user)
        logger.info(f"User created — id={user.id} email={user.email} role={user.role}")
        return user

    def get_all_users(self, db: Session) -> List[AppUser]:
        return self.user_repo.get_all(db)

    def get_user(self, db: Session, user_id: int) -> AppUser:
        user = self.user_repo.get_by_id(db, user_id)
        if not user:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND,
                detail="Utilisateur introuvable.")
        return user

    def update_user(
        self,
        db:         Session,
        user_id:    int,
        payload:    UpdateUserRequest,
        updated_by: Optional[int] = None,
        ip_address: Optional[str] = None,
    ) -> AppUser:

        user = self.get_user(db, user_id)
        old_value = {
            "role": user.role.value, "is_active": user.is_active,
            "dashboard_access": list(user.dashboard_access or []),
        }

        new_hashed = hash_password(payload.new_password) if payload.new_password else None

        self.user_repo.update_user(
            db=db, user=user,
            role=payload.role, is_active=payload.is_active,
            new_hashed_password=new_hashed,
            dashboard_access=payload.dashboard_access,
            site_id=payload.site_id,
            group_id=payload.group_id,
        )

        self.audit_repo.log(
            db=db, user_id=updated_by, action="UPDATE_USER",
            entity_type="AppUser", entity_id=user_id,
            entity_name=user.name or user.email,
            old_value=old_value,
            new_value=payload.model_dump(exclude_unset=True, exclude={"new_password"}),
            ip_address=ip_address,
        )

        db.commit()
        db.refresh(user)
        return user

    def delete_user(
        self,
        db:         Session,
        user_id:    int,
        deleted_by: Optional[int] = None,
        ip_address: Optional[str] = None,
    ) -> None:
        user = self.get_user(db, user_id)
        self.audit_repo.log(
            db=db, user_id=deleted_by, action="DELETE_USER",
            entity_type="AppUser", entity_id=user_id,
            entity_name=user.name or user.email,
            old_value={"email": user.email, "role": user.role.value},
            ip_address=ip_address,
        )
        db.delete(user)
        db.commit()

    def grant_dashboard_access(
        self,
        db:           Session,
        user_id:      int,
        dashboard_id: int,
        granted_by:   Optional[int] = None,
        ip_address:   Optional[str] = None,
    ) -> AppUser:
        user = self.get_user(db, user_id)
        old_access = list(user.dashboard_access or [])
        self.user_repo.add_dashboard_access(db, user, dashboard_id)
        self.audit_repo.log(
            db=db, user_id=granted_by, action="UPDATE_USER_ACCESS",
            entity_type="AppUser", entity_id=user_id,
            old_value={"dashboard_access": old_access},
            new_value={"dashboard_access": list(user.dashboard_access or [])},
            ip_address=ip_address,
        )
        db.commit()
        db.refresh(user)
        return user

    def revoke_dashboard_access(
        self,
        db:           Session,
        user_id:      int,
        dashboard_id: int,
        revoked_by:   Optional[int] = None,
        ip_address:   Optional[str] = None,
    ) -> AppUser:
        user = self.get_user(db, user_id)
        old_access = list(user.dashboard_access or [])
        self.user_repo.remove_dashboard_access(db, user, dashboard_id)
        self.audit_repo.log(
            db=db, user_id=revoked_by, action="UPDATE_USER_ACCESS",
            entity_type="AppUser", entity_id=user_id,
            old_value={"dashboard_access": old_access},
            new_value={"dashboard_access": list(user.dashboard_access or [])},
            ip_address=ip_address,
        )
        db.commit()
        db.refresh(user)
        return user

    def change_password(
        self, db: Session, user_id: int,
        current_password: str, new_password: str, confirm_password: str,
    ) -> None:
        if new_password != confirm_password:
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST,
                detail="Les nouveaux mots de passe ne correspondent pas.")
        user = self.get_user(db, user_id)
        if not verify_password(current_password, user.hashed_password):
            raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED,
                detail="Mot de passe actuel incorrect.")
        self.user_repo.update_user(db=db, user=user, new_hashed_password=hash_password(new_password))
        db.commit()