"""
schemas/site.py

CORRECTIONS :
    - Validation timezone : format IANA (Continent/City) via regex
    - Validation name : pas de caractères spéciaux dangereux
"""

from pydantic import BaseModel, Field, field_validator
from typing import Optional
from datetime import datetime
import re

_IANA_TZ_PATTERN = re.compile(
    r"^(UTC|GMT|[A-Z][a-z]+(/[A-Z][a-zA-Z_]+)+)$"
)


class SiteCreate(BaseModel):
    name:      str  = Field(min_length=2, max_length=100,
                            description="Nom unique ex: 'Tunis', 'Lyon', 'HGW-OPE'")
    country:   Optional[str] = Field(default=None, max_length=100)
    timezone:  Optional[str] = Field(
        default=None,
        max_length=50,
        description="Format IANA ex: 'Africa/Tunis', 'Europe/Paris', 'UTC'",
    )
    is_active: bool = True

    @field_validator("name")
    @classmethod
    def validate_name(cls, v: str) -> str:
        v = v.strip()
        if not v:
            raise ValueError("Le nom du site ne peut pas être vide.")
        if re.search(r"[<>\"'\\]", v):
            raise ValueError("Le nom du site contient des caractères invalides.")
        return v

    @field_validator("timezone")
    @classmethod
    def validate_timezone(cls, v: Optional[str]) -> Optional[str]:
        if v is None:
            return v
        if not _IANA_TZ_PATTERN.match(v):
            raise ValueError(
                f"'{v}' n'est pas un timezone IANA valide. "
                "Exemples valides : 'Africa/Tunis', 'Europe/Paris', 'UTC'."
            )
        return v


class SiteUpdate(BaseModel):
    name:      Optional[str]  = Field(default=None, min_length=2, max_length=100)
    country:   Optional[str]  = Field(default=None, max_length=100)
    timezone:  Optional[str]  = Field(default=None, max_length=50)
    is_active: Optional[bool] = None

    @field_validator("timezone")
    @classmethod
    def validate_timezone(cls, v: Optional[str]) -> Optional[str]:
        if v is None:
            return v
        if not _IANA_TZ_PATTERN.match(v):
            raise ValueError(
                f"'{v}' n'est pas un timezone IANA valide. "
                "Exemples : 'Africa/Tunis', 'Europe/Paris', 'UTC'."
            )
        return v


class SiteResponse(BaseModel):
    id:         int
    name:       str
    country:    Optional[str]
    timezone:   Optional[str]
    is_active:  bool
    created_at: datetime

    model_config = {"from_attributes": True}
