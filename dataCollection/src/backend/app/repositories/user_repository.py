"""
repositories/user_repository.py — inchangé fonctionnellement, nettoyé.
dashboard_view_group supprimé → dashboard_access: List[int].
"""
from typing import Optional, List
from sqlalchemy.orm import Session
from app.models.app_user import AppUser, UserRoleEnum
from app.repositories.base import BaseRepository


class AppUserRepository(BaseRepository[AppUser]):

    def __init__(self):
        super().__init__(AppUser)

    def get_by_email(self, db: Session, email: str) -> Optional[AppUser]:
        return db.query(AppUser).filter(AppUser.email == email).one_or_none()

    def get_by_login(self, db: Session, login: str) -> Optional[AppUser]:
        return db.query(AppUser).filter(AppUser.login == login).one_or_none()

    def email_exists(self, db: Session, email: str) -> bool:
        return db.query(AppUser.id).filter(AppUser.email == email).first() is not None

    def get_active_users(self, db: Session) -> List[AppUser]:
        return db.query(AppUser).filter(AppUser.is_active.is_(True)).all()

    def get_admins(self, db: Session) -> List[AppUser]:
        return db.query(AppUser).filter(AppUser.role == UserRoleEnum.admin).all()

    def get_by_dashboard_access(self, db: Session, dashboard_id: int) -> List[AppUser]:
        """Users ayant un dashboard_id dans leur ARRAY dashboard_access (PostgreSQL @>)."""
        return (
            db.query(AppUser)
            .filter(AppUser.dashboard_access.contains([dashboard_id]))
            .all()
        )

    def create_user(
        self,
        db:               Session,
        email:            str,
        hashed_password:  str,          # ✅ reçoit le hash, pas le mot de passe en clair
        role:             UserRoleEnum       = UserRoleEnum.user,
        login:            Optional[str]      = None,
        name:             Optional[str]      = None,
        dashboard_access: Optional[List[int]] = None,
    ) -> AppUser:
        """
        ✅ Reçoit hashed_password (hash déjà calculé par le service).
        Le repository ne doit PAS appeler hash_password() directement —
        c'est la responsabilité du service.
        """
        user = AppUser(
            email            = email,
            login            = login,
            name             = name,
            hashed_password  = hashed_password,
            role             = role,
            is_active        = True,
            dashboard_access = dashboard_access or [],
        )
        db.add(user)
        db.flush()
        return user

    def update_user(
        self,
        db:               Session,
        user:             AppUser,
        role:             Optional[UserRoleEnum] = None,
        is_active:        Optional[bool]         = None,
        new_hashed_password: Optional[str]       = None,
        dashboard_access: Optional[List[int]]    = None,
    ) -> AppUser:
        if role is not None:
            user.role = role
        if is_active is not None:
            user.is_active = is_active
        if new_hashed_password is not None:
            user.hashed_password = new_hashed_password
        if dashboard_access is not None:
            user.dashboard_access = dashboard_access
        db.flush()
        return user

    def add_dashboard_access(self, db: Session, user: AppUser, dashboard_id: int) -> AppUser:
        current = list(user.dashboard_access or [])
        if dashboard_id not in current:
            current.append(dashboard_id)
            user.dashboard_access = current
        db.flush()
        return user

    def remove_dashboard_access(self, db: Session, user: AppUser, dashboard_id: int) -> AppUser:
        current = list(user.dashboard_access or [])
        if dashboard_id in current:
            current.remove(dashboard_id)
            user.dashboard_access = current
        db.flush()
        return user