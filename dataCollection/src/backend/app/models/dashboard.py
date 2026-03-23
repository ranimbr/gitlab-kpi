"""
models/dashboard.py — version corrigée (index redondants supprimés)
"""
from sqlalchemy import Column, Integer, String, Boolean, ForeignKey, Index
from sqlalchemy.orm import relationship

from app.models.base import Base


class Dashboard(Base):
    """
    Tableau de bord associé à un projet et un site.

    Accès contrôlé via AppUser.dashboard_access (liste d'IDs PostgreSQL ARRAY)
    ou is_public=True pour les dashboards publics.
    """

    __tablename__ = "dashboard"

    id          = Column(Integer, primary_key=True)
    name        = Column(String(100), nullable=False)
    description = Column(String(500), nullable=True)
    is_public   = Column(Boolean, default=False, nullable=False)

    project_id = Column(Integer, ForeignKey("project.id",  ondelete="CASCADE"),  nullable=False)
    site_id    = Column(Integer, ForeignKey("site.id",     ondelete="SET NULL"), nullable=True)
    created_by = Column(Integer, ForeignKey("app_user.id", ondelete="SET NULL"), nullable=True)

    project        = relationship("Project",  back_populates="dashboards")
    site           = relationship("Site",     back_populates="dashboards")
    creator        = relationship("AppUser",  back_populates="dashboards_created", foreign_keys=[created_by])
    period_filters = relationship("PeriodFilter", back_populates="dashboard", cascade="all, delete-orphan")
    kpi_thresholds = relationship("KpiThreshold", back_populates="dashboard", cascade="all, delete-orphan")

    __table_args__ = (
        Index("idx_dashboard_project", "project_id"),
        Index("idx_dashboard_site",    "site_id"),
        Index("idx_dashboard_creator", "created_by"),
        Index("idx_dashboard_public",  "is_public"),
    )