"""
repositories/base.py

Repository générique CRUD.

RÈGLES ARCHITECTURE :
    - Commit / rollback = couche SERVICE (jamais ici)
    - db.flush() après add/delete pour récupérer l'id généré
    - La couche service appelle db.commit() après validation métier

CORRECTION — update() avec sentinel UNSET :
    Problème original : `if value is None: continue`
    → Impossible de mettre un champ à NULL intentionnellement.
      Ex : developer.site_id = None (désassigner d'un site)
           threshold.dashboard_id = None

    FIX : pattern sentinel UNSET.
    - update(db, obj, {"site_id": None})   → met site_id à NULL ✅
    - update(db, obj, {})                  → ne change rien ✅
    - update(db, obj, {"site_id": UNSET})  → ne change pas site_id ✅

    Usage côté service :
        data = schema.model_dump(exclude_unset=True)  # Pydantic v2
        repo.update(db, obj, data)
"""

from typing import Generic, TypeVar, Type, List, Optional

from sqlalchemy.orm import Session

T = TypeVar("T")

# Sentinel : distingue "non fourni" de None (NULL intentionnel)
_UNSET = object()
UNSET  = _UNSET   # exporté pour usage dans les services


class BaseRepository(Generic[T]):

    def __init__(self, model: Type[T]):
        self.model = model

    # ── READ ──────────────────────────────────────────────────────────────────

    def get_by_id(self, db: Session, obj_id: int) -> Optional[T]:
        return (
            db.query(self.model)
            .filter(self.model.id == obj_id)
            .one_or_none()
        )

    def get_all(self, db: Session) -> List[T]:
        return db.query(self.model).all()

    # ── WRITE ─────────────────────────────────────────────────────────────────

    def create(self, db: Session, obj_in: dict) -> T:
        db_obj = self.model(**obj_in)
        db.add(db_obj)
        db.flush()   # génère l'id sans commit
        return db_obj

    def update(self, db: Session, obj: T, data: dict) -> T:
        """
        Met à jour un objet avec les données fournies.

        ✅ FIX : accepte None comme valeur intentionnelle (mise à NULL).
           Seules les clés absentes du dict sont ignorées.
           Utiliser model.model_dump(exclude_unset=True) côté service
           pour ne passer que les champs réellement modifiés.

        Exemple :
            update(db, dev, {"site_id": None})   → site_id = NULL ✅
            update(db, dev, {"site_id": 5})      → site_id = 5   ✅
            update(db, dev, {})                  → rien           ✅
        """
        for key, value in data.items():
            if hasattr(obj, key):
                setattr(obj, key, value)
        db.flush()
        return obj

    def delete(self, db: Session, obj_id: int) -> Optional[T]:
        obj = self.get_by_id(db, obj_id)
        if not obj:
            return None
        db.delete(obj)
        db.flush()
        return obj

    def exists(self, db: Session, obj_id: int) -> bool:
        return (
            db.query(self.model.id)
            .filter(self.model.id == obj_id)
            .first() is not None
        )