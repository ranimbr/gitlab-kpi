"""
schemas/developer.py — v5

"""
from pydantic import BaseModel, Field, field_validator, model_validator
from typing import Optional, List, Dict, Any
from datetime import date, datetime
from app.schemas.enums import ImportStatusEnum, DeveloperSourceEnum


class DeveloperGroupCreate(BaseModel):
    name:        str           = Field(min_length=1, max_length=100)
    manager_id:  Optional[int] = None
    description: Optional[str] = Field(default=None, max_length=500)

class DeveloperGroupUpdate(BaseModel):
    name:        Optional[str] = Field(default=None, min_length=1, max_length=100)
    manager_id:  Optional[int] = None
    description: Optional[str] = Field(default=None, max_length=500)

# Ajout d'une réponse simple pour l'association
class SiteResponse(BaseModel):
    id: int
    name: str
    model_config = {"from_attributes": True}

class DeveloperGroupResponse(BaseModel):
    id:          int
    name:        str
    manager_id:  Optional[int]
    description: Optional[str]
    member_count: Optional[int] = 0  # ✅ AJOUT SENIOR : Compteur temporel intelligent
    created_at:  datetime
    model_config = {"from_attributes": True}

class DeveloperSiteAssociation(BaseModel):
    site_id:    int
    is_primary: bool = False

class DeveloperProjectAssociation(BaseModel):
    project_id: int
    is_active:  bool = True

class DeveloperCreate(BaseModel):
    gitlab_username: Optional[str] = Field(default=None, max_length=255)
    gitlab_user_id:  Optional[int] = Field(default=None)
    name:    str           = Field(min_length=1, max_length=255)
    email:   Optional[str] = Field(default=None, max_length=255)
    is_external:     bool           = Field(default=False)
    onboarding_date: Optional[date] = Field(default=None)
    offboarding_date: Optional[date] = Field(default=None)
    group_ids: List[int] = Field(default=[])
    sites:    List[DeveloperSiteAssociation]    = Field(default=[])
    projects: List[DeveloperProjectAssociation] = Field(default=[])
    period_id: Optional[int] = Field(default=None, description="Période cible pour l'affectation des projets (Laisser vide pour mission permanente)")
    mutation_date: Optional[date] = Field(default=None, description="Date d'effet précise pour l'affectation initiale du site")
    is_active: bool = True

    @model_validator(mode="after")
    def validate_single_primary_site(self) -> "DeveloperCreate":
        if sum(1 for s in self.sites if s.is_primary) > 1:
            raise ValueError("Un seul site peut être marqué comme primaire.")
        return self

    @field_validator("email")
    @classmethod
    def validate_email_format(cls, v):
        if v is None: return v
        if "@" not in v: raise ValueError("Format d'email invalide.")
        return v.lower().strip()

class DeveloperUpdate(BaseModel):
    gitlab_username: Optional[str]  = Field(default=None, max_length=255)
    name:            Optional[str]  = Field(default=None, max_length=255)
    email:           Optional[str]  = Field(default=None, max_length=255)
    is_external:     Optional[bool] = None
    onboarding_date: Optional[date] = None
    offboarding_date: Optional[date] = None
    group_ids:       Optional[List[int]]  = None
    is_active:       Optional[bool] = None
    sites:    Optional[List[DeveloperSiteAssociation]]    = None
    projects: Optional[List[DeveloperProjectAssociation]] = None
    period_id: Optional[int] = None
    mutation_date: Optional[date] = Field(default=None, description="Date d'effet précise pour le changement de site (SCD Type 2)")

class DeveloperValidate(BaseModel):
    is_validated: bool
    is_bot:       Optional[bool] = Field(default=None)
    sites:        Optional[List[DeveloperSiteAssociation]]    = Field(default=None)
    projects:     Optional[List[DeveloperProjectAssociation]] = Field(default=None)
    group_ids:     Optional[List[int]] = Field(default=None)

    @model_validator(mode="after")
    def validate_single_primary_site(self) -> "DeveloperValidate":
        if self.sites and sum(1 for s in self.sites if s.is_primary) > 1:
            raise ValueError("Un seul site peut être marqué comme primaire.")
        return self

class SiteAssociationResponse(BaseModel):
    site_id:    int
    site_name:  Optional[str] = None
    is_primary: bool
    is_active:  Optional[bool] = None
    start_date: Optional[date] = None
    end_date:   Optional[date] = None
    model_config = {"from_attributes": True}

class ProjectAssociationResponse(BaseModel):
    project_id:   int
    project_name: Optional[str] = None
    gitlab_project_id: Optional[int] = None
    is_active:    bool
    start_date:   Optional[date] = None
    end_date:     Optional[date] = None
    period_id:    Optional[int] = None # AJOUT SENIOR
    model_config = {"from_attributes": True}

class DeveloperResponse(BaseModel):
    id:              int
    gitlab_user_id:  Optional[int]
    gitlab_username: Optional[str]
    name:            str
    email:           Optional[str]
    is_external:     bool
    auto_created:    bool
    onboarding_date: Optional[date] = None
    offboarding_date: Optional[date] = None
    last_active_at:  Optional[datetime] = None
    group_ids:       List[int] = []
    is_active:       bool
    is_validated:    bool
    is_bot:          bool
    source:          str
    created_by:      Optional[int]
    created_at:      datetime
    site:            Optional[str] = None
    rh_status:       Optional[str] = None
    sites:    List[SiteAssociationResponse]    = []
    projects: List[ProjectAssociationResponse] = []
    model_config = {"from_attributes": True}

    @model_validator(mode='after')
    def compute_site(self) -> 'DeveloperResponse':
        if not self.site:
            # On essaie d'extraire le nom du site depuis les associations
            for assoc in self.sites:
                if assoc.is_primary and assoc.site_name:
                    self.site = assoc.site_name
                    break
            if not self.site and self.sites:
                # Fallback sur le premier site rattaché
                self.site = self.sites[0].site_name
        return self

class DeveloperSummary(BaseModel):
    id:              int
    gitlab_username: Optional[str]
    name:            str
    email:           Optional[str]
    is_external:     bool
    is_active:       bool
    is_validated:    bool
    is_bot:          bool
    group_ids:       List[int] = []
    primary_site_id: Optional[int] = None
    onboarding_date:  Optional[date] = None
    offboarding_date: Optional[date] = None
    rh_status:        Optional[str]  = None
    site:            Optional[str] = None
    sites:    List[SiteAssociationResponse]    = []
    projects: List[ProjectAssociationResponse] = []
    model_config = {"from_attributes": True}

    @model_validator(mode='after')
    def compute_site(self) -> 'DeveloperSummary':
        try:
            if not getattr(self, "site", None):
                # On essaie d'extraire le nom du site depuis les associations
                if hasattr(self, "sites") and self.sites:
                    for assoc in self.sites:
                        if assoc.is_primary and getattr(assoc, "site_name", None):
                            self.site = assoc.site_name
                            break
                    if not self.site and self.sites:
                        # Fallback sur le premier site rattaché
                        self.site = getattr(self.sites[0], "site_name", "Inconnu")
                else:
                    self.site = "Sans site"
        except Exception:
            self.site = "Inconnu"
        return self


# ═══════════════════════════════════════════════════════════════════════════════
#  IMPORT
# ═══════════════════════════════════════════════════════════════════════════════

class DeveloperImportRequest(BaseModel):
    default_group_id: Optional[int] = Field(default=None)
    default_site_id:  Optional[int] = Field(default=None)
    period_id:        Optional[int] = Field(default=None, description="Période cible de synchronisation (Laisser vide pour mission permanente)")
    dry_run: bool = Field(default=False)
    create_missing_sites:    bool = Field(default=False)
    create_missing_projects: bool = Field(default=False)
    # ✅ NOUVEAU v5
    create_missing_groups:   bool = Field(
        default=False,
        description=(
            "Si True : les groupes présents dans la colonne 'group' du CSV "
            "mais absents en base sont créés automatiquement "
            "(site_id=None, à compléter dans Administration → Groupes). "
            "Si False : les groupes inconnus sont ignorés et listés dans 'unknown_groups'."
        ),
    )
    full_sync: bool = Field(
        default=False,
        description="Si True : les développeurs absents du CSV seront marqués comme inactifs."
    )


class DeveloperImportRowResult(BaseModel):
    row:      int
    status:   str
    name:     Optional[str] = None
    email:    Optional[str] = None
    reason:   Optional[str] = None
    warnings: Optional[List[str]] = Field(default=None)


class DeveloperImportResponse(BaseModel):
    lot_id:          int
    status:          ImportStatusEnum
    file_name:       str
    total_rows:      int
    success_count:   int
    error_count:     int
    duplicate_count: int
    deactivated_count: int = 0
    deactivated_list: Optional[List[Dict[str, Any]]] = Field(default=None)
    dry_run:         bool
    rows: Optional[List[DeveloperImportRowResult]] = Field(default=None)

    # Entités introuvables (create_missing=False)
    unknown_sites:    Optional[List[str]] = Field(default=None)
    unknown_projects: Optional[Dict[str, Optional[int]]] = Field(default=None)
    unknown_groups:   Optional[List[str]] = Field(default=None)   # ✅ NOUVEAU

    # Entités créées automatiquement (create_missing=True)
    created_sites:    Optional[List[str]] = Field(default=None)
    created_projects: Optional[List[str]] = Field(default=None)
    created_groups:   Optional[List[str]] = Field(default=None)   # ✅ NOUVEAU

    model_config = {"from_attributes": True}


class DeveloperImportLogResponse(BaseModel):
    id:              int
    file_name:       str
    file_type:       Optional[str]
    status:          str
    total_rows:      int
    success_count:   int
    error_count:     int
    duplicate_count: int
    imported_by:     Optional[int]
    target_database: str  # ✅ AJOUT: Base de données cible
    created_at:      datetime
    model_config = {"from_attributes": True}


class TimelineEvent(BaseModel):
    date: datetime
    title: str
    description: Optional[str] = None
    icon: str
    color: str
    is_mission: Optional[bool] = False
    details: Optional[dict] = None

class PaginatedDeveloperSummary(BaseModel):
    items: List[DeveloperSummary]
    total: int
    page: int
    size: int
    pages: int


class DeveloperKpiSummary(BaseModel):
    """
    Résumé des KPIs d'un développeur (utilisé dans les exports et synthèses).
    """
    id:              int
    name:            str
    gitlab_username: Optional[str] = None
    avatar_url:      Optional[str] = None
    
    # KPIs agrégés (valeurs types)
    total_commits:   int   = 0
    total_mrs:       int   = 0
    velocity:        float = 0.0
    impact:          float = 0.0

    model_config = {"from_attributes": True}

