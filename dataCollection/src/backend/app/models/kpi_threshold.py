"""
models/kpi_threshold.py

Seuils d'alerte configurables par KPI, par dashboard et par projet.

CORRECTIONS :

    1. RENOMMAGE : `type` → `threshold_type`
       Même raison que ExtractionLot : `type` est réservé Python/SQLAlchemy.
       ⚠️  MIGRATION : ALTER TABLE kpi_threshold RENAME COLUMN type TO threshold_type;

    2. BUG UNICITÉ avec NULL : l'index unique sur (dashboard_id, kpi_definition_id, type)
       est CASSÉ quand dashboard_id est NULL (nullable=True).
       En PostgreSQL, NULL != NULL → deux seuils globaux (dashboard_id=NULL)
       pour le même KPI seraient acceptés malgré l'index unique.
       FIX : index UNIQUE SQLAlchemy supprimé → remplacé par DDL COALESCE
       (même pattern que KpiSnapshot).

    3. AJOUT : CheckConstraint — warning_value < critical_value
       Règle métier : le seuil WARNING doit être moins sévère que CRITICAL.
       Exemple : warning=0.5, critical=0.3 pour approved_mr_rate (seuil bas = mauvais).
       ⚠️  NOTE : la direction (bas ou haut) dépend du KPI — à valider dans le service.
       Pour l'instant, on impose juste warning != critical.

Logique d'alerte :
    OK       → valeur KPI dans la plage normale
    WARNING  → warning_value dépassé
    CRITICAL → critical_value dépassé
    → Chaque dépassement crée une entrée dans Alert
"""

from sqlalchemy import Column, Integer, Float, ForeignKey, Index, Enum, CheckConstraint, DDL, event
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

    # ✅ FIX : renommé de `type` → `threshold_type`
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
    dashboard_id = Column(
        Integer,
        ForeignKey("dashboard.id", ondelete="CASCADE"),
        nullable=True,  # NULL = seuil global non rattaché à un dashboard
    )
    # NOT NULL — référence obligatoire au KPI concerné
    kpi_definition_id = Column(
        Integer,
        ForeignKey("kpi_definition.id", ondelete="RESTRICT"),
        # RESTRICT : interdit de supprimer un KpiDefinition qui a des seuils
        nullable=False,
    )
    created_by = Column(
        Integer,
        ForeignKey("app_user.id", ondelete="SET NULL"),
        nullable=True,
    )

    # ── Relations ────────────────────────────────────────────────────────────
    project        = relationship("Project",       back_populates="kpi_thresholds")
    dashboard      = relationship("Dashboard",     back_populates="kpi_thresholds")
    kpi_definition = relationship("KpiDefinition", back_populates="kpi_thresholds")
    creator        = relationship(
        "AppUser",
        back_populates="kpi_thresholds",
        foreign_keys=[created_by],
    )
    alerts = relationship(
        "Alert",
        back_populates="threshold",
        cascade="all, delete-orphan",
    )

    # ── Properties dérivées (cohérence garantie, pas de colonne DB) ──────────
    @property
    def kpi_name(self) -> str | None:
        """
        Code du KPI depuis la relation kpi_definition.
        Toujours cohérent avec kpi_definition_id.
        ⚠️  Nécessite que kpi_definition soit chargé (eager ou lazy load).
        Usage : threshold.kpi_name → "AVG_REVIEW_TIME"
        """
        return self.kpi_definition.code if self.kpi_definition is not None else None

    @property
    def kpi_label(self) -> str | None:
        """Label lisible du KPI (ex: 'Temps moyen de relecture')."""
        return self.kpi_definition.label if self.kpi_definition is not None else None

    # ── Index et contraintes ─────────────────────────────────────────────────
    __table_args__ = (
        Index("idx_kpi_threshold_project",    "project_id"),
        Index("idx_kpi_threshold_dashboard",  "dashboard_id"),
        Index("idx_kpi_threshold_definition", "kpi_definition_id"),
        Index("idx_kpi_threshold_creator",    "created_by"),
        # ✅ FIX : renommé type → threshold_type
        Index("idx_kpi_threshold_type",       "threshold_type"),

        # ✅ AJOUT : contrainte métier — warning != critical (évite config sans effet)
        CheckConstraint(
            "warning_value != critical_value",
            name="chk_threshold_values_distinct",
        ),
        # Les valeurs doivent être positives (KPIs sont toujours >= 0)
        CheckConstraint(
            "warning_value >= 0 AND critical_value >= 0",
            name="chk_threshold_values_positive",
        ),

        # ⚠️  L'index UNIQUE est créé via DDL event ci-dessous
        # Raison : dashboard_id est nullable → NULL != NULL dans PostgreSQL UNIQUE
        # Sans COALESCE, deux seuils globaux (dashboard_id=NULL) pour le même KPI
        # seraient acceptés malgré l'unicité souhaitée.
    )


# ── Index UNIQUE avec gestion du NULL sur dashboard_id ───────────────────────
# COALESCE(dashboard_id, -1) : traite NULL comme -1 pour le test d'unicité.
# -1 n'est jamais un vrai dashboard_id (IDs commencent à 1).
# Garantit : 1 seul seuil par (dashboard_ou_global, kpi, type_seuil, projet)
_unique_threshold_index = DDL("""
    CREATE UNIQUE INDEX IF NOT EXISTS idx_kpi_threshold_unique
    ON kpi_threshold (
        COALESCE(dashboard_id, -1),
        kpi_definition_id,
        threshold_type,
        project_id
    )
""")

event.listen(
    KpiThreshold.__table__,
    "after_create",
    _unique_threshold_index,
)