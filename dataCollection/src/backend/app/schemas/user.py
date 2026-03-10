from pydantic import BaseModel, EmailStr, Field
from typing import Optional
from datetime import datetime


# ─── Création utilisateur (Admin) ────────────────────────────────

class CreateUserRequest(BaseModel):

    email: EmailStr

    password: str = Field(
        min_length=8,
        max_length=128
    )

    login: Optional[str] = None

    name: Optional[str] = None

    role: str = "user"

    dashboard_view_group: Optional[str] = None


# ─── Update utilisateur (Admin) ─────────────────────────────────

class UpdateUserRequest(BaseModel):

    role: Optional[str] = None

    is_active: Optional[bool] = None

    new_password: Optional[str] = Field(
        default=None,
        min_length=8,
        max_length=128
    )

    dashboard_view_group: Optional[str] = None


# ─── Change Password (Self Service) ─────────────────────────────

class ChangePasswordRequest(BaseModel):

    current_password: str

    new_password: str = Field(
        min_length=8,
        max_length=128
    )

    confirm_password: str


# ─── Response Admin User Management ─────────────────────────────

class UserManagementResponse(BaseModel):

    id: int

    email: EmailStr

    login: Optional[str]

    name: Optional[str]

    role: str

    is_active: bool

    dashboard_view_group: Optional[str]

    created_at: datetime

    class Config:
        from_attributes = True