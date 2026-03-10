from pydantic import BaseModel, Field, model_validator
from typing import Optional, Literal
from datetime import datetime

# ─── Enum des KPIs valides (validation automatique Pydantic) ─────────────────
# [FIX] Utilisation de Literal au lieu de str pour validation auto côté schema.
# Pydantic rejettera tout kpi_name non listé avec une erreur 422 claire.

KPI_NAME_TYPE = Literal[
    "mr_rate_per_site",
    "approved_mr_rate",
    "merged_mr_rate",
    "commit_rate_per_site",
    "nb_commits_per_project",
    "avg_review_time_hours",
]

# KPIs où une valeur haute est mauvaise (warning < critical)
# ex: avg_review_time_hours=48 → warning, avg_review_time_hours=72 → critical
HIGHER_IS_WORSE = {"avg_review_time_hours"}

# KPIs où une valeur basse est mauvaise (warning > critical)
# ex: approved_mr_rate=0.5 → warning, approved_mr_rate=0.3 → critical
LOWER_IS_WORSE = {
    "approved_mr_rate",
    "merged_mr_rate",
    "mr_rate_per_site",
    "commit_rate_per_site",
}


# ─── Création ────────────────────────────────────────────────────────────────

class KpiThresholdCreate(BaseModel):
    kpi_name: KPI_NAME_TYPE = Field(
        description=(
            "Nom du KPI. Valeurs acceptées : "
            "mr_rate_per_site, approved_mr_rate, merged_mr_rate, "
            "commit_rate_per_site, nb_commits_per_project, avg_review_time_hours"
        )
    )
    warning_value:  float = Field(gt=0, description="Seuil d'avertissement 🟡")
    critical_value: float = Field(gt=0, description="Seuil critique 🔴")
    project_id:     int

    @model_validator(mode="after")
    def validate_threshold_order(self) -> "KpiThresholdCreate":
        """
        Vérifie que warning et critical sont dans le bon ordre selon le KPI.

        - HIGHER_IS_WORSE : warning_value < critical_value
          (ex: avg_review_time → 48h en warning, 72h en critical)

        - LOWER_IS_WORSE  : warning_value > critical_value
          (ex: approved_mr_rate → 0.5 en warning, 0.3 en critical)
        """
        kpi = self.kpi_name
        w   = self.warning_value
        c   = self.critical_value

        if kpi in HIGHER_IS_WORSE:
            if w >= c:
                raise ValueError(
                    f"Pour '{kpi}' (plus grand = pire), "
                    f"warning_value ({w}) doit être < critical_value ({c})."
                )
        elif kpi in LOWER_IS_WORSE:
            if w <= c:
                raise ValueError(
                    f"Pour '{kpi}' (plus petit = pire), "
                    f"warning_value ({w}) doit être > critical_value ({c})."
                )

        return self


# ─── Mise à jour ─────────────────────────────────────────────────────────────

class KpiThresholdUpdate(BaseModel):
    warning_value:  Optional[float] = Field(default=None, gt=0)
    critical_value: Optional[float] = Field(default=None, gt=0)

    # Note : la validation d'ordre warning/critical lors d'un PATCH partiel
    # est gérée dans ThresholdService.update_threshold() car on a besoin
    # de connaître le kpi_name de l'entrée existante.


# ─── Réponse ─────────────────────────────────────────────────────────────────

class KpiThresholdResponse(BaseModel):
    id:             int
    kpi_name:       str
    warning_value:  float
    critical_value: float
    project_id:     int
    created_by:     Optional[int]
    created_at:     datetime  # [FIX] maintenant présent dans le model

    class Config:
        from_attributes = True


# ─── Évaluation d'un KPI par rapport aux seuils ──────────────────────────────

class KpiAlertLevel(BaseModel):
    """
    Résultat de l'évaluation d'une valeur KPI contre ses seuils.
    Utilisé par le frontend pour afficher la couleur correcte 🟢🟡🔴.
    """
    kpi_name:       str
    value:          Optional[float]  # [FIX] Optional pour gérer value=None
    warning_value:  float
    critical_value: float
    level:          str   # "ok" | "warning" | "critical" | "unknown"
    color:          str   # "green" | "yellow" | "red" | "gray"
