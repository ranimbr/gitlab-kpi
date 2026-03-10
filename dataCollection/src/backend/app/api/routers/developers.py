from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session
from typing import List, Optional

from app.database.session import get_db
from app.api.dependencies import get_current_user, get_current_admin
from app.schemas.developer import (
    DeveloperCreate, DeveloperUpdate, DeveloperResponse,
    DeveloperGroupCreate, DeveloperGroupResponse
)
from app.repositories.developer_repository import (
    DeveloperRepository, DeveloperGroupRepository
)
from app.models.app_user import AppUser

router     = APIRouter(tags=["Developers"])
dev_repo   = DeveloperRepository()
group_repo = DeveloperGroupRepository()


# ─── Developer Groups ─────────────────────────────────────────────────────────

@router.get("/developer-groups", response_model=List[DeveloperGroupResponse])
def list_groups(
    db          : Session = Depends(get_db),
    current_user: AppUser = Depends(get_current_user),
    project_id  : Optional[int] = Query(default=None)
):
    if project_id:
        return group_repo.get_project_groups(db, project_id)
    return group_repo.get_all(db)


@router.post("/developer-groups", response_model=DeveloperGroupResponse, status_code=201)
def create_group(
    request      : DeveloperGroupCreate,
    db           : Session = Depends(get_db),
    current_admin: AppUser = Depends(get_current_admin)
):
    group = group_repo.create(db, request.model_dump())
    db.commit()
    db.refresh(group)
    return group


@router.put("/developer-groups/{group_id}", response_model=DeveloperGroupResponse)
def update_group(
    group_id     : int,
    request      : DeveloperGroupCreate,
    db           : Session = Depends(get_db),
    current_admin: AppUser = Depends(get_current_admin)
):
    group = group_repo.get_by_id(db, group_id)
    if not group:
        raise HTTPException(status_code=404, detail="Developer group not found")
    group_repo.update(db, group, request.model_dump(exclude_none=True))
    db.commit()
    db.refresh(group)
    return group


@router.delete("/developer-groups/{group_id}", status_code=204)
def delete_group(
    group_id     : int,
    db           : Session = Depends(get_db),
    current_admin: AppUser = Depends(get_current_admin)
):
    group = group_repo.get_by_id(db, group_id)
    if not group:
        raise HTTPException(status_code=404, detail="Developer group not found")
    db.delete(group)
    db.commit()


# ─── Developers ───────────────────────────────────────────────────────────────

@router.get("/developers", response_model=List[DeveloperResponse])
def list_developers(
    db          : Session = Depends(get_db),
    current_user: AppUser = Depends(get_current_user),
    project_id  : Optional[int] = Query(default=None),
    site        : Optional[str] = Query(default=None)
):
    if project_id and site:
        return dev_repo.get_by_site(db, site, project_id)
    if project_id:
        return dev_repo.get_project_developers(db, project_id)
    return dev_repo.get_all(db)


@router.get("/developers/{developer_id}", response_model=DeveloperResponse)
def get_developer(
    developer_id: int,
    db          : Session = Depends(get_db),
    _           : AppUser = Depends(get_current_user)
):
    developer = dev_repo.get_by_id(db, developer_id)
    if not developer:
        raise HTTPException(status_code=404, detail="Developer not found")
    return developer


@router.post("/developers", response_model=DeveloperResponse, status_code=201)
def create_developer(
    request      : DeveloperCreate,
    db           : Session = Depends(get_db),
    current_admin: AppUser = Depends(get_current_admin)
):
    developer = dev_repo.create(db, request.model_dump())
    db.commit()
    db.refresh(developer)
    return developer


@router.put("/developers/{developer_id}", response_model=DeveloperResponse)
def update_developer(
    developer_id : int,
    request      : DeveloperUpdate,
    db           : Session = Depends(get_db),
    current_admin: AppUser = Depends(get_current_admin)
):
    developer = dev_repo.get_by_id(db, developer_id)
    if not developer:
        raise HTTPException(status_code=404, detail="Developer not found")
    dev_repo.update(db, developer, request.model_dump(exclude_none=True))
    db.commit()
    db.refresh(developer)
    return developer


@router.delete("/developers/{developer_id}", status_code=204)
def delete_developer(
    developer_id : int,
    db           : Session = Depends(get_db),
    current_admin: AppUser = Depends(get_current_admin)
):
    developer = dev_repo.get_by_id(db, developer_id)
    if not developer:
        raise HTTPException(status_code=404, detail="Developer not found")
    db.delete(developer)
    db.commit()