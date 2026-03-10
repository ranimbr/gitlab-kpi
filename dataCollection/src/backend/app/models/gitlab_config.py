from sqlalchemy import Column, Integer, String, Boolean
from sqlalchemy.orm import relationship

from app.models.base import Base


class GitLabConfig(Base):
    """
    Configuration d'une instance GitLab.
    Permet le support multi-tenant (plusieurs domaines GitLab).
    Le token est stocké chiffré en base (chiffrement applicatif via security.py).
    """
    __tablename__ = "gitlab_config"

    id          = Column(Integer, primary_key=True, index=True)
    name        = Column(String(100), nullable=False)                      # ex: "GitLab Entreprise", "GitLab Client X"
    domain      = Column(String(255), unique=True, nullable=False)         # ex: "https://gitlab.mycompany.com"
    token       = Column(String(512), nullable=False)                      # token chiffré (AES via security.py)
    is_active   = Column(Boolean, default=True, nullable=False)
    description = Column(String(500), nullable=True)

    # Relations
    projects = relationship(
        "Project",
        back_populates="gitlab_config",
        cascade="all, delete-orphan"
    )