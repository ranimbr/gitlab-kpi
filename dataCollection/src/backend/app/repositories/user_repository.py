"""
repositories/user_repository.py

"""
from typing import Optional, List
from sqlalchemy.orm import Session
from sqlalchemy.orm import selectinload
from app.models.app_user import AppUser, UserRoleEnum
from app.repositories.base import BaseRepository, UNSET


class AppUserRepository(BaseRepository[AppUser]):

    def __init__(self):
        super().__init__(AppUser)

    # ── READ ──────────────────────────────────────────────────────────────────

    def get_all(self, db: Session) -> List[AppUser]:
        """✅ FIX : Charger site_accesses et group_accesses pour multi-sites/multi-équipes"""
        return db.query(AppUser).options(
            selectinload(AppUser.site_accesses),
            selectinload(AppUser.group_accesses)
        ).all()

    def get_by_email(self, db: Session, email: str) -> Optional[AppUser]:
        return db.query(AppUser).filter(AppUser.email == email).one_or_none()

    def get_by_login(self, db: Session, login: str) -> Optional[AppUser]:
        return db.query(AppUser).filter(AppUser.login == login).one_or_none()

    def email_exists(self, db: Session, email: str) -> bool:
        return db.query(AppUser.id).filter(AppUser.email == email).first() is not None

    def get_active_users(self, db: Session) -> List[AppUser]:
        return db.query(AppUser).filter(AppUser.is_active.is_(True)).all()

    def get_by_role(self, db: Session, role: UserRoleEnum) -> List[AppUser]:
        """Retourne tous les utilisateurs d'un rôle donné."""
        return (
            db.query(AppUser)
            .filter(
                AppUser.role == role,
                AppUser.is_active.is_(True),
            )
            .all()
        )

    def get_super_admins(self, db: Session) -> List[AppUser]:
        """✅ FIX : super_admin remplace admin."""
        return self.get_by_role(db, UserRoleEnum.super_admin)

    def get_site_managers(self, db: Session) -> List[AppUser]:
        return self.get_by_role(db, UserRoleEnum.site_manager)

    def get_team_leads(self, db: Session) -> List[AppUser]:
        return self.get_by_role(db, UserRoleEnum.team_lead)

    def get_by_site_id(
        self,
        db:      Session,
        site_id: int,
    ) -> List[AppUser]:
        """
        ✅ AJOUT : site_managers affectés à un site donné.
        """
        return (
            db.query(AppUser)
            .filter(
                AppUser.site_id  == site_id,
                AppUser.is_active.is_(True),
            )
            .all()
        )

    def get_by_group_id(
        self,
        db:       Session,
        group_id: int,
    ) -> List[AppUser]:
        """
        ✅ AJOUT : team_leads affectés à un groupe donné.
        """
        return (
            db.query(AppUser)
            .filter(
                AppUser.group_id == group_id,
                AppUser.is_active.is_(True),
            )
            .all()
        )

    def get_by_dashboard_access(self, db: Session, dashboard_id: int) -> List[AppUser]:
        """Users ayant dashboard_id dans leur ARRAY dashboard_access (PostgreSQL @>)."""
        return (
            db.query(AppUser)
            .filter(AppUser.dashboard_access.contains([dashboard_id]))
            .all()
        )

    # ── WRITE ─────────────────────────────────────────────────────────────────

    def create_user(
        self,
        db:               Session,
        email:            str,
        hashed_password: str,
        role:             UserRoleEnum        = UserRoleEnum.developer,  # ✅ FIX
        login:            Optional[str]       = None,
        name:             Optional[str]       = None,
        dashboard_access: Optional[List[int]] = None,
        # ✅ AJOUT
        site_id:          Optional[int]       = None,
        group_id:         Optional[int]       = None,
        # ✅ AJOUT : profile_id pour synchronisation avec ProfileManagementPage
        profile_id:        Optional[int]       = None,
    ) -> AppUser:
        user = AppUser(
            email            = email,
            login            = login,
            name             = name,
            hashed_password  = hashed_password,
            role             = role,
            is_active        = True,
            dashboard_access = dashboard_access or [],
            site_id          = site_id,
            group_id         = group_id,
            profile_id        = profile_id,
        )
        db.add(user)
        db.flush()
        return user

    def update_user(
        self,
        db:                  Session,
        user:                AppUser,
        role:                Optional[UserRoleEnum] = None,
        is_active:           Optional[bool]         = None,
        new_hashed_password: Optional[str]          = None,
        dashboard_access:    Optional[List[int]]    = None,
        # ✅ AJOUT
        site_id:             Optional[int]          = UNSET,
        group_id:            Optional[int]          = UNSET,
        # ✅ AJOUT : profile_id pour synchronisation avec ProfileManagementPage
        profile_id:           Optional[int]          = UNSET,
        # ✅ AJOUT : project_ids pour synchronisation avec Projects
        project_ids:            Optional[List[int]]    = UNSET,
    ) -> AppUser:
        if role is not None:
            user.role = role
        if is_active is not None:
            user.is_active = is_active
        if new_hashed_password is not None:
            user.hashed_password = new_hashed_password
        if dashboard_access is not None:
            user.dashboard_access = dashboard_access
        # ✅ AJOUT : UNSET distingue "non fourni" de None (SET NULL)
        if site_id is not UNSET:
            user.site_id = site_id
        if group_id is not UNSET:
            user.group_id = group_id
        # ✅ AJOUT : profile_id pour synchronisation avec ProfileManagementPage
        if profile_id is not UNSET:
            user.profile_id = profile_id
        # ❌ SUPPRESSION : project_ids n'est pas un attribut du modèle AppUser, géré via user_project_access
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