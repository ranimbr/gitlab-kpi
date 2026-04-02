"""
models/kpi_threshold.py

Seuils d'alerte configurables par KPI, par site et par projet.

CORRECTIONS MAJEURES (remarques encadrant) :
─────────────────────────────────────────────
1. AJOUT de site_id (FK nullable) :
   Un seuil peut être défini au niveau d'un site spécifique.
   NULL = seuil global applicable à tous les sites.
   Permet de configurer des seuils différents par site
   (ex: site Tunis → warning_value=0.6, site Paris → warning_value=0.7).

2. Relation vers Site ajoutée.

CORRECTIONS TECHNIQUES (conservées) :
──────────────────────────────────────
3. RENOMMAGE : type → threshold_type (réservé Python/SQLAlchemy).
4. Index UNIQUE DDL avec COALESCE pour gérer les NULLs.
5. CheckConstraints sur les valeurs des seuils.
"""

from sqlalchemy import (
    Column, Integer, Float, ForeignKey, Index,
    Enum, CheckConstraint, DDL, event,
)
from sqlalchemy.orm import relationship
import enum

from app.models.base import Base


class ThresholdTypeEnum(str, enum.Enum):
    REALTIME = "REALTIME"
    MONTHLY  = "MONTHLY"


class KpiThreshold(Base):

    __tablename__ = "kpi_threshold"

    id             = Column(Integer, primary_key=True)
    warning_value  = Column(Float, nullable=False)
    critical_value = Column(Float, nullable=False)

    threshold_type = Column(
        Enum(ThresholdTypeEnum),
        default=ThresholdTypeEnum.MONTHLY,
        nullable=False,
        comment="REALTIME = seuil temps réel | MONTHLY = seuil clôture mensuelle",
    )

    project_id = Column(
        Integer,
        ForeignKey("project.id", ondelete="CASCADE"),
        nullable=False,
    )
    # ✅ AJOUT : seuil configurable par site
    # NULL = seuil global (applicable à tous les sites du projet)
    site_id = Column(
        Integer,
        ForeignKey("site.id", ondelete="CASCADE"),
        nullable=True,
    )
    dashboard_id = Column(
        Integer,
        ForeignKey("dashboard.id", ondelete="CASCADE"),
        nullable=True,
    )
    kpi_definition_id = Column(
        Integer,
        ForeignKey("kpi_definition.id", ondelete="RESTRICT"),
        nullable=False,
    )
    created_by = Column(
        Integer,
        ForeignKey("app_user.id", ondelete="SET NULL"),
        nullable=True,
    )

    # ── Relations ────────────────────────────────────────────────────────────
    project        = relationship("Project",       back_populates="kpi_thresholds")
    # ✅ AJOUT
    site           = relationship("Site",          back_populates="kpi_thresholds")
    dashboard      = relationship("Dashboard",     back_populates="kpi_thresholds")
    kpi_definition = relationship("KpiDefinition", back_populates="kpi_thresholds")
    creator        = relationship("AppUser",       back_populates="kpi_thresholds",
                                   foreign_keys=[created_by])
    alerts         = relationship("Alert",         back_populates="threshold",
                                   cascade="all, delete-orphan")

    # ── Properties dérivées ──────────────────────────────────────────────────
    @property
    def kpi_name(self) -> str | None:
        return self.kpi_definition.code if self.kpi_definition else None

    @property
    def kpi_label(self) -> str | None:
        return self.kpi_definition.label if self.kpi_definition else None

    # ── Index et contraintes ─────────────────────────────────────────────────
    __table_args__ = (
        Index("idx_kpi_threshold_project",    "project_id"),
        Index("idx_kpi_threshold_site",       "site_id"),
        Index("idx_kpi_threshold_dashboard",  "dashboard_id"),
        Index("idx_kpi_threshold_definition", "kpi_definition_id"),
        Index("idx_kpi_threshold_creator",    "created_by"),
        Index("idx_kpi_threshold_type",       "threshold_type"),

        CheckConstraint("warning_value  != critical_value",          name="chk_threshold_values_distinct"),
        CheckConstraint("warning_value  >= 0 AND critical_value >= 0", name="chk_threshold_values_positive"),
    )


# ── Index UNIQUE avec gestion des NULLs ──────────────────────────────────────
_unique_threshold_index = DDL("""
    CREATE UNIQUE INDEX IF NOT EXISTS idx_kpi_threshold_unique
    ON kpi_threshold (
        COALESCE(dashboard_id, -1),
        COALESCE(site_id, -1),
        kpi_definition_id,
        threshold_type,
        project_id
    )
""")

event.listen(KpiThreshold.__table__, "after_create", _unique_threshold_index)