from sqlalchemy.orm import Session
from typing import Optional, List

from app.models.app_user import AppUser, UserRoleEnum
from app.core.security import hash_password
from app.repositories.base import BaseRepository


class AppUserRepository(BaseRepository[AppUser]):

    def __init__(self):
        super().__init__(AppUser)

    def get_by_email(
        self,
        db: Session,
        email: str
    ) -> Optional[AppUser]:

        return (
            db.query(AppUser)
            .filter(AppUser.email == email)
            .one_or_none()
        )

    def get_by_login(
        self,
        db: Session,
        login: str
    ) -> Optional[AppUser]:

        return (
            db.query(AppUser)
            .filter(AppUser.login == login)
            .one_or_none()
        )

    def email_exists(
        self,
        db: Session,
        email: str
    ) -> bool:

        return (
            db.query(AppUser)
            .filter(AppUser.email == email)
            .first()
            is not None
        )

    def get_active_users(
        self,
        db: Session
    ) -> List[AppUser]:

        return (
            db.query(AppUser)
            .filter(AppUser.is_active.is_(True))
            .all()
        )

    def get_by_view_group(
        self,
        db: Session,
        group: str
    ) -> List[AppUser]:

        return (
            db.query(AppUser)
            .filter(AppUser.dashboard_view_group == group)
            .all()
        )

    def create_user(
        self,
        db: Session,
        email: str,
        password: str,
        role: UserRoleEnum = UserRoleEnum.user,
        login: Optional[str] = None,
        name: Optional[str] = None,
        dashboard_view_group: Optional[str] = None
    ) -> AppUser:

        user = AppUser(
            email=email,
            login=login,
            name=name,
            hashed_password=hash_password(password),
            role=role,
            is_active=True,
            dashboard_view_group=dashboard_view_group
        )

        db.add(user)

        return user

    def update_user(
        self,
        db: Session,
        user: AppUser,
        role: Optional[UserRoleEnum] = None,
        is_active: Optional[bool] = None,
        new_password: Optional[str] = None,
        dashboard_view_group: Optional[str] = None
    ) -> AppUser:

        if role is not None:
            user.role = role

        if is_active is not None:
            user.is_active = is_active

        if new_password is not None:
            user.hashed_password = hash_password(new_password)

        if dashboard_view_group is not None:
            user.dashboard_view_group = dashboard_view_group

        return user