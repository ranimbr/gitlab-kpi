"""
api/routers/developers.py

"""
import logging
from typing import List, Optional

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session

from app.api.dependencies import get_current_admin, get_current_user
from app.database.session import get_db
from app.models.app_user import AppUser
from app.repositories.developer_repository import DeveloperGroupRepository, DeveloperRepository
from app.schemas.developer import (
    DeveloperCreate,
    DeveloperGroupCreate,
    DeveloperGroupResponse,
    DeveloperGroupUpdate,
    DeveloperResponse,
    DeveloperUpdate,
    DeveloperValidate,
)

logger     = logging.getLogger(__name__)
router     = APIRouter(tags=["Developers"])
dev_repo   = DeveloperRepository()
group_repo = DeveloperGroupRepository()


# ─── Developer Groups ─────────────────────────────────────────────────────────

@router.get("/developer-groups", response_model=List[DeveloperGroupResponse])
def list_groups(
    db:           Session       = Depends(get_db),
    current_user: AppUser       = Depends(get_current_user),
    project_id:   Optional[int] = Query(default=None),
):
    if project_id:
        return group_repo.get_project_groups(db, project_id)
    return group_repo.get_all(db)


@router.post("/developer-groups", response_model=DeveloperGroupResponse, status_code=201)
def create_group(
    request:       DeveloperGroupCreate,
    db:            Session = Depends(get_db),
    current_admin: AppUser = Depends(get_current_admin),
):
    group = group_repo.create(db, request.model_dump())
    db.commit()
    db.refresh(group)
    return group


@router.put("/developer-groups/{group_id}", response_model=DeveloperGroupResponse)
def update_group(
    group_id:      int,
    request:       DeveloperGroupUpdate,
    db:            Session = Depends(get_db),
    current_admin: AppUser = Depends(get_current_admin),
):
    group = group_repo.get_by_id(db, group_id)
    if not group:
        raise HTTPException(status_code=404, detail="Developer group not found")
    # ✅ FIX : exclude_unset=True
    group_repo.update(db, group, request.model_dump(exclude_unset=True))
    db.commit()
    db.refresh(group)
    return group


@router.delete("/developer-groups/{group_id}", status_code=204)
def delete_group(
    group_id:      int,
    db:            Session = Depends(get_db),
    current_admin: AppUser = Depends(get_current_admin),
):
    group = group_repo.get_by_id(db, group_id)
    if not group:
        raise HTTPException(status_code=404, detail="Developer group not found")
    db.delete(group)
    db.commit()


# ─── Developers ───────────────────────────────────────────────────────────────

@router.get("/developers", response_model=List[DeveloperResponse])
def list_developers(
    db:           Session       = Depends(get_db),
    current_user: AppUser       = Depends(get_current_user),
    project_id:   Optional[int] = Query(default=None),
    site_id:      Optional[int] = Query(default=None),
    tab: str = Query(
        default="validated",
        description=(
            "validated = devs validés (pour KPIs) | "
            "pending = à valider | "
            "bots = bots détectés | "
            "all = tous"
        ),
    ),
):
    return dev_repo.get_by_tab(db=db, tab=tab, project_id=project_id, site_id=site_id)


@router.get("/developers/summary")
def developers_summary(
    db:           Session       = Depends(get_db),
    current_user: AppUser       = Depends(get_current_user),
    project_id:   Optional[int] = Query(default=None),
):
    """Compteurs par onglet — badges de la page Développeurs."""
    return dev_repo.get_summary(db, project_id)


@router.get("/developers/{developer_id}", response_model=DeveloperResponse)
def get_developer(
    developer_id: int,
    db:           Session = Depends(get_db),
    _:            AppUser = Depends(get_current_user),
):
    developer = dev_repo.get_by_id(db, developer_id)
    if not developer:
        raise HTTPException(status_code=404, detail="Developer not found")
    return developer


@router.post("/developers", response_model=DeveloperResponse, status_code=201)
def create_developer(
    request:       DeveloperCreate,
    db:            Session = Depends(get_db),
    current_admin: AppUser = Depends(get_current_admin),
):
    """Création manuelle — is_validated=True et source='manual' forcés."""
    data = request.model_dump()
    data["created_by"]   = current_admin.id
    data["is_validated"] = True
    data["is_bot"]       = False
    data["source"]       = "manual"

    developer = dev_repo.create(db, data)
    db.commit()
    db.refresh(developer)
    logger.info(
        f"Developer created manually — id={developer.id} "
        f"username={developer.username} by admin={current_admin.id}"
    )
    return developer


@router.patch("/developers/{developer_id}/validate", response_model=DeveloperResponse)
def validate_developer(
    developer_id:  int,
    request:       DeveloperValidate,
    db:            Session = Depends(get_db),
    current_admin: AppUser = Depends(get_current_admin),
):
    """
    Valide ou rejette un contributeur extrait de GitLab.
    Peut aussi assigner site_id et group_id au même moment.
    """
    developer = dev_repo.get_by_id(db, developer_id)
    if not developer:
        raise HTTPException(status_code=404, detail="Developer not found")

    update_data: dict = {"is_validated": request.is_validated}
    if request.is_bot   is not None: update_data["is_bot"]   = request.is_bot
    if request.site_id  is not None: update_data["site_id"]  = request.site_id
    if request.group_id is not None: update_data["group_id"] = request.group_id

    dev_repo.update(db, developer, update_data)
    db.commit()
    db.refresh(developer)

    action = "validated" if request.is_validated else "rejected"
    logger.info(
        f"Developer {action} — id={developer_id} "
        f"username={developer.username} by admin={current_admin.id}"
    )
    return developer


@router.put("/developers/{developer_id}", response_model=DeveloperResponse)
def update_developer(
    developer_id:  int,
    request:       DeveloperUpdate,
    db:            Session = Depends(get_db),
    current_admin: AppUser = Depends(get_current_admin),
):
    developer = dev_repo.get_by_id(db, developer_id)
    if not developer:
        raise HTTPException(status_code=404, detail="Developer not found")
    # ✅ FIX : exclude_unset=True
    dev_repo.update(db, developer, request.model_dump(exclude_unset=True))
    db.commit()
    db.refresh(developer)
    return developer


@router.delete("/developers/{developer_id}", status_code=204)
def delete_developer(
    developer_id:  int,
    db:            Session = Depends(get_db),
    current_admin: AppUser = Depends(get_current_admin),
):
    developer = dev_repo.get_by_id(db, developer_id)
    if not developer:
        raise HTTPException(status_code=404, detail="Developer not found")
    db.delete(developer)
    db.commit()