"""
models/base.py
 
Classe de base abstraite pour tous les modèles SQLAlchemy.
 
⚠️  POSTGRESQL ONLY : ce projet cible PostgreSQL exclusivement.
    - ARRAY(Integer) dans AppUser
    - DateTime(timezone=True) → TIMESTAMPTZ
    - Index COALESCE dans KpiSnapshot
    SQLite non supporté.
 
⚠️  LIMITATION onupdate :
    SQLAlchemy `onupdate` ne se déclenche QUE via l'ORM (session.commit()).
    Un UPDATE SQL direct (session.execute(text("UPDATE ..."))) ne met PAS
    à jour `updated_at` automatiquement.
    Solution recommandée en production : trigger PostgreSQL
    → voir migrations/V001__add_updated_at_trigger.sql
"""
 
import re
from sqlalchemy.orm import DeclarativeBase, declared_attr
from sqlalchemy import Column, DateTime, func
 
 
class Base(DeclarativeBase):
 
    __abstract__ = True
 
    @declared_attr.directive
    def __tablename__(cls) -> str:
        """
        Génère automatiquement le nom de table en snake_case.
        
        Exemples :
            AppUser         → app_user
            DeveloperGroup  → developer_group
            KpiSnapshot     → kpi_snapshot
            GitLabConfig    → git_lab_config  ← surcharger explicitement !
        
        Les modèles avec des noms spéciaux (GitLabConfig → gitlab_config,
        Commit → git_commit) doivent surcharger __tablename__ explicitement.
        """
        # CamelCase → snake_case
        s1 = re.sub(r"(.)([A-Z][a-z]+)", r"\1_\2", cls.__name__)
        return re.sub(r"([a-z0-9])([A-Z])", r"\1_\2", s1).lower()
 
    # ── Timestamps universels ────────────────────────────────────────────────
    created_at = Column(
        DateTime(timezone=True),
        # func.now() sur TIMESTAMPTZ retourne l'heure UTC courante
        server_default=func.now(),
        nullable=False,
    )
    updated_at = Column(
        DateTime(timezone=True),
        server_default=func.now(),
        # ⚠️  Déclenché UNIQUEMENT via ORM — pas sur UPDATE SQL direct
        onupdate=func.now(),
        nullable=False,
    )
 
    # ── Helpers ──────────────────────────────────────────────────────────────
    def __repr__(self) -> str:
        """Représentation lisible pour le debugging et les logs."""
        try:
            pk_cols = [c.name for c in self.__table__.primary_key.columns]
            pk_str = ", ".join(f"{c}={getattr(self, c)!r}" for c in pk_cols)
            return f"<{self.__class__.__name__}({pk_str})>"
        except Exception:
            return f"<{self.__class__.__name__}(?)>"
 
    def to_dict(self) -> dict:
        """
        Sérialise le modèle en dictionnaire (utile pour les logs et les tests).
        Ne sérialise PAS les relations (évite les lazy-load involontaires).
        """
        return {
            col.name: getattr(self, col.name)
            for col in self.__table__.columns
        }