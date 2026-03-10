from typing import Generic, Type, TypeVar, List, Optional
from sqlalchemy.orm import Session

T = TypeVar("T")


class BaseRepository(Generic[T]):
    """
    Repository générique CRUD.
    Commit / rollback = couche service.
    """

    def __init__(self, model: Type[T]):
        self.model = model

    def get_by_id(self, db: Session, obj_id: int) -> Optional[T]:
        return (
            db.query(self.model)
            .filter(self.model.id == obj_id)
            .one_or_none()
        )

    def get_all(self, db: Session) -> List[T]:
        return db.query(self.model).all()

    def create(self, db: Session, obj_in: dict) -> T:
        db_obj = self.model(**obj_in)
        db.add(db_obj)
        return db_obj

    def update(self, db: Session, obj: T, data: dict) -> T:

        for key, value in data.items():

            if value is None:
                continue

            # sécurité importante
            if hasattr(obj, key):
                setattr(obj, key, value)

        return obj

    def delete(self, db: Session, obj_id: int) -> Optional[T]:

        obj = self.get_by_id(db, obj_id)

        if not obj:
            return None

        db.delete(obj)

        return obj