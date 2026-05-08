"""
models/extraction_lot.py


"""

from sqlalchemy import (
    Column, Integer, String, ForeignKey, Enum,
    Index, DateTime, Text, CheckConstraint, text
)
from sqlalchemy.dialects.postgresql import JSONB
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
    
    # ── [PHASE 3] Métriques de Performance & Audit ─────────────────────────────
    duration_ms      = Column(Integer,     default=0,    nullable=False)
    items_count      = Column(Integer,     default=0,    nullable=False, comment="Somme Commits + MRs")
    api_calls_count  = Column(Integer,     default=0,    nullable=False)
    retry_count      = Column(Integer,     default=0,    nullable=False)
    metadata_summary = Column(JSONB,       nullable=True, comment="JSON des détails techniques")

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


# ── [ENTERPRISE READY] Automatic Items Count Sync ───────────────────────────
from sqlalchemy import event, Text

def refresh_lot_items_count(connection, lot_id):
    """
    Recalcule le items_count (Commits + MRs) de manière atomique en SQL.
    Solution robuste évitant les race conditions et les décalages applicatifs.
    """
    if not lot_id:
        return
        
    # On utilise du SQL pur pour une performance maximale et éviter de charger les objets
    query = """
        UPDATE extraction_lot 
        SET items_count = (
            SELECT 
                (SELECT COUNT(*) FROM git_commit WHERE extraction_lot_id = :lot_id) +
                (SELECT COUNT(*) FROM merge_request WHERE extraction_lot_id = :lot_id)
        )
        WHERE id = :lot_id
    """
    connection.execute(text(query), {"lot_id": lot_id})

# On importe les modèles ici pour éviter les imports circulaires au démarrage
from app.models.commit import Commit
from app.models.merge_request import MergeRequest

@event.listens_for(Commit, "after_insert")
@event.listens_for(Commit, "after_update")
@event.listens_for(Commit, "after_delete")
@event.listens_for(MergeRequest, "after_insert")
@event.listens_for(MergeRequest, "after_update")
@event.listens_for(MergeRequest, "after_delete")
def on_item_change(mapper, connection, target):
    """Déclenché après chaque changement d'item rattaché à un lot."""
    from sqlalchemy import inspect
    
    # 1. Rafraîchir le lot actuel
    if target.extraction_lot_id:
        refresh_lot_items_count(connection, target.extraction_lot_id)
    
    # 2. [SENIOR FIX] Gérer le changement de lot (cas du 'Reclaiming')
    # Si c'est un update, on vérifie si l'ID du lot a changé pour rafraîchir l'ancien lot.
    try:
        hist = inspect(target).attrs.extraction_lot_id.history
        if hist.has_changes() and hist.deleted:
            old_lot_id = hist.deleted[0]
            if old_lot_id:
                refresh_lot_items_count(connection, old_lot_id)
    except Exception:
        # En cas d'insert ou delete simple, l'historique peut ne pas être accessible ainsi
        pass