"""
models/developer_group.py

[SCD TYPE 2 - v2]
La table developer_group_link est transformée en Association Object complet.
Cela permet de dater chaque affectation d'équipe et de tracer les mouvements
(ex: Frontend → Mobile → Backend).

Changement architectural :
- Avant : Table() simple, 2 colonnes (developer_id, group_id)
- Après : ORM Model DeveloperGroupLink avec start_date / end_date / is_active
"""

from datetime import datetime, timezone
from sqlalchemy import Column, Integer, String, ForeignKey, Index, Boolean, Date, DateTime, func
from sqlalchemy.orm import relationship

from app.models.base import Base


class DeveloperGroupLink(Base):
    """
    [SCD TYPE 2] Table de liaison historisée Developer ↔ DeveloperGroup.
    Remplace l'ancienne Table() simple.
    Clé surrogate (id) pour permettre plusieurs intervalles par (dev, group).
    """
    __tablename__ = "developer_group_link"

    id           = Column(Integer, primary_key=True, autoincrement=True)
    developer_id = Column(Integer, ForeignKey("developer.id",       ondelete="CASCADE"), nullable=False)
    group_id     = Column(Integer, ForeignKey("developer_group.id", ondelete="CASCADE"), nullable=False)

    # ── [SCD TYPE 2] Historisation des transferts d'équipe ───────────────────
    is_active  = Column(Boolean, default=True, nullable=False,
                        comment="False = affectation clôturée")
    is_primary = Column(Boolean, default=True, nullable=False,
                        comment="True = équipe principale (pour KPIs)")
    start_date = Column(Date, nullable=True,
                        comment="Date d'entrée dans l'équipe")
    end_date   = Column(Date, nullable=True,
                        comment="Date de sortie (NULL = encore dans l'équipe)")
    assigned_at = Column(DateTime(timezone=True), server_default=func.now(), nullable=False)

    # ── Relations ────────────────────────────────────────────────────────────
    developer = relationship("Developer",      back_populates="group_links")
    group     = relationship("DeveloperGroup", back_populates="developer_links")

    # ── Index ─────────────────────────────────────────────────────────────────
    __table_args__ = (
        Index("idx_devgrouplink_developer",  "developer_id"),
        Index("idx_devgrouplink_group",      "group_id"),
        Index("idx_devgrouplink_active",     "developer_id", "is_active"),
        Index("idx_devgrouplink_dates",      "developer_id", "start_date", "end_date"),
    )


class DeveloperGroup(Base):

    __tablename__ = "developer_group"

    id          = Column(Integer, primary_key=True)
    name        = Column(String(100), nullable=False)
    description = Column(String(500), nullable=True)

    manager_id = Column(
        Integer,
        ForeignKey("app_user.id", ondelete="SET NULL"),
        nullable=True,
    )


    # ── Relations ────────────────────────────────────────────────────────────

    manager = relationship("AppUser", back_populates="developer_groups_managed",
                           foreign_keys=[manager_id])

    # Liens historisés vers les développeurs
    developer_links = relationship(
        "DeveloperGroupLink",
        back_populates="group",
        cascade="all, delete-orphan",
    )
    
    # ✅ AJOUT : Relation many-to-many avec AppUser via UserGroupAccess
    user_accesses = relationship(
        "UserGroupAccess",
        back_populates="group",
        cascade="all, delete-orphan",
    )

    @property
    def developers(self):
        """
        [SCD TYPE 2] Retourne les développeurs ACTIFS dans ce groupe.
        Rétrocompatibilité : remplace l'ancienne relation M2M directe.
        """
        return [link.developer for link in self.developer_links if link.is_active and link.developer]

    @property
    def member_count(self) -> int:
        """
        [SENIOR] Retourne le nombre de membres actuellement actifs dans le groupe.
        Supporte l'injection manuelle (via setter) pour les requêtes optimisées.
        """
        if hasattr(self, "_member_count"):
            return self._member_count
        return len([link for link in self.developer_links if link.is_active])

    @member_count.setter
    def member_count(self, value: int):
        self._member_count = value

    kpi_snapshots = relationship("KpiSnapshot", back_populates="group",
                                 cascade="all, delete-orphan")

    # ── Index ────────────────────────────────────────────────────────────────
    __table_args__ = (
        Index("idx_devgroup_manager", "manager_id"),
    )


# ── Alias de rétrocompatibilité ───────────────────────────────────────────────
# Tous les modules qui importaient :
#   from app.models.developer_group import developer_group_link
# et accédaient à developer_group_link.c.developer_id / .c.group_id
# continuent de fonctionner SANS modification.
#
# DeveloperGroupLink.__table__ expose exactement la même interface SQLAlchemy
# Table.c (columns collection) que l'ancienne Table() simple.
# ─────────────────────────────────────────────────────────────────────────────
developer_group_link = DeveloperGroupLink.__table__

