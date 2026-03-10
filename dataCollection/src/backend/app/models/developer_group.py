from sqlalchemy import Column, Integer, String, ForeignKey, DateTime, Index, func
from sqlalchemy.orm import relationship

from app.models.base import Base


class DeveloperGroup(Base):
    """
    Groupement logique de développeurs par site/équipe.
    Indispensable pour les KPIs calculés PAR SITE
    (MR Rate/site, Commit Rate/site, Temps de relecture/site).
    """
    __tablename__ = "developer_group"

    id         = Column(Integer, primary_key=True, index=True)
    name       = Column(String(100), nullable=False)
    site       = Column(String(100), nullable=False)
    project_id = Column(
        Integer,
        ForeignKey("project.id", ondelete="CASCADE"),
        nullable=False,
        index=True
    )
    created_at = Column(
        DateTime(timezone=True),
        server_default=func.now(),
        nullable=False
    )

    # Relations
    project    = relationship("Project", back_populates="developer_groups")
    developers = relationship("Developer", back_populates="group", cascade="all, delete-orphan")


Index("idx_devgroup_project_site", DeveloperGroup.project_id, DeveloperGroup.site)