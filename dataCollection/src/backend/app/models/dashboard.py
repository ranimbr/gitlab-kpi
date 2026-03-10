from sqlalchemy import Column, Integer, String, ForeignKey, Index
from sqlalchemy.orm import relationship

from app.models.base import Base


class Dashboard(Base):
    """
    Tableau de bord associé à un projet.
    L'accès est contrôlé via DashboardAccess (jonction AppUser <-> Dashboard).
    view_group permet un accès global par groupe en complément des accès individuels.
    """
    __tablename__ = "dashboard"

    id         = Column(Integer, primary_key=True, index=True)
    name       = Column(String(100), nullable=False)
    view_group = Column(String(100), nullable=True)
    project_id = Column(
        Integer,
        ForeignKey("project.id", ondelete="CASCADE"),
        nullable=False,
        index=True
    )

    # Relations
    project  = relationship("Project",         back_populates="dashboards")
    accesses = relationship("DashboardAccess", back_populates="dashboard", cascade="all, delete-orphan")


Index("idx_dashboard_project", Dashboard.project_id)
Index("idx_dashboard_group",   Dashboard.view_group)