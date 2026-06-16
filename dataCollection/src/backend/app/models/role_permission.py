"""
models/role_permission.py

Table de jonction Role-Permission pour la gestion des permissions par rôle.
"""

from sqlalchemy import Column, Integer, ForeignKey, UniqueConstraint
from sqlalchemy.orm import relationship

from app.models.base import Base


class RolePermission(Base):
    """
    Association entre un Role et une Permission.
    
    Définit quelles permissions sont accordées à un rôle donné.
    """
    
    __tablename__ = "role_permission"
    
    id = Column(Integer, primary_key=True)
    role_id = Column(
        Integer,
        ForeignKey("role.id", ondelete="CASCADE"),
        nullable=False,
    )
    permission_id = Column(
        Integer,
        ForeignKey("permission.id", ondelete="CASCADE"),
        nullable=False,
    )
    
    # ── Relations ────────────────────────────────────────────────────────────
    role = relationship(
        "Role",
        back_populates="permissions",
    )
    permission = relationship(
        "Permission",
        back_populates="role_permissions",
    )
    
    # ── Contraintes ──────────────────────────────────────────────────────────
    __table_args__ = (
        UniqueConstraint("role_id", "permission_id", name="uq_role_permission"),
    )
