"""
models/kpi_snapshot.py

Snapshot des KPIs calculés pour un projet, une période et un site/groupe/développeur.

Les 6 KPIs actifs (KPI #2 tickets ignoré sur instruction de l'encadrant) :
    KPI #1 : mr_rate_per_site       = NB MRs non-draft / NB développeurs du site
    KPI #3 : approved_mr_rate       = NB MRs approuvées / NB MRs créées non-draft
    KPI #4 : merged_mr_rate         = NB MRs mergées / NB MRs approuvées
    KPI #5 : commit_rate_per_site   = NB commits / NB développeurs du site
    KPI #6 : nb_commits_per_project = somme commits du projet sur la période
    KPI #7 : avg_review_time_hours  = Σ(approved_at - created_at) / NB MRs approuvées

NIVEAUX D'AGRÉGATION (via les FKs nullables) :
    site_id=X,  group_id=NULL, developer_id=NULL → snapshot par site
    site_id=X,  group_id=Y,    developer_id=NULL → snapshot par groupe
    site_id=X,  group_id=Y,    developer_id=Z    → snapshot individuel (dev)
    site_id=NULL, group_id=NULL, developer_id=NULL → snapshot projet global

CORRECTIONS :

    1. SUPPRESSION de kpi_definition_id (incohérence architecturale) :
       Design dénormalisé = tous les KPIs dans 1 ligne → FK vers 1 seule KpiDef fausse.
       Les alertes trouvent leur KPI via : Alert → KpiThreshold → KpiDefinition.

    2. FIX CRITIQUE — Unicité avec colonnes NULLables via DDL COALESCE :
       En PostgreSQL, NULL != NULL dans UNIQUE constraint.
       COALESCE(nullable_col, -1) traite NULL comme sentinelle pour l'unicité.

    3. SUPPRESSION des index=True redondants sur les FKs.

    4. AJOUT : delta_approved_mr_rate et delta_merged_mr_rate manquants.
       La version originale avait seulement 3 deltas sur 6 KPIs.
       → Tous les KPIs calculés ont maintenant leur delta pour les trend indicators
         du dashboard (flèche verte ↑ / rouge ↓ à côté de chaque KPI).
"""

from sqlalchemy import (
    Column, Integer, Float, Date, ForeignKey,
    Index, CheckConstraint, DDL, event,
)
from sqlalchemy.orm import relationship

from app.models.base import Base


class KpiSnapshot(Base):

    __tablename__ = "kpi_snapshot"

    id            = Column(Integer, primary_key=True)
    # Date de calcul du snapshot (premier jour du mois pour les snapshots mensuels)
    snapshot_date = Column(Date, nullable=False)

    # ── Compteurs bruts (inputs des formules KPI) ────────────────────────────
    total_commits      = Column(Integer, default=0, nullable=False)
    total_mrs_created  = Column(Integer, default=0, nullable=False)   # non-draft uniquement
    total_mrs_approved = Column(Integer, default=0, nullable=False)
    total_mrs_merged   = Column(Integer, default=0, nullable=False)
    # Développeurs validés (is_validated=True) et non-bots (is_bot=False) du périmètre
    nb_developers      = Column(Integer, default=0, nullable=False)
    # Somme brute des review_time_hours des MRs approuvées (input pour KPI #7)
    review_time_hours  = Column(Float,   default=0.0, nullable=False)

    # ── KPI #1 : MR Rate par site ────────────────────────────────────────────
    # Formule : total_mrs_created / nb_developers
    # Apport : comparaison avec vélocité → visibilité sur complexité des tickets
    mr_rate_per_site      = Column(Float, default=0.0, nullable=False)

    # ── KPI #3 : Approved MR Rate ────────────────────────────────────────────
    # Formule : total_mrs_approved / total_mrs_created
    # Apport : qualité du code + identification des revues bloquées
    approved_mr_rate      = Column(Float, default=0.0, nullable=False)

    # ── KPI #4 : Merged MR Rate ──────────────────────────────────────────────
    # Formule : total_mrs_merged / total_mrs_approved
    # Apport : contribution de l'équipe aux livraisons
    merged_mr_rate        = Column(Float, default=0.0, nullable=False)

    # ── KPI #5 : Commit Rate par site ────────────────────────────────────────
    # Formule : total_commits / nb_developers
    # Apport : repérer les MRs complexes nécessitant une division en sous-tâches
    commit_rate_per_site  = Column(Float, default=0.0, nullable=False)

    # ── KPI #6 : NB commits par projet ───────────────────────────────────────
    # Formule : somme de tous les commits du projet sur la période
    # Apport : identifier les composants avec le plus haut taux de bugs
    nb_commits_per_project = Column(Integer, default=0, nullable=False)

    # ── KPI #7 : Temps moyen de relecture ────────────────────────────────────
    # Formule : review_time_hours (somme) / total_mrs_approved
    # Apport : temps réel de revue de code
    avg_review_time_hours  = Column(Float, default=0.0, nullable=False)

    # ── Deltas vs snapshot précédent (trend indicators dashboard) ────────────
    # Positif = amélioration par rapport au mois précédent
    # Négatif = régression
    # NULL = pas de snapshot précédent disponible (premier calcul du mois)
    # Affiché sur le dashboard : ↑ +12% (vert) ou ↓ -8% (rouge)
    delta_mr_rate          = Column(Float, nullable=True)
    # ✅ AJOUT : delta manquant pour KPI #3
    delta_approved_mr_rate = Column(Float, nullable=True)
    # ✅ AJOUT : delta manquant pour KPI #4
    delta_merged_mr_rate   = Column(Float, nullable=True)
    delta_commit_rate      = Column(Float, nullable=True)
    # ✅ AJOUT : delta manquant pour KPI #6
    delta_nb_commits       = Column(Float, nullable=True)
    delta_avg_review_time  = Column(Float, nullable=True)

    # ── Clés étrangères ──────────────────────────────────────────────────────
    project_id = Column(
        Integer,
        ForeignKey("project.id", ondelete="CASCADE"),
        nullable=False,
    )
    period_id = Column(
        Integer,
        ForeignKey("period.id", ondelete="CASCADE"),
        nullable=False,
    )
    lot_id = Column(
        Integer,
        ForeignKey("extraction_lot.id", ondelete="SET NULL"),
        nullable=True,
    )
    site_id = Column(
        Integer,
        ForeignKey("site.id", ondelete="SET NULL"),
        nullable=True,   # NULL = snapshot niveau projet global (pas de filtre site)
    )
    group_id = Column(
        Integer,
        ForeignKey("developer_group.id", ondelete="SET NULL"),
        nullable=True,   # NULL = snapshot tous groupes confondus
    )
    developer_id = Column(
        Integer,
        ForeignKey("developer.id", ondelete="SET NULL"),
        nullable=True,   # NULL = snapshot agrégé (site/groupe), non individuel
    )

    # ── Relations ────────────────────────────────────────────────────────────
    project        = relationship("Project",        back_populates="kpi_snapshots")
    period         = relationship("Period",         back_populates="kpi_snapshots")
    extraction_lot = relationship("ExtractionLot",  back_populates="kpi_snapshots")
    site           = relationship("Site",           back_populates="kpi_snapshots")
    group          = relationship("DeveloperGroup", back_populates="kpi_snapshots")
    developer      = relationship("Developer",      back_populates="kpi_snapshots")
    alerts         = relationship(
        "Alert",
        back_populates="kpi_snapshot",
        cascade="all, delete-orphan",
    )

    # ── Contraintes et index ─────────────────────────────────────────────────
    __table_args__ = (
        # Contraintes métier sur les ratios (doivent rester entre 0 et 1)
        CheckConstraint(
            "approved_mr_rate >= 0 AND approved_mr_rate <= 1",
            name="chk_snapshot_approved_rate",
        ),
        CheckConstraint(
            "merged_mr_rate >= 0 AND merged_mr_rate <= 1",
            name="chk_snapshot_merged_rate",
        ),
        CheckConstraint("mr_rate_per_site      >= 0", name="chk_snapshot_mr_rate"),
        CheckConstraint("commit_rate_per_site  >= 0", name="chk_snapshot_commit_rate"),
        CheckConstraint("avg_review_time_hours >= 0", name="chk_snapshot_review_time"),
        CheckConstraint("nb_developers         >= 0", name="chk_snapshot_nb_devs"),
        CheckConstraint("total_commits         >= 0", name="chk_snapshot_commits"),
        CheckConstraint("total_mrs_created     >= 0", name="chk_snapshot_mrs_created"),

        # Index de recherche fréquents
        Index("idx_snapshot_project_period", "project_id", "period_id"),
        Index("idx_snapshot_site",           "site_id"),
        Index("idx_snapshot_group",          "group_id"),
        Index("idx_snapshot_developer",      "developer_id"),
        Index("idx_snapshot_date",           "snapshot_date"),
        Index("idx_snapshot_lot",            "lot_id"),
        # Index composite pour comparaison inter-sites sur une période
        Index("idx_snapshot_period_site",    "period_id", "site_id"),

        # ⚠️  L'index UNIQUE est créé via DDL event ci-dessous
        # (COALESCE nécessaire pour les colonnes NULLables)
    )


# ── Index UNIQUE avec gestion des NULLs (PostgreSQL COALESCE) ───────────────
# PROBLÈME : en PostgreSQL, NULL != NULL dans une contrainte UNIQUE.
# Sans COALESCE, plusieurs snapshots avec site_id=NULL, group_id=NULL,
# developer_id=NULL pour le même (project_id, period_id) seraient acceptés.
#
# SOLUTION : COALESCE(col, -1) traite NULL comme -1 (sentinelle).
# -1 n'est jamais une vraie FK (IDs commencent à 1).
#
# ALEMBIC — ajouter dans la migration :
#   op.execute("""
#       CREATE UNIQUE INDEX IF NOT EXISTS idx_kpi_snapshot_unique
#       ON kpi_snapshot (
#           project_id, period_id,
#           COALESCE(site_id, -1),
#           COALESCE(group_id, -1),
#           COALESCE(developer_id, -1)
#       )
#   """)
_unique_snapshot_index = DDL("""
    CREATE UNIQUE INDEX IF NOT EXISTS idx_kpi_snapshot_unique
    ON kpi_snapshot (
        project_id,
        period_id,
        COALESCE(site_id, -1),
        COALESCE(group_id, -1),
        COALESCE(developer_id, -1)
    )
""")

event.listen(
    KpiSnapshot.__table__,
    "after_create",
    _unique_snapshot_index,
)