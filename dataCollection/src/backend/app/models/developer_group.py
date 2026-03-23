"""
models/developer_group.py — version corrigée
"""
from sqlalchemy import Column, Integer, String, ForeignKey, Index
from sqlalchemy.orm import relationship

from app.models.base import Base


class DeveloperGroup(Base):
    """
    Groupement logique de développeurs par site / équipe.
    KPIs calculés PAR SITE via ce groupement : #1, #5, #7.
    manager_id : restreint la visibilité des KPIs au responsable du groupe.
    """

    __tablename__ = "developer_group"

    id   = Column(Integer, primary_key=True)
    name = Column(String(100), nullable=False)

    project_id = Column(Integer, ForeignKey("project.id",  ondelete="CASCADE"),  nullable=False)
    site_id    = Column(Integer, ForeignKey("site.id",     ondelete="SET NULL"), nullable=True)
    manager_id = Column(Integer, ForeignKey("app_user.id", ondelete="SET NULL"), nullable=True)

    project    = relationship("Project",   back_populates="developer_groups")
    site       = relationship("Site",      back_populates="developer_groups")
    manager    = relationship("AppUser",   back_populates="developer_groups_managed", foreign_keys=[manager_id])
    developers = relationship("Developer", back_populates="group", cascade="all, delete-orphan")
    kpi_snapshots = relationship("KpiSnapshot", back_populates="group", cascade="all, delete-orphan")

    __table_args__ = (
        Index("idx_devgroup_project_site", "project_id", "site_id"),
        Index("idx_devgroup_manager",      "manager_id"),
    )