"""
models/comment.py

Modèle pour stocker les interactions (Notes/Commentaires) GitLab.
Essentiel pour les KPIs de collaboration Senior.
"""

from sqlalchemy import Column, Integer, BigInteger, String, DateTime, Text, ForeignKey, Index
from sqlalchemy.orm import relationship
from app.models.base import Base


class Comment(Base):
    __tablename__ = "comment"

    id           = Column(Integer, primary_key=True)
    gitlab_id    = Column(BigInteger, nullable=False) # ID Note GitLab (BigInt requis)
    body         = Column(Text,        nullable=True)
    created_at   = Column(DateTime(timezone=True), nullable=False)
    
    # ── Clés étrangères ──────────────────────────────────────────────────────
    developer_id = Column(
        Integer, 
        ForeignKey("developer.id", ondelete="CASCADE"), 
        nullable=False
    )
    merge_request_id = Column(
        Integer, 
        ForeignKey("merge_request.id", ondelete="CASCADE"), 
        nullable=False
    )

    # ── Relations ────────────────────────────────────────────────────────────
    developer     = relationship("Developer", back_populates="comments")
    merge_request = relationship("MergeRequest", back_populates="comments")

    # ── Index ────────────────────────────────────────────────────────────────
    __table_args__ = (
        # Unicité de la note GitLab
        Index("idx_comment_gitlab_id", "gitlab_id", unique=True),
        # Recherche rapide des commentaires d'un dev sur une MR
        Index("idx_comment_dev_mr", "developer_id", "merge_request_id"),
        # Recherche par date pour les KPIs mensuels
        Index("idx_comment_created_at", "created_at"),
    )
