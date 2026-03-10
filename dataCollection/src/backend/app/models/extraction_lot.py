from sqlalchemy import Column, Integer, String, ForeignKey, Enum, Index, DateTime, Text
from sqlalchemy.orm import relationship
from sqlalchemy.sql import func
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

    id             = Column(Integer, primary_key=True, index=True)
    type           = Column(Enum(ExtractionTypeEnum), nullable=False)
    status         = Column(Enum(ExtractionStatusEnum),
                            default=ExtractionStatusEnum.pending, nullable=False)
    generated_file = Column(String(500), nullable=True)
    md5sum         = Column(String(64),  nullable=True)
    error_message  = Column(Text, nullable=True)

    created_at = Column(
        DateTime(timezone=True),
        server_default=func.now(),
        nullable=False,
        index=True,
    )
    completed_at = Column(
        DateTime(timezone=True),
        nullable=True,
    )

    period_id = Column(
        Integer,
        ForeignKey("period.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    project_id = Column(
        Integer,
        ForeignKey("project.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    triggered_by = Column(
        Integer,
        ForeignKey("app_user.id", ondelete="SET NULL"),
        nullable=True,
        index=True,
    )

    # Relations
    period            = relationship("Period",       back_populates="extraction_lots")
    project           = relationship("Project",      back_populates="extraction_lots")
    triggered_by_user = relationship(
        "AppUser",
        back_populates="extraction_lots",
        foreign_keys=[triggered_by],
    )
    commits        = relationship(
        "Commit",
        back_populates="extraction_lot",
        cascade="all, delete-orphan",
    )
    merge_requests = relationship(
        "MergeRequest",
        back_populates="extraction_lot",
        cascade="all, delete-orphan",
    )
    # ✅ FIX — manquant, référencé par KpiSnapshot.back_populates="extraction_lot"
    kpi_snapshots  = relationship(
        "KpiSnapshot",
        back_populates="extraction_lot",
        cascade="all, delete-orphan",
    )


Index("idx_lot_period_project", ExtractionLot.period_id, ExtractionLot.project_id)
Index("idx_lot_type_status",    ExtractionLot.type,      ExtractionLot.status)
