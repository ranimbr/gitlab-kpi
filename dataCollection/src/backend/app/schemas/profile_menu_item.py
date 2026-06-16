"""
schemas/profile_menu_item.py

Schemas Pydantic pour ProfileMenuItem.
"""

from pydantic import BaseModel, Field


class ProfileMenuItemAccess(BaseModel):
    """Schema pour mettre à jour l'accès d'un profil à un menu."""
    menu_item_id: int
    has_access: bool = False


class ProfileMenuItemBatchUpdate(BaseModel):
    """Schema pour mettre à jour les accès d'un profil en lot."""
    menu_items: list[ProfileMenuItemAccess] = Field(default_factory=list)
