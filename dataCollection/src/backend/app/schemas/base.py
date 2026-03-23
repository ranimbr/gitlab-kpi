"""
schemas/base.py

Classes de base Pydantic partagées par tous les schémas.

Conventions utilisées dans ce projet :
    - *Create  : payload POST  (création)  — pas d'id
    - *Update  : payload PATCH (mise à jour) — tous champs Optional
    - *Response: payload GET   (lecture)    — inclut id + timestamps
    - *Summary : version allégée pour les listes (sans nested objects)

Configuration globale :
    from_attributes=True  → lecture depuis des instances SQLAlchemy ORM
    populate_by_name=True → accepte les deux formes snake_case et alias
"""

from datetime import datetime
from pydantic import BaseModel, ConfigDict


class BaseSchema(BaseModel):
    """Base pour tous les schémas — active from_attributes (ORM mode)."""
    model_config = ConfigDict(
        from_attributes=True,
        populate_by_name=True,
        str_strip_whitespace=True,   # strip espaces automatique sur les strings
    )


class TimestampMixin(BaseSchema):
    """Mixin timestamps pour les schémas de réponse."""
    created_at: datetime
    updated_at: datetime