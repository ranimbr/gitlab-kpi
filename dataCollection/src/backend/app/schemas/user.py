"""
schemas/user.py


"""
from pydantic import BaseModel, EmailStr, Field, model_validator
from typing import Optional, List
from datetime import datetime
from app.schemas.enums import UserRoleEnum


# ── Schemas pour UserSiteAccess (multi-sites) ────────────────────────────────
class UserSiteAccessBase(BaseModel):
    site_id: int
    is_primary: bool = False


class UserSiteAccessCreate(UserSiteAccessBase):
    user_id: int


class UserSiteAccessResponse(UserSiteAccessBase):
    id: int
    user_id: int
    assigned_at: datetime
    
    model_config = {"from_attributes": True}


# ── Schemas pour UserGroupAccess (multi-équipes) ─────────────────────────────
class UserGroupAccessBase(BaseModel):
    group_id: int
    is_primary: bool = False


class UserGroupAccessCreate(UserGroupAccessBase):
    user_id: int


class UserGroupAccessResponse(UserGroupAccessBase):
    id: int
    user_id: int
    assigned_at: datetime
    
    model_config = {"from_attributes": True}


class CreateUserRequest(BaseModel):
    email:    EmailStr
    password: str          = Field(min_length=8)
    role:     UserRoleEnum = UserRoleEnum.developer
    login:    Optional[str]       = Field(default=None, min_length=2, max_length=100)
    name:     Optional[str]       = Field(default=None, max_length=255)

    # ✅ AJOUT : site_id requis si role=site_manager (compatibilité ancien système)
    site_id:  Optional[int]       = Field(
        default=None,
        description="Obligatoire si role=site_manager (ancien système single site)",
    )
    # ✅ AJOUT : site_ids pour multi-sites (nouveau système)
    site_ids: Optional[List[int]] = Field(
        default=None,
        description="Liste des sites accessibles (pour multi-sites)",
    )
    # ✅ AJOUT : group_id requis si role=team_lead (compatibilité ancien système)
    group_id: Optional[int]       = Field(
        default=None,
        description="Obligatoire si role=team_lead (ancien système single group)",
    )
    # ✅ AJOUT : group_ids pour multi-équipes (nouveau système)
    group_ids: Optional[List[int]] = Field(
        default=None,
        description="Liste des équipes accessibles (pour multi-équipes)",
    )
    # ✅ AJOUT : profile_id pour synchronisation avec ProfileManagementPage
    profile_id: Optional[int]     = Field(
        default=None,
        description="Profil d'accès aux menus (synchronisé avec ProfileManagementPage)",
    )
    # ✅ AJOUT : project_ids pour synchronisation avec Projects
    project_ids: Optional[List[int]] = Field(
        default=None,
        description="Liste des projets assignés (pour project_managers)",
    )

    dashboard_access: Optional[List[int]] = None

    @model_validator(mode="after")
    def validate_role_requirements(self) -> "CreateUserRequest":
        # Priorité au nouveau système multi-sites/multi-équipes
        if self.role == UserRoleEnum.site_manager:
            if not self.site_ids and not self.site_id:
                raise ValueError("site_ids ou site_id est obligatoire pour le rôle site_manager.")
        if self.role == UserRoleEnum.team_lead:
            if not self.group_ids and not self.group_id:
                raise ValueError("group_ids ou group_id est obligatoire pour le rôle team_lead.")
        if self.role == UserRoleEnum.project_manager and (not self.project_ids or len(self.project_ids) == 0):
            raise ValueError("project_ids est obligatoire pour le rôle project_manager.")
        if self.dashboard_access:
            if any(i <= 0 for i in self.dashboard_access):
                raise ValueError("dashboard_access contient des IDs invalides (doivent être > 0).")
        return self


class UpdateUserRequest(BaseModel):
    role:             Optional[UserRoleEnum] = None
    is_active:        Optional[bool]         = None
    new_password:     Optional[str]          = Field(default=None, min_length=8)
    dashboard_access: Optional[List[int]]    = None
    # ✅ AJOUT : site_id (compatibilité ancien système)
    site_id:          Optional[int]          = None
    # ✅ AJOUT : site_ids pour multi-sites (nouveau système)
    site_ids:         Optional[List[int]]     = Field(
        default=None,
        description="Liste des sites accessibles (pour multi-sites)",
    )
    # ✅ AJOUT : group_id (compatibilité ancien système)
    group_id:         Optional[int]          = None
    # ✅ AJOUT : group_ids pour multi-équipes (nouveau système)
    group_ids:        Optional[List[int]]     = Field(
        default=None,
        description="Liste des équipes accessibles (pour multi-équipes)",
    )
    # ✅ AJOUT : profile_id pour synchronisation avec ProfileManagementPage
    profile_id:       Optional[int]          = Field(
        default=None,
        description="Profil d'accès aux menus (synchronisé avec ProfileManagementPage)",
    )
    # ✅ AJOUT : project_ids pour synchronisation avec Projects
    project_ids:      Optional[List[int]]      = Field(
        default=None,
        description="Liste des projets assignés (pour project_managers)",
    )


class ChangePasswordRequest(BaseModel):
    current_password: str = Field(min_length=1)
    new_password:     str = Field(min_length=8)
    confirm_password: str = Field(min_length=8)

    @model_validator(mode="after")
    def passwords_must_match(self) -> "ChangePasswordRequest":
        if self.new_password != self.confirm_password:
            raise ValueError("new_password et confirm_password ne correspondent pas.")
        if self.current_password == self.new_password:
            raise ValueError("Le nouveau mot de passe doit être différent de l'ancien.")
        return self


class UserManagementResponse(BaseModel):
    id:               int
    email:            str
    login:            Optional[str]
    name:             Optional[str]
    role:             str
    is_active:        bool
    dashboard_access: Optional[List[int]] = None
    # ✅ AJOUT : site_id (compatibilité ancien système)
    site_id:          Optional[int]       = None
    # ✅ AJOUT : site_ids pour multi-sites (nouveau système) - utilise un sérialiseur personnalisé
    site_ids:         Optional[List[int]] = Field(default=None)
    # ✅ AJOUT : group_id (compatibilité ancien système)
    group_id:         Optional[int]       = None
    # ✅ AJOUT : group_ids pour multi-équipes (nouveau système) - utilise un sérialiseur personnalisé
    group_ids:        Optional[List[int]] = Field(default=None)
    # ✅ AJOUT : profile_id pour synchronisation avec ProfileManagementPage
    profile_id:        Optional[int]       = None
    profile_name:      Optional[str]       = None
    # ✅ AJOUT : project_ids pour synchronisation avec Projects - utilise un sérialiseur personnalisé
    project_ids:       Optional[List[int]] = Field(default=None)
    created_at:       datetime

    @classmethod
    def from_orm(cls, user: "AppUser") -> "UserManagementResponse":
        """✅ Sérialiseur personnalisé pour lire les propriétés du modèle"""
        try:
            site_ids = user.site_ids
        except:
            site_ids = None
        try:
            group_ids = user.group_ids
        except:
            group_ids = None
        try:
            project_ids = user.project_ids
        except:
            project_ids = None
        
        return cls(
            id=user.id,
            email=user.email,
            login=user.login,
            name=user.name,
            role=user.role.value if hasattr(user.role, 'value') else str(user.role),
            is_active=user.is_active,
            dashboard_access=user.dashboard_access,
            site_id=user.site_id,
            site_ids=site_ids,
            group_id=user.group_id,
            group_ids=group_ids,
            profile_id=user.profile_id,
            profile_name=getattr(user, 'profile_name', None),
            project_ids=project_ids,
            created_at=user.created_at,
        )

    model_config = {"from_attributes": False}