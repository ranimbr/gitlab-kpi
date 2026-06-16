"""
schemas/profile.py

Schemas Pydantic pour Profile.
"""

from datetime import datetime
from typing import Optional
from pydantic import BaseModel, Field


class ProfileBase(BaseModel):
    name: str = Field(..., min_length=1, max_length=100)
    description: Optional[str] = Field(None, max_length=500)


class ProfileCreate(ProfileBase):
    pass


class ProfileUpdate(ProfileBase):
    pass


class ProfileResponse(ProfileBase):
    id: int
    created_at: datetime
    updated_at: datetime
    
    class Config:
        from_attributes = True


class ProfileWithMenus(ProfileResponse):
    """Profile avec la liste des menus et leurs droits d'accès."""
    menu_items: list[dict] = Field(default_factory=list)


class ProfileMenuItemAccess(BaseModel):
    """Schéma pour mettre à jour l'accès d'un profil à un menu."""
    menu_item_id: int
    has_access: bool


class ProfileMenuItemBatchUpdate(BaseModel):
    """Schéma pour mettre à jour en lot les accès d'un profil."""
    menu_items: list[ProfileMenuItemAccess]
