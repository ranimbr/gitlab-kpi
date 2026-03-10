from sqlalchemy import Column, Integer, ForeignKey, UniqueConstraint, Index
from sqlalchemy.orm import relationship

from app.models.base import Base


class DashboardAccess(Base):
    """
    Table de jonction AppUser <-> Dashboard.
    Gère les droits d'accès fins : un utilisateur peut avoir
    accès à plusieurs dashboards de projets différents.

    Plus précis que dashboard_view_group sur AppUser qui ne
    permettait qu'un seul groupe par utilisateur.
    """
    __tablename__ = "dashboard_access"

    id           = Column(Integer, primary_key=True, index=True)

    user_id = Column(
        Integer,
        ForeignKey("app_user.id", ondelete="CASCADE"),
        nullable=False,
        index=True
    )

    dashboard_id = Column(
        Integer,
        ForeignKey("dashboard.id", ondelete="CASCADE"),
        nullable=False,
        index=True
    )

    # Relations
    user      = relationship("AppUser",    back_populates="dashboard_accesses")
    dashboard = relationship("Dashboard",  back_populates="accesses")

    __table_args__ = (
        # Un utilisateur ne peut pas avoir deux fois accès au même dashboard
        UniqueConstraint("user_id", "dashboard_id", name="uq_dashboard_access"),
        Index("idx_dashboard_access_user",      "user_id"),
        Index("idx_dashboard_access_dashboard", "dashboard_id"),
    )