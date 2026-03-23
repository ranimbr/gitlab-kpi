"""
models/kpi_definition.py — version corrigée (index redondants supprimés)
"""
from sqlalchemy import Column, Integer, String, Boolean, Text, Enum, Index
from sqlalchemy.orm import relationship
import enum

from app.models.base import Base


class AggregationLevelEnum(str, enum.Enum):
    site      = "site"
    project   = "project"
    developer = "developer"
    group     = "group"


class KpiDefinition(Base):
    """
    Catalogue des KPIs disponibles dans le système.
    Les 6 KPIs actifs sont seedés au démarrage via init_db.py.
    
    Codes KPI :
        MR_RATE_SITE       — #1 : NB MRs non-draft / NB développeurs
        APPROVED_MR_RATE   — #3 : NB MRs approuvées / NB MRs créées
        MERGED_MR_RATE     — #4 : NB MRs mergées / NB MRs approuvées
        COMMIT_RATE_SITE   — #5 : NB commits / NB développeurs
        NB_COMMITS_PROJECT — #6 : somme commits du projet
        AVG_REVIEW_TIME    — #7 : Σ(approved_at - created_at) / NB approuvées
    """

    __tablename__ = "kpi_definition"

    id                  = Column(Integer, primary_key=True)
    code                = Column(String(100), unique=True, nullable=False)
    label               = Column(String(255), nullable=False)
    formula_description = Column(Text, nullable=True)
    unit                = Column(String(50), nullable=True)   # "ratio", "hours", "count"
    aggregation_level   = Column(
        Enum(AggregationLevelEnum),
        default=AggregationLevelEnum.site,
        nullable=False,
    )
    is_active = Column(Boolean, default=True, nullable=False)

    kpi_thresholds = relationship("KpiThreshold", back_populates="kpi_definition")

    # code est UNIQUE → index auto. Pas de doublon nécessaire.
    __table_args__ = (
        Index("idx_kpi_def_active", "is_active"),
        Index("idx_kpi_def_level",  "aggregation_level"),
    )