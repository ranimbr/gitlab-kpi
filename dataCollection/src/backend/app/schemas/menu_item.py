"""
schemas/menu_item.py

Schemas Pydantic pour MenuItem.
"""

from typing import Optional
from pydantic import BaseModel, Field


class MenuItemBase(BaseModel):
    label: str = Field(..., min_length=1, max_length=100)
    route: Optional[str] = Field(None, max_length=255)
    icon: Optional[str] = Field(None, max_length=50)
    parent_id: Optional[int] = None
    order_index: int = Field(default=0, ge=0)
    is_active: bool = True


class MenuItemCreate(MenuItemBase):
    pass


class MenuItemUpdate(MenuItemBase):
    pass


class MenuItemResponse(MenuItemBase):
    id: int
    
    class Config:
        from_attributes = True


class MenuItemTree(MenuItemResponse):
    """MenuItem avec ses enfants pour la structure hiérarchique."""
    children: list["MenuItemTree"] = Field(default_factory=list)
    
    class Config:
        from_attributes = True


class MenuItemWithAccess(MenuItemResponse):
    """MenuItem avec indication d'accès pour un profil donné."""
    has_access: bool = False
    children: list["MenuItemWithAccess"] = Field(default_factory=list)
    
    class Config:
        from_attributes = True


# Pour résoudre les références forward
MenuItemTree.model_rebuild()
MenuItemWithAccess.model_rebuild()
