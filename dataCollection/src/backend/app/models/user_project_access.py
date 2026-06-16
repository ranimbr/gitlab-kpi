"""
models/user_project_access.py

Modèle pour les assignations multi-projets dans la base tenant database.
Architecture multi-tenant : les assignations de projets sont stockées dans chaque tenant,
pas dans la base auth_db centrale.
"""

from sqlalchemy import Column, Integer, DateTime, Boolean
from sqlalchemy.sql import func
from app.models.base import Base


class UserProjectAccess(Base):
    """Table d'assignation utilisateurs-projets dans la base tenant."""
    __tablename__ = "user_project_access"

    id = Column(Integer, primary_key=True, autoincrement=True)
    user_id = Column(Integer, nullable=False, index=True)  # ID utilisateur depuis auth_db
    project_id = Column(Integer, nullable=False, index=True)  # ID projet
    is_primary = Column(Boolean, default=False)  # Projet principal
    assigned_at = Column(DateTime, server_default=func.now())  # Date d'assignation
    created_at = Column(DateTime, server_default=func.now())
    updated_at = Column(DateTime, server_default=func.now(), onupdate=func.now())

    def __repr__(self):
        return f"<UserProjectAccess(user_id={self.user_id}, project_id={self.project_id}, is_primary={self.is_primary})>"
