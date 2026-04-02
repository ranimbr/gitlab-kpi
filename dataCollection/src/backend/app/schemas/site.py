"""
schemas/site.py — CORRIGÉ

Corrections :
  [FIX-422] validate_timezone : une chaîne vide "" était rejetée par le regex
            au lieu d'être convertie en None. Ajout de la conversion "" → None
            avant le test regex.
  [FIX-422] Regex IANA assoupli : accepte les villes avec chiffres ou tirets
            ex: "America/New_York", "America/Indiana/Indianapolis",
            "Etc/GMT+5", "US/Eastern" qui étaient rejetés.
  [FIX-422] validate_name : idem, string vide après strip → erreur claire.
  [FIX]     SiteUpdate.timezone : même correction string vide → None.
"""

from pydantic import BaseModel, Field, field_validator
from typing   import Optional
from datetime import datetime
import re

# ── Regex IANA assoupli ────────────────────────────────────────────────────────
# Accepte :
#   UTC, GMT, GMT+5, GMT-3
#   Africa/Tunis, Europe/Paris, America/New_York
#   America/Indiana/Indianapolis  (3 niveaux)
#   Etc/GMT+5, US/Eastern, Pacific/Marquesas
_IANA_TZ_PATTERN = re.compile(
    r"^(UTC|GMT([+-]\d{1,2})?|[A-Za-z]+(/[A-Za-z0-9_+\-]+){1,2})$"
)


class SiteCreate(BaseModel):
    name:      str           = Field(
        min_length=2, max_length=100,
        description="Nom unique ex: 'Tunis', 'Lyon', 'HGW-OPE'",
    )
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

    @field_validator("timezone", mode="before")
    @classmethod
    def validate_timezone(cls, v) -> Optional[str]:
        # [FIX-422] Convertir string vide en None avant toute validation
        if v is None or (isinstance(v, str) and v.strip() == ""):
            return None
        v = v.strip()
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

    @field_validator("name", mode="before")
    @classmethod
    def validate_name(cls, v) -> Optional[str]:
        if v is None or (isinstance(v, str) and v.strip() == ""):
            return None
        v = v.strip()
        if re.search(r"[<>\"'\\]", v):
            raise ValueError("Le nom du site contient des caractères invalides.")
        return v

    @field_validator("timezone", mode="before")
    @classmethod
    def validate_timezone(cls, v) -> Optional[str]:
        # [FIX-422] Même correction : "" → None
        if v is None or (isinstance(v, str) and v.strip() == ""):
            return None
        v = v.strip()
        if not _IANA_TZ_PATTERN.match(v):
            raise ValueError(
                f"'{v}' n'est pas un timezone IANA valide. "
                "Exemples : 'Africa/Tunis', 'Europe/Paris', 'UTC'."
            )
        return v

    @field_validator("country", mode="before")
    @classmethod
    def validate_country(cls, v) -> Optional[str]:
        # Convertir string vide en None pour la cohérence
        if v is None or (isinstance(v, str) and v.strip() == ""):
            return None
        return v.strip()


class SiteResponse(BaseModel):
    id:         int
    name:       str
    country:    Optional[str]
    timezone:   Optional[str]
    is_active:  bool
    created_at: datetime

    model_config = {"from_attributes": True}
