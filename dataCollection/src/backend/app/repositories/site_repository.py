"""
repositories/site_repository.py

MODIFICATION v2 — Enterprise-grade import :
──────────────────────────────────────────────────────────────────
AJOUT create_from_import() :
    Crée un site minimal depuis l'import CSV.
    Distinct de create() pour tracer l'origine (source="csv_import")
    et garantir des valeurs par défaut sûres sans exposer tous les
    champs à l'appelant.

    Le site est créé actif avec :
        name      = nom tel qu'il apparaît dans le CSV (casse conservée)
        country   = "À définir"  (l'admin complètera via la page Sites)
        timezone  = None
        is_active = True

AJOUT get_by_names() :
    Charge plusieurs sites par leurs noms en une seule requête SQL.
    Utilisé par import_from_file() pour éviter N requêtes get_by_name().
"""
from typing import Optional, List
from sqlalchemy.orm import Session
from app.models.site import Site
from app.repositories.base import BaseRepository


class SiteRepository(BaseRepository[Site]):

    def __init__(self):
        super().__init__(Site)

    # ── READ ──────────────────────────────────────────────────────────────────

    def get_by_name(self, db: Session, name: str) -> Optional[Site]:
        """Lookup exact par nom (case-sensitive). Pour les checks unicité."""
        return db.query(Site).filter(Site.name == name).one_or_none()

    def get_by_name_ilike(self, db: Session, name: str) -> Optional[Site]:
        """Lookup case-insensitive — utilisé lors de la résolution dans l'import."""
        return (
            db.query(Site)
            .filter(Site.name.ilike(name))
            .one_or_none()
        )

    def get_by_names(self, db: Session, names: List[str]) -> List[Site]:
        """
        ✅ NOUVEAU : charge plusieurs sites en une seule requête SQL.
        La comparaison est case-insensitive (lower()).
        Utilisé par import_from_file() pour le pré-chargement du dict.
        """
        lower_names = [n.lower() for n in names]
        from sqlalchemy import func
        return (
            db.query(Site)
            .filter(func.lower(Site.name).in_(lower_names))
            .all()
        )

    def get_active_sites(self, db: Session) -> List[Site]:
        return (
            db.query(Site)
            .filter(Site.is_active.is_(True))
            .order_by(Site.name)
            .all()
        )

    def get_all(self, db: Session) -> List[Site]:
        return db.query(Site).order_by(Site.name).all()

    def get_by_country(self, db: Session, country: str) -> List[Site]:
        return (
            db.query(Site)
            .filter(Site.country == country)
            .order_by(Site.name)
            .all()
        )

    def name_exists(self, db: Session, name: str) -> bool:
        return db.query(Site.id).filter(Site.name == name).first() is not None

    # ── WRITE ─────────────────────────────────────────────────────────────────

    def create_from_import(self, db: Session, name: str) -> Site:
        """
        ✅ NOUVEAU : crée un site minimal depuis un import CSV.

        Règles métier :
          - name      → conservé tel quel (casse du CSV)
          - country   → "À définir"  (l'admin complètera via la page Sites)
          - timezone  → None
          - is_active → True  (actif immédiatement pour les KPIs)

        L'admin verra le site dans la page Sites avec un libellé
        "À définir" qui l'invite à le compléter.

        Ne fait pas db.commit() — laissé à l'appelant (import_from_file).
        """
        existing = self.get_by_name_ilike(db, name)
        if existing:
            # Race condition : le site a été créé par une autre ligne du CSV
            return existing

        site = Site(
            name      = name.strip(),
            country   = "À définir",
            timezone  = None,
            is_active = True,
        )
        db.add(site)
        db.flush()   # génère l'id sans commit
        return site