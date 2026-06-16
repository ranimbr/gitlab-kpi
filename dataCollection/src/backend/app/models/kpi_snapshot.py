"""
models/kpi_snapshot.py

"""

from sqlalchemy import (
    Column, Integer, Float, Date, ForeignKey,
    Index, CheckConstraint, DDL, event, UniqueConstraint,
)
from sqlalchemy.orm import relationship

from app.models.base import Base


class KpiSnapshot(Base):

    __tablename__ = "kpi_snapshot"

    id            = Column(Integer, primary_key=True)
    snapshot_date = Column(Date, nullable=False)

    # ── Compteurs bruts (inputs des formules KPI) ────────────────────────────
    total_commits      = Column(Integer, default=0,   nullable=False)
    total_mrs_created  = Column(Integer, default=0,   nullable=False)  # non-draft uniquement
    total_mrs_approved = Column(Integer, default=0,   nullable=False)
    total_mrs_merged   = Column(Integer, default=0,   nullable=False)
    nb_developers      = Column(Integer, default=0,   nullable=False)  # devs validés, non-bots
    review_time_hours  = Column(Float,   default=0.0, nullable=False)  # somme brute (heures)
    
    # ✅ METRIQUES SENIOR (Collaboration) 🚀
    total_comments     = Column(Integer, default=0,   nullable=False)
    total_reviews      = Column(Integer, default=0,   nullable=False)

    # ✅ ACTIVITÉ LATENTE : MRs brouillons (Draft) en cours de développement
    # Non comptabilisées dans les KPIs de production car pas encore soumises à relecture.
    # Permet d'identifier les développeurs actifs mais sans production finalisée ce mois.
    total_mrs_draft    = Column(Integer, default=0,   nullable=False)
    
    # ✅ METRIQUE SENIOR : Leadership et Entraide
    # Nombre de MRs relues pour un développeur appartenant à une AUTRE équipe
    cross_contribution_score = Column(Integer, default=0, nullable=False)

    # ── KPI #1 : MR Rate par site ────────────────────────────────────────────
    # Formule : total_mrs_created / nb_developers
    mr_rate_per_site     = Column(Float, default=0.0, nullable=False)

    # ── KPI #2 : MR Rate par ticket ─────────────────────────────────────────
    # Réservé — encadrant : "pour le moment on néglige les tickets"
    mr_rate_per_ticket   = Column(Float, nullable=True)

    # ── KPI #3 : Approved MR Rate ────────────────────────────────────────────
    # Formule : total_mrs_approved / total_mrs_created
    approved_mr_rate     = Column(Float, default=0.0, nullable=False)

    # ── KPI #4 : Merged MR Rate ──────────────────────────────────────────────
    # Formule : total_mrs_merged / total_mrs_approved
    merged_mr_rate       = Column(Float, default=0.0, nullable=False)
    
    # ✅ METRIQUES ENTERPRISE (Pilotage Stratégique) 🚀
    bus_factor           = Column(Integer, default=0,   nullable=False)
    sprint_velocity      = Column(Float,   default=0.0, nullable=False)
    code_churn_rate      = Column(Float,   default=0.0, nullable=False)

    # ── KPI #5 : Commit Rate par site ────────────────────────────────────────
    # Formule : total_commits / nb_developers
    commit_rate_per_site = Column(Float, default=0.0, nullable=False)

    # ── KPI #6 : NB commits par projet ───────────────────────────────────────
    # Tous les commits du projet (hors merge automatiques) sur la période
    nb_commits_per_project = Column(Integer, default=0, nullable=False)

    # ── KPI #7 : Temps moyen de relecture ────────────────────────────────────
    # Formule : review_time_hours (somme) / total_mrs_approved
    avg_review_time_hours  = Column(Float, default=0.0, nullable=False)

    # ── Deltas vs snapshot précédent (trend indicators dashboard) ────────────
    # NULL = premier snapshot, pas de comparaison possible
    delta_mr_rate          = Column(Float,   nullable=True)
    delta_approved_mr_rate = Column(Float,   nullable=True)
    delta_merged_mr_rate   = Column(Float,   nullable=True)
    delta_commit_rate      = Column(Float,   nullable=True)
    # ✅ FIX : Integer (cohérent avec nb_commits_per_project qui est Integer)
    # Valeur signée : positif = plus de commits, négatif = moins de commits
    delta_nb_commits       = Column(Integer, nullable=True)
    delta_avg_review_time  = Column(Float,   nullable=True)

    # ── DORA METRICS ─ Standard Google / DORA Research Program ────────────────
    # deployment_count : nombre de MRs mergées sur la branche default du projet.
    #   Définition DORA : "un déploiement = tout changement livré en production."
    #   Ici on proxy avec les merges sur main/master, ce qui est la norme industrie
    #   quand il n'y a pas de tracking CD explicite.
    # lead_time_hours  : temps moyen (premier_commit → merge) pour les deployments
    #   du mois. Mesuré via MergeRequest.cycle_time_hours (déjà calculé à l'extraction).
    #   Formule : SUM(cycle_time_hours) / deployment_count
    deployment_count   = Column(Integer, default=0,   nullable=True)
    lead_time_hours    = Column(Float,   default=0.0, nullable=True)

    # ── Score développeur (uniquement quand developer_id IS NOT NULL) ────────
    # Score global calculé par le KpiCalculator chaque mois
    # Formule : combinaison pondérée des KPIs du développeur
    # NULL pour les snapshots agrégés (site/groupe/projet)
    developer_score    = Column(Float,   nullable=True)
    # Rang du développeur dans son site pour ce mois
    # 1 = meilleur score du site. NULL pour les snapshots non-individuels.
    score_rank_in_site = Column(Integer, nullable=True)

    # ── Clés étrangères ──────────────────────────────────────────────────────
    project_id   = Column(Integer, ForeignKey("project.id",          ondelete="CASCADE"),  nullable=False)
    period_id    = Column(Integer, ForeignKey("period.id",           ondelete="CASCADE"),  nullable=False)
    lot_id       = Column(Integer, ForeignKey("extraction_lot.id",   ondelete="SET NULL"), nullable=True)
    site_id      = Column(Integer, ForeignKey("site.id",             ondelete="SET NULL"), nullable=True)
    group_id     = Column(Integer, ForeignKey("developer_group.id",  ondelete="SET NULL"), nullable=True)
    developer_id = Column(Integer, ForeignKey("developer.id",        ondelete="SET NULL"), nullable=True)

    # ── Relations ────────────────────────────────────────────────────────────
    project        = relationship("Project",        back_populates="kpi_snapshots")
    period         = relationship("Period",         back_populates="kpi_snapshots")
    extraction_lot = relationship("ExtractionLot",  back_populates="kpi_snapshots")
    site           = relationship("Site",           back_populates="kpi_snapshots")
    group          = relationship("DeveloperGroup", back_populates="kpi_snapshots")
    developer      = relationship("Developer",      back_populates="kpi_snapshots")
    alerts         = relationship("Alert",          back_populates="kpi_snapshot",
                                   cascade="all, delete-orphan")

    # ── Contraintes et index ─────────────────────────────────────────────────
    __table_args__ = (
        # Contraintes métier
        CheckConstraint("approved_mr_rate     >= 0 AND approved_mr_rate   <= 1",
                        name="chk_snapshot_approved_rate"),
        CheckConstraint("merged_mr_rate       >= 0 AND merged_mr_rate     <= 1",
                        name="chk_snapshot_merged_rate"),
        CheckConstraint("mr_rate_per_site     >= 0",   name="chk_snapshot_mr_rate"),
        CheckConstraint("commit_rate_per_site >= 0",   name="chk_snapshot_commit_rate"),
        CheckConstraint("avg_review_time_hours >= 0",  name="chk_snapshot_review_time"),
        CheckConstraint("nb_developers        >= 0",   name="chk_snapshot_nb_devs"),
        CheckConstraint("total_commits        >= 0",   name="chk_snapshot_commits"),
        CheckConstraint("total_mrs_created    >= 0",   name="chk_snapshot_mrs_created"),
        # score_rank_in_site doit être > 0 si renseigné
        CheckConstraint(
            "(score_rank_in_site IS NULL) OR (score_rank_in_site > 0)",
            name="chk_snapshot_rank_positive",
        ),
        # developer_score et score_rank_in_site seulement pour snapshots individuels
        CheckConstraint(
            "(developer_id IS NOT NULL) OR "
            "(developer_score IS NULL AND score_rank_in_site IS NULL)",
            name="chk_snapshot_score_requires_developer",
        ),

        # Index de performance
        Index("idx_snapshot_project_period", "project_id", "period_id"),
        Index("idx_snapshot_site",           "site_id"),
        Index("idx_snapshot_group",          "group_id"),
        Index("idx_snapshot_developer",      "developer_id"),
        Index("idx_snapshot_date",           "snapshot_date"),
        Index("idx_snapshot_lot",            "lot_id"),
        Index("idx_snapshot_period_site",    "period_id", "site_id"),
        # Classement des développeurs d'un site sur une période
        Index("idx_snapshot_dev_rank",       "site_id", "period_id", "score_rank_in_site"),

        # ✅ SOLUTION SOLIDE : Contrainte d'unicité stricte au niveau DB
        # Empêche physiquement d'avoir deux snapshots pour le même projet/période/dev/site.
        # COALESCE est simulé ici via une logique métier dans le repo, 
        # mais on définit la contrainte unique pour les déploiements futurs.
        UniqueConstraint(
            "project_id", "period_id", "site_id", "group_id", "developer_id",
            name="uq_kpi_snapshot_per_dimension"
        )
    )