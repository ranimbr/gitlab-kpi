from pydantic import BaseModel, EmailStr, Field
from typing import Optional


class RegisterRequest(BaseModel):
    email    : EmailStr
    password : str = Field(min_length=8, max_length=128)
    login    : Optional[str] = None
    name     : Optional[str] = None


class LoginRequest(BaseModel):
    email    : EmailStr
    password : str


class TokenResponse(BaseModel):
    access_token : str
    token_type   : str = "bearer"


class UserResponse(BaseModel):
    id       : int
    email    : EmailStr
    login    : Optional[str]
    name     : Optional[str]
    role     : str
    is_active: bool

    class Config:
        from_attributes = True