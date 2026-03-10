from sqlalchemy import Column, Integer, String, ForeignKey, Boolean, Index
from sqlalchemy.orm import relationship

from app.models.base import Base


class SubProject(Base):
    """
    Sous-projet GitLab pour une granularité fine des KPIs.
    Permet de décomposer un Project en composants logiciels
    distincts (ex: frontend, backend, mobile) afin d'identifier
    les composants avec le taux de bugs/commits le plus élevé.
    """
    __tablename__ = "sub_project"

    id                = Column(Integer, primary_key=True, index=True)
    gitlab_project_id = Column(Integer, unique=True, nullable=False, index=True)
    name              = Column(String(255), nullable=False)
    path              = Column(String(255), nullable=False)
    description       = Column(String, nullable=True)
    archived          = Column(Boolean, default=False, nullable=False)

    # Lien vers le projet parent
    project_id = Column(
        Integer,
        ForeignKey("project.id", ondelete="CASCADE"),
        nullable=False,
        index=True
    )

    # Relations
    project = relationship("Project", back_populates="sub_projects")


Index("idx_subproject_parent", SubProject.project_id)