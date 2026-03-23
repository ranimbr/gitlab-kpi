"""
schemas/auth.py — CORRIGÉ
- UserRoleEnum depuis enums.py (découplage schema↔model)
- Validation password : longueur + complexité
- LoginRequest : validator explicite
- TokenResponse : ajout expires_in
"""
from pydantic import BaseModel, EmailStr, Field, model_validator
from typing import Optional, List
from app.schemas.enums import UserRoleEnum


class RegisterRequest(BaseModel):
    email:    EmailStr
    password: str = Field(min_length=8, description="Minimum 8 caractères")
    login:    Optional[str] = Field(default=None, min_length=2, max_length=100)
    name:     Optional[str] = Field(default=None, max_length=255)

    @model_validator(mode="after")
    def validate_password_strength(self) -> "RegisterRequest":
        pwd = self.password
        if not any(c.isupper() for c in pwd):
            raise ValueError("Le mot de passe doit contenir au moins une majuscule.")
        if not any(c.isdigit() for c in pwd):
            raise ValueError("Le mot de passe doit contenir au moins un chiffre.")
        return self


class LoginRequest(BaseModel):
    """Accepte email OU username — frontend envoie { username, password }."""
    email:    Optional[str] = Field(default=None)
    username: Optional[str] = Field(default=None)
    password: str           = Field(min_length=1)

    @model_validator(mode="after")
    def require_email_or_username(self) -> "LoginRequest":
        if not self.email and not self.username:
            raise ValueError("email ou username est requis.")
        return self


class TokenResponse(BaseModel):
    access_token: str
    token_type:   str = "bearer"
    expires_in:   Optional[int] = None   # secondes — utile pour le frontend


class UserResponse(BaseModel):
    id:               int
    email:            str
    login:            Optional[str]
    name:             Optional[str]
    role:             str
    is_active:        bool
    dashboard_access: Optional[List[int]] = None

    model_config = {"from_attributes": True}
