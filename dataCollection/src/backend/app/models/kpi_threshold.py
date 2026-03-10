from sqlalchemy import Column, Integer, String, Float, ForeignKey, Index, DateTime
from sqlalchemy.orm import relationship
from sqlalchemy.sql import func

from app.models.base import Base


class KpiThreshold(Base):
    """
    Seuils d'alerte configurables par KPI et par projet.

    Le dashboard affiche :
    - 🟢 OK       → valeur normale
    - 🟡 WARNING  → warning_value dépassé
    - 🔴 CRITICAL → critical_value dépassé

    Exemples :
    - kpi_name="avg_review_time_hours", warning=48.0, critical=72.0
    - kpi_name="approved_mr_rate",      warning=0.5,  critical=0.3
    - kpi_name="mr_rate_per_site",      warning=2.0,  critical=1.0
    """

    __tablename__ = "kpi_threshold"

    id             = Column(Integer, primary_key=True, index=True)
    kpi_name       = Column(String(100), nullable=False)
    warning_value  = Column(Float, nullable=False)
    critical_value = Column(Float, nullable=False)

    # [FIX] created_at manquant dans la version précédente
    created_at = Column(
        DateTime(timezone=True),
        server_default=func.now(),
        nullable=False,
    )

    project_id = Column(
        Integer,
        ForeignKey("project.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    created_by = Column(
        Integer,
        ForeignKey("app_user.id", ondelete="SET NULL"),
        nullable=True,
        index=True,
    )

    # Relations
    project = relationship("Project", back_populates="kpi_thresholds")
    creator = relationship(
        "AppUser",
        back_populates="kpi_thresholds",
        foreign_keys=[created_by],
    )

    __table_args__ = (
        # Un seul seuil par KPI par projet
        Index(
            "idx_kpi_threshold_project_kpi",
            "project_id",
            "kpi_name",
            unique=True,
        ),
    )


# =============================================================================
# IMPORTANT — back_populates à ajouter dans les modèles liés
# =============================================================================
#
# Dans models/project.py, ajouter dans la classe Project :
#
#   kpi_thresholds = relationship(
#       "KpiThreshold",
#       back_populates="project",
#       cascade="all, delete-orphan",
#   )
#
# Dans models/app_user.py, ajouter dans la classe AppUser :
#
#   kpi_thresholds = relationship(
#       "KpiThreshold",
#       back_populates="creator",
#       foreign_keys="KpiThreshold.created_by",
#   )
#
# =============================================================================
