"""
models/developer_group.py

Groupement logique de développeurs par équipe / site.

CORRECTIONS MAJEURES (remarques encadrant) :
─────────────────────────────────────────────
1. SUPPRESSION de project_id comme FK directe.
   Dans le nouveau modèle, un groupe appartient à un Site (pas à 1 projet).
   Les développeurs d'un groupe peuvent travailler sur plusieurs projets
   via DeveloperProject.
   → Un groupe = une équipe fonctionnelle dans un site (ex: "Backend Tunis").

2. CONSERVATION de site_id → un groupe reste rattaché à un site.
   C'est cohérent avec les KPIs par site (#1, #5, #7).

3. AJOUT de description → utile pour l'interface d'administration.

Usage KPI :
    KpiSnapshot peut être agrégé au niveau d'un groupe (group_id renseigné).
    Cela permet de comparer les performances entre groupes d'un même site.

    Exemple de groupes :
        "Backend Tunis"   (site_id=1)
        "Frontend Tunis"  (site_id=1)
        "DevOps Paris"    (site_id=2)
        "Backend Paris"   (site_id=2)
"""

from sqlalchemy import Column, Integer, String, ForeignKey, Index, Table
from sqlalchemy.orm import relationship

from app.models.base import Base


# Table d'association N-to-N entre DeveloperGroup et Site
developer_group_site_table = Table(
    "developer_group_site",
    Base.metadata,
    Column("group_id", Integer, ForeignKey("developer_group.id", ondelete="CASCADE"), primary_key=True),
    Column("site_id",  Integer, ForeignKey("site.id", ondelete="CASCADE"), primary_key=True)
)

class DeveloperGroup(Base):

    __tablename__ = "developer_group"

    id   = Column(Integer, primary_key=True)
    name = Column(String(100), nullable=False)
    # ✅ AJOUT : description optionnelle du groupe
    description = Column(String(500), nullable=True)

    # manager_id : responsable du groupe (team_lead dans AppUser)
    # Restreint la visibilité des KPIs au responsable de son groupe
    manager_id = Column(
        Integer,
        ForeignKey("app_user.id", ondelete="SET NULL"),
        nullable=True,
    )

    # ── Relations ────────────────────────────────────────────────────────────
    # N-to-N avec Site via developer_group_site_table
    sites = relationship("Site", secondary=developer_group_site_table, back_populates="developer_groups")
    manager    = relationship(
        "AppUser",
        back_populates="developer_groups_managed",
        foreign_keys=[manager_id],
    )
    developers    = relationship("Developer",   back_populates="group")
    kpi_snapshots = relationship("KpiSnapshot", back_populates="group",
                                  cascade="all, delete-orphan")

    # ── Index ────────────────────────────────────────────────────────────────
    __table_args__ = (
        Index("idx_devgroup_manager", "manager_id"),
    )