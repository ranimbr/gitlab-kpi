"""
models/developer_import_log.py

Journal de traçabilité des imports en masse de développeurs (CSV / Excel).

CONTEXTE :
    L'encadrant a demandé que l'admin puisse créer des développeurs
    en uploadant un fichier (CSV ou Excel) pour gagner du temps.
    Ce modèle enregistre chaque import avec son rapport détaillé.

Cycle de vie d'un import :
    1. Admin uploade le fichier  → status=pending
    2. Service traite le fichier → status=processing
    3. Import terminé            → status=completed, rapport généré
    4. Import en erreur          → status=failed, error_message renseigné

Format du fichier attendu (colonnes) :
    name*            → Nom complet du développeur
    email*           → Email professionnel (unique)
    gitlab_username* → Identifiant @username GitLab
    sites            → Noms des sites séparés par virgule (ex: "Tunis,Paris")
    projects         → Noms des projets séparés par virgule
    group            → Nom du groupe d'équipe
    * = obligatoire

Rapport d'import (report_data JSON) :
    {
        "success": [{"name": "Ahmed", "email": "..."}],
        "errors":  [{"row": 5, "reason": "email déjà existant"}],
        "duplicates": [{"email": "..."}]
    }
"""

from sqlalchemy import (
    Column, Integer, String, ForeignKey,
    Enum, Index, JSON, Text,
)
from sqlalchemy.orm import relationship
import enum

from app.models.base import Base


class ImportStatusEnum(str, enum.Enum):
    pending    = "pending"
    processing = "processing"
    completed  = "completed"
    failed     = "failed"


class DeveloperImportLog(Base):

    __tablename__ = "developer_import_log"

    id        = Column(Integer, primary_key=True)

    # ── Fichier source ───────────────────────────────────────────────────────
    file_name = Column(String(255), nullable=False)   # Nom original du fichier uploadé
    file_path = Column(String(512), nullable=True)    # Chemin de stockage temporaire
    # Format détecté automatiquement par le service
    file_type = Column(String(10),  nullable=True)    # "csv" | "xlsx"

    # ── Statut et progression ────────────────────────────────────────────────
    status = Column(
        Enum(ImportStatusEnum),
        default=ImportStatusEnum.pending,
        nullable=False,
    )

    # ── Compteurs de résultats ───────────────────────────────────────────────
    total_rows      = Column(Integer, default=0, nullable=False)  # Total lignes fichier
    success_count   = Column(Integer, default=0, nullable=False)  # Devs créés avec succès
    error_count     = Column(Integer, default=0, nullable=False)  # Lignes en erreur
    duplicate_count = Column(Integer, default=0, nullable=False)  # Doublons ignorés

    # ── Rapport détaillé ─────────────────────────────────────────────────────
    # JSON structuré : { success: [...], errors: [...], duplicates: [...] }
    report_data   = Column(JSON, nullable=True)
    error_message = Column(Text, nullable=True)  # Erreur fatale si status=failed

    # ── Clés étrangères ──────────────────────────────────────────────────────
    imported_by = Column(
        Integer,
        ForeignKey("app_user.id", ondelete="SET NULL"),
        nullable=True,  # nullable : si l'user est supprimé, le log reste
    )

    # ── Relations ────────────────────────────────────────────────────────────
    imported_by_user = relationship(
        "AppUser",
        back_populates="developer_import_logs",
        foreign_keys=[imported_by],
    )

    # ── Index ────────────────────────────────────────────────────────────────
    __table_args__ = (
        Index("idx_import_log_user",   "imported_by"),
        Index("idx_import_log_status", "status"),
        # Requête fréquente : historique des imports d'un admin (trié par date)
        Index("idx_import_log_user_date", "imported_by", "created_at"),
    )