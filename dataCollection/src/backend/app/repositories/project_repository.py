"""
repositories/project_repository.py

MODIFICATIONS v2 — Enterprise-grade import :
──────────────────────────────────────────────────────────────────
AJOUT get_by_name_ilike(db, name) :
    Lookup case-insensitive — évite les doublons si un même projet
    est référencé plusieurs fois dans le CSV avec des casses différentes
    (ex: "Backend-API" vs "backend-api" vs "BACKEND-API").
    Utilisé par create_from_import() pour la race-condition check.

AJOUT create_from_import(db, name) :
    Crée un projet minimal depuis l'import CSV.
    Règles métier :
        name              → conservé tel quel (casse du CSV)
        description       → "Créé depuis l'import CSV développeurs"
        gitlab_project_id → None (à renseigner dans Admin → Projets)
        is_active         → True
    Ne fait pas db.commit() — laissé à l'appelant (import_from_file).

CORRECTIONS précédentes conservées (encadrant) :
    1. get_by_site_id() : filtre via ProjectSite (M2M) — Project.site_id supprimé.
    2. get_all()        : filtre archived ajouté.
    3. _apply_enrichment() : last_commit_date N'EST PLUS injecté ici (vrai champ DB).
"""
import logging
from typing import List, Optional

from sqlalchemy import func
from sqlalchemy.orm import Session, joinedload

from app.models.commit import Commit
from app.models.project import Project
from app.models.project_site import ProjectSite
from app.repositories.base import BaseRepository

logger = logging.getLogger(__name__)


# ─────────────────────────────────────────────────────────────────────────────
#  HELPERS ENRICHISSEMENT
# ─────────────────────────────────────────────────────────────────────────────

def _build_enrichment_maps(db: Session, project_ids: List[int]) -> dict:
    """Calcule commit_count et contributor_count en une requête GROUP BY."""
    if not project_ids:
        return {}
    rows = (
        db.query(
            Commit.project_id,
            func.count(Commit.id).label("commit_count"),
            func.count(func.distinct(Commit.developer_id)).label("contributor_count"),
        )
        .filter(
            Commit.project_id.in_(project_ids),
            Commit.developer_id.isnot(None),
        )
        .group_by(Commit.project_id)
        .all()
    )
    return {
        r.project_id: {
            "commit_count":      r.commit_count,
            "contributor_count": r.contributor_count,
        }
        for r in rows
    }


def _apply_enrichment(project: Project, enrichment_map: dict) -> Project:
    """
    Injecte commit_count et contributor_count sur l'objet Project.
    ✅ FIX : last_commit_date N'EST PLUS injecté ici — c'est maintenant
    un vrai champ DB mis à jour par ExtractionService lors des extractions.
    On ne l'écrase pas pour éviter d'effacer la valeur stockée.
    """
    data = enrichment_map.get(project.id, {})
    project.commit_count      = data.get("commit_count",      0)
    project.contributor_count = data.get("contributor_count", 0)
    return project


# ─────────────────────────────────────────────────────────────────────────────
#  REPOSITORY
# ─────────────────────────────────────────────────────────────────────────────

class ProjectRepository(BaseRepository[Project]):

    def __init__(self):
        super().__init__(Project)

    # ── READ ──────────────────────────────────────────────────────────────────

    def get_all(
        self,
        db:          Session,
        active_only: bool           = True,
        archived:    Optional[bool] = None,
    ) -> List[Project]:
        """
        Liste les projets avec enrichissement commit/contributor.
        archived=None → pas de filtre | True → archivés | False → non archivés
        """
        q = db.query(Project)

        if active_only:
            q = q.filter(
                Project.is_active.is_(True),
                Project.archived.is_(False),
            )
        if archived is not None:
            q = q.filter(Project.archived.is_(archived))

        projects = q.all()
        if not projects:
            return []
        enrichment_map = _build_enrichment_maps(db, [p.id for p in projects])
        return [_apply_enrichment(p, enrichment_map) for p in projects]

    def get_by_id(self, db: Session, project_id: int) -> Optional[Project]:
        project = db.query(Project).filter(Project.id == project_id).first()
        if project:
            _apply_enrichment(project, _build_enrichment_maps(db, [project.id]))
        return project

    def get_by_name(self, db: Session, name: str) -> Optional[Project]:
        """Lookup exact (case-sensitive) — pour les checks d'unicité."""
        return db.query(Project).filter(Project.name == name).one_or_none()

    def get_by_name_ilike(self, db: Session, name: str) -> Optional[Project]:
        """
        ✅ NOUVEAU : Lookup case-insensitive.
        Utilisé dans create_from_import() pour éviter les doublons
        quand un projet est référencé plusieurs fois dans le CSV
        avec des casses différentes (ex: "Backend-API" vs "backend-api").
        Utilisé aussi dans import_from_file() pour la résolution des noms.
        """
        return (
            db.query(Project)
            .filter(Project.name.ilike(name))
            .one_or_none()
        )

    def get_by_gitlab_id(self, db: Session, gitlab_project_id: int) -> Optional[Project]:
        project = (
            db.query(Project)
            .filter(Project.gitlab_project_id == gitlab_project_id)
            .first()
        )
        if project:
            _apply_enrichment(project, _build_enrichment_maps(db, [project.id]))
        return project

    def get_by_gitlab_config(self, db: Session, gitlab_config_id: int) -> List[Project]:
        projects = (
            db.query(Project)
            .filter(Project.gitlab_config_id == gitlab_config_id)
            .all()
        )
        if not projects:
            return []
        enrichment_map = _build_enrichment_maps(db, [p.id for p in projects])
        return [_apply_enrichment(p, enrichment_map) for p in projects]

    def get_by_site_id(self, db: Session, site_id: int) -> List[Project]:
        """
        ✅ FIX : filtre via ProjectSite (M2M) au lieu de Project.site_id.
        Un projet peut appartenir à plusieurs sites.
        """
        projects = (
            db.query(Project)
            .join(
                ProjectSite,
                (ProjectSite.project_id == Project.id) &
                (ProjectSite.site_id    == site_id),
            )
            .all()
        )
        if not projects:
            return []
        enrichment_map = _build_enrichment_maps(db, [p.id for p in projects])
        return [_apply_enrichment(p, enrichment_map) for p in projects]

    def get_site_ids(self, db: Session, project_id: int) -> List[int]:
        """
        IDs de tous les sites associés à un projet.
        Utilisé dans ProjectResponse pour afficher la liste des sites.
        """
        return [
            row.site_id
            for row in db.query(ProjectSite.site_id)
            .filter(ProjectSite.project_id == project_id)
            .all()
        ]

    def name_exists(self, db: Session, name: str) -> bool:
        return db.query(Project.id).filter(Project.name == name).first() is not None

    def update_last_commit_date(
        self,
        db:               Session,
        project_id:       int,
        last_commit_date,
    ) -> None:
        """
        Met à jour last_commit_date après chaque extraction.
        Appelé par ExtractionService après traitement des commits.
        """
        db.query(Project).filter(Project.id == project_id).update(
            {"last_commit_date": last_commit_date},
            synchronize_session="fetch",
        )

    # ── WRITE ─────────────────────────────────────────────────────────────────

    def create(self, db: Session, data: dict) -> Project:
        project = Project(**data)
        db.add(project)
        db.flush()
        _apply_enrichment(project, _build_enrichment_maps(db, [project.id]))
        return project

    def create_from_import(
        self,
        db: Session,
        name: str,
        gitlab_project_id: Optional[int] = None,
        gitlab_config_id: Optional[int] = None,
    ) -> Project:
        """
        ✅ NOUVEAU : Crée un projet minimal depuis un import CSV.

        Règles métier :
          - name              → conservé tel quel (casse du CSV)
          - description       → message invitant l'admin à compléter
          - gitlab_project_id → Renseigné si transmis, sinon None
          - gitlab_config_id  → Renseigné si transmis, sinon None
          - is_active         → True
          - archived          → False

        L'admin verra le projet dans la page Projets avec gitlab_project_id=None,
        ce qui l'empêche d'être extrait par GitLab mais permet d'y associer
        des développeurs immédiatement.

        Race condition : si deux lignes du CSV référencent le même projet,
        get_by_name_ilike() retourne l'existant au lieu de créer un doublon.

        Ne fait pas db.commit() — laissé à l'appelant (import_from_file).
        """
        # 1. Priorité absolue : l'identifiant GitLab (Sorce of Truth)
        if gitlab_project_id is not None:
            existing = self.get_by_gitlab_id(db, gitlab_project_id)
            if existing:
                # On synchronise le nom si celui de la DB est vide ou très différent?
                # Non, on respecte la DB pour l'affichage, mais on retourne l'objet.
                return existing

        # 2. Lookup par nom (ilike)
        existing = self.get_by_name_ilike(db, name)
        if existing:
            # Si le projet existe mais n'a pas d'ID, on le met à jour si des IDs sont fournis
            updated = False
            if gitlab_project_id is not None and existing.gitlab_project_id is None:
                existing.gitlab_project_id = gitlab_project_id
                updated = True
            if gitlab_config_id is not None and existing.gitlab_config_id is None:
                existing.gitlab_config_id = gitlab_config_id
                updated = True
            if updated:
                db.flush()
            return existing

        project = Project(
            name              = name.strip(),
            description       = "Créé depuis l'import CSV développeurs — à compléter dans Administration → Projets",
            gitlab_project_id = gitlab_project_id,
            gitlab_config_id  = gitlab_config_id,
            is_active         = True,
            archived          = False,
        )
        db.add(project)
        db.flush()
        # Pas d'enrichissement (0 commits au moment de la création)
        project.commit_count      = 0
        project.contributor_count = 0
        return project

    def update(self, db: Session, project_id: int, data: dict) -> Optional[Project]:
        project = db.query(Project).filter(Project.id == project_id).first()
        if project:
            for k, v in data.items():
                setattr(project, k, v)
            db.flush()
            _apply_enrichment(project, _build_enrichment_maps(db, [project.id]))
        return project

    def delete(self, db: Session, project_id: int) -> bool:
        project = db.query(Project).filter(Project.id == project_id).first()
        if project:
            db.delete(project)
            db.flush()
            return True
        return False