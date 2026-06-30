"""
models/kpi_threshold.py

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
    # DISABLED: Dashboard functionality removed
    # dashboard_id = Column(
    #     Integer,
    #     ForeignKey("dashboard.id", ondelete="CASCADE"),
    #     nullable=True,
    # )
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
    # DISABLED: Dashboard functionality removed
    # dashboard      = relationship("Dashboard",     back_populates="kpi_thresholds")
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
        # DISABLED: Dashboard functionality removed
        # Index("idx_kpi_threshold_dashboard",  "dashboard_id"),
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
        COALESCE(site_id, -1),
        kpi_definition_id,
        threshold_type,
        project_id
    )
""")

event.listen(KpiThreshold.__table__, "after_create", _unique_threshold_index)