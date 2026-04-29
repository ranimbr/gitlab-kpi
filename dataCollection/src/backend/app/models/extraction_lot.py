"""
models/extraction_lot.py

Lot d'extraction des données GitLab.

Représente une session d'extraction pour un projet sur une période.
Chaque extraction crée des Commit et MergeRequest associés à ce lot.

CORRECTIONS :

    1. RENOMMAGE CRITIQUE : `type` → `extraction_type`
       Raison : `type` est un attribut réservé en Python (builtin) et utilisé
       en interne par SQLAlchemy pour le polymorphisme (mapper inheritance).
       Utiliser `type` comme nom de colonne crée des comportements silencieusement
       incorrects dans certaines versions de SQLAlchemy (ex: le mapper écrase
       la valeur, ou les queries de type polymorphique se comportent mal).
       FIX : renommer en `extraction_type` — sans ambiguïté, plus explicite.

       ⚠️  MIGRATION REQUISE :
           ALTER TABLE extraction_lot RENAME COLUMN type TO extraction_type;
           -- Mettre à jour l'enum si nécessaire selon le SGBD

    2. AJOUT : Index sur completed_at
       Pour les requêtes de monitoring : "lots terminés entre X et Y"
       et pour le cleanup_service qui purge les vieux lots.

    3. AJOUT : CheckConstraint — completed_at non NULL seulement si status=completed/failed
       Règle métier : un lot pending ou running ne peut pas avoir de completed_at.

Types d'extraction :
    REALTIME  → extraction à la demande, période open autorisée
    MONTHLY   → extraction de clôture mensuelle, génère le snapshot définitif

Statuts :
    pending   → en attente de traitement par le scheduler
    running   → extraction en cours
    completed → terminée avec succès, generated_file disponible
    failed    → erreur, voir error_message
"""

from sqlalchemy import (
    Column, Integer, String, ForeignKey, Enum,
    Index, DateTime, Text, CheckConstraint,
)
from sqlalchemy.orm import relationship
import enum

from app.models.base import Base


class ExtractionTypeEnum(str, enum.Enum):
    REALTIME = "REALTIME"
    MONTHLY  = "MONTHLY"


class ExtractionStatusEnum(str, enum.Enum):
    pending   = "pending"
    running   = "running"
    completed = "completed"
    failed    = "failed"


class ExtractionLot(Base):

    __tablename__ = "extraction_lot"

    id = Column(Integer, primary_key=True)

    # ✅ FIX : renommé de `type` → `extraction_type`
    # `type` est réservé par Python/SQLAlchemy — source de bugs silencieux
    extraction_type = Column(
        Enum(ExtractionTypeEnum),
        nullable=False,
        comment="REALTIME = à la demande | MONTHLY = clôture mensuelle",
    )
    status = Column(
        Enum(ExtractionStatusEnum),
        default=ExtractionStatusEnum.pending,
        nullable=False,
    )
    # Chemin vers le fichier généré (export JSON/CSV de l'extraction)
    generated_file = Column(String(500), nullable=True)
    # MD5 du fichier généré pour vérification d'intégrité
    md5sum         = Column(String(64),  nullable=True)
    error_message  = Column(Text,        nullable=True)
    # NULL tant que le lot est pending ou running
    completed_at   = Column(DateTime(timezone=True), nullable=True)
    
    # ── [PHASE 2] Observabilité Granulaire ────────────────────────────────────
    step_progress  = Column(Integer,     default=0,  nullable=False)
    current_action = Column(String(255), nullable=True)

    period_id = Column(
        Integer,
        ForeignKey("period.id", ondelete="CASCADE"),
        nullable=False,
    )
    project_id = Column(
        Integer,
        ForeignKey("project.id", ondelete="CASCADE"),
        nullable=True,
    )
    developer_id = Column(
        Integer,
        ForeignKey("developer.id", ondelete="SET NULL"),
        nullable=True,
    )
    gitlab_config_id = Column(
        Integer,
        ForeignKey("gitlab_config.id", ondelete="SET NULL"),
        nullable=True,
    )
    triggered_by = Column(
        Integer,
        ForeignKey("app_user.id", ondelete="SET NULL"),
        nullable=True,  # NULL = déclenché par le scheduler (automatique)
    )

    # ── Relations ────────────────────────────────────────────────────────────
    period            = relationship("Period",  back_populates="extraction_lots")
    project           = relationship("Project", back_populates="extraction_lots")
    triggered_by_user = relationship(
        "AppUser",
        back_populates="extraction_lots",
        foreign_keys=[triggered_by],
    )
    developer = relationship("Developer", back_populates="extraction_lots")
    gitlab_config = relationship("GitLabConfig")
    commits = relationship(
        "Commit",
        back_populates="extraction_lot",
        cascade="all, delete-orphan",
    )
    merge_requests = relationship(
        "MergeRequest",
        back_populates="extraction_lot",
        cascade="all, delete-orphan",
    )
    kpi_snapshots = relationship(
        "KpiSnapshot",
        back_populates="extraction_lot",
        cascade="all, delete-orphan",
    )

    @property
    def commit_count(self) -> int:
        return len(self.commits)

    @property
    def mr_count(self) -> int:
        return len(self.merge_requests)

    # ── Index et contraintes ─────────────────────────────────────────────────
    __table_args__ = (
        # Requête la plus fréquente : "dernier lot pour ce projet/période"
        Index("idx_lot_period_project",   "period_id", "project_id"),
        # ✅ FIX : renommé type → extraction_type dans l'index
        # Monitoring : tous les lots en cours ou en attente
        Index("idx_lot_type_status",      "extraction_type", "status"),
        # Audit : extractions déclenchées par un utilisateur donné
        Index("idx_lot_triggered_by",     "triggered_by"),
        # ✅ AJOUT : monitoring temporel et cleanup des vieux lots
        Index("idx_lot_completed_at",     "completed_at"),
        # Index composite pour le scheduler : lots pending d'un projet
        Index("idx_lot_project_status",   "project_id", "status"),
        # ✅ AJOUT : Index pour l'extraction par développeur
        Index("idx_lot_developer_period",  "developer_id", "period_id"),
        # ✅ AJOUT : Index pour la config GitLab
        Index("idx_lot_gitlab_config",     "gitlab_config_id"),

        # ✅ AJOUT : contrainte métier
        # completed_at ne peut être renseigné que si le lot est terminé ou en erreur
        CheckConstraint(
            "(completed_at IS NULL) OR (status IN ('completed', 'failed'))",
            name="chk_lot_completed_at_status",
        ),
        # error_message obligatoire si status=failed
        CheckConstraint(
            "(status != 'failed') OR (error_message IS NOT NULL)",
            name="chk_lot_failed_has_message",
        ),
    )