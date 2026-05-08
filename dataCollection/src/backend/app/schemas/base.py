"""
schemas/base.py


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