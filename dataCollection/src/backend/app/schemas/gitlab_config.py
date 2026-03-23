"""
schemas/gitlab_config.py — CORRIGÉ
- Ajout site_id dans Create/Update/Response (FK ajouté au modèle)
- Validation domain : HTTPS obligatoire
- Token JAMAIS retourné dans la Response (sécurité)
"""
from pydantic import BaseModel, Field, field_validator
from typing import Optional
from datetime import datetime
import re


class GitLabConfigCreate(BaseModel):
    name:        str = Field(min_length=2, max_length=100)
    domain:      str = Field(description="URL HTTPS ex: https://gitlab.mycompany.com")
    token:       str = Field(min_length=10, description="Token GitLab (sera chiffré)")
    description: Optional[str] = Field(default=None, max_length=500)
    site_id:     Optional[int] = Field(default=None, description="Site associé (optionnel)")  # ✅ AJOUT

    @field_validator("domain")
    @classmethod
    def validate_domain(cls, v: str) -> str:
        v = v.rstrip("/")
        if not v.startswith("https://"):
            raise ValueError(f"Le domain doit commencer par 'https://'. Reçu : '{v}'")
        return v

    @field_validator("token")
    @classmethod
    def validate_token_not_placeholder(cls, v: str) -> str:
        if v.lower() in {"your-token", "xxx", "test", "changeme", "token", "glpat-xxxx"}:
            raise ValueError("Le token GitLab ne peut pas être un placeholder.")
        return v


class GitLabConfigUpdate(BaseModel):
    name:        Optional[str]  = Field(default=None, min_length=2, max_length=100)
    domain:      Optional[str]  = None
    token:       Optional[str]  = Field(default=None, min_length=10)
    is_active:   Optional[bool] = None
    description: Optional[str]  = Field(default=None, max_length=500)
    site_id:     Optional[int]  = None  # ✅ AJOUT

    @field_validator("domain")
    @classmethod
    def validate_domain(cls, v: Optional[str]) -> Optional[str]:
        if v is None:
            return v
        v = v.rstrip("/")
        if not v.startswith("https://"):
            raise ValueError("Le domain doit commencer par 'https://'.")
        return v


class GitLabConfigResponse(BaseModel):
    id:             int
    name:           str
    domain:         str
    is_active:      bool
    description:    Optional[str] = None
    site_id:        Optional[int] = None   # ✅ AJOUT
    created_at:     datetime
    projects_count: int = 0
    # ⚠️ SÉCURITÉ : token intentionnellement ABSENT de la réponse

    model_config = {"from_attributes": True}
