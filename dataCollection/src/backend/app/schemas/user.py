"""
schemas/user.py — CORRIGÉ
- UserRoleEnum depuis enums.py (plus depuis models/)
- ChangePasswordRequest : validation confirm_password
- dashboard_access : validation IDs positifs
"""
from pydantic import BaseModel, EmailStr, Field, model_validator
from typing import Optional, List
from datetime import datetime
from app.schemas.enums import UserRoleEnum


class CreateUserRequest(BaseModel):
    email:            EmailStr
    password:         str          = Field(min_length=8)
    role:             UserRoleEnum = UserRoleEnum.user
    login:            Optional[str]      = Field(default=None, min_length=2, max_length=100)
    name:             Optional[str]      = Field(default=None, max_length=255)
    dashboard_access: Optional[List[int]] = None

    @model_validator(mode="after")
    def validate_dashboard_ids(self) -> "CreateUserRequest":
        if self.dashboard_access:
            if any(i <= 0 for i in self.dashboard_access):
                raise ValueError("dashboard_access contient des IDs invalides (doivent être > 0).")
        return self


class UpdateUserRequest(BaseModel):
    role:             Optional[UserRoleEnum] = None
    is_active:        Optional[bool]         = None
    new_password:     Optional[str]          = Field(default=None, min_length=8)
    dashboard_access: Optional[List[int]]    = None


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
    created_at:       datetime

    model_config = {"from_attributes": True}
