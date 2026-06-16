"""
models/gitlab_config.py


"""

from sqlalchemy import Column, Integer, String, Boolean, ForeignKey, Index
from sqlalchemy.orm import relationship

from app.models.base import Base


class GitLabConfig(Base):

    __tablename__ = "gitlab_config"

    id          = Column(Integer, primary_key=True)
    name        = Column(String(100), nullable=False)
    domain      = Column(String(255), nullable=False, unique=True)
    # Token chiffré (AES-256-GCM via services/security.py)
    # NE JAMAIS logger ce champ ni l'inclure dans les réponses API
    token       = Column(String(512), nullable=False)
    is_active   = Column(Boolean, default=True, nullable=False)
    description = Column(String(500), nullable=True)

    #  AJOUT : FK vers Site — manquant dans la version originale
    # Optionnel (nullable=True) : une config GitLab peut être globale (non rattachée à un site)
    site_id = Column(
        Integer,
        ForeignKey("site.id", ondelete="SET NULL"),
        nullable=True,
    )

    # ── Relations ────────────────────────────────────────────────────────────
    # ✅ AJOUT : relation vers Site
    site     = relationship("Site",    back_populates="gitlab_configs")
    projects = relationship(
        "Project",
        back_populates="gitlab_config",
        cascade="all, delete-orphan",
    )

    # ── Index ────────────────────────────────────────────────────────────────
    __table_args__ = (
        # domain est UNIQUE → index auto, pas besoin d'Index() supplémentaire
        Index("idx_gitlab_config_site",   "site_id"),
        Index("idx_gitlab_config_active", "is_active"),
    )