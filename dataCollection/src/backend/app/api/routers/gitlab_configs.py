"""api/routers/gitlab_configs.py """
import logging
from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import func
from sqlalchemy.orm import Session
from typing import List
from app.api.dependencies import get_current_admin
from app.core.security import encrypt_token, decrypt_token
from app.database.session import get_db
from app.models.app_user import AppUser
from app.models.project import Project
from app.repositories.gitlab_config_repository import GitLabConfigRepository
from app.schemas.gitlab_config import GitLabConfigCreate, GitLabConfigResponse, GitLabConfigUpdate

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/gitlab-configs", tags=["GitLab Configs"])
repo   = GitLabConfigRepository()

@router.get("", response_model=List[GitLabConfigResponse])
def list_configs(db: Session = Depends(get_db), current_admin: AppUser = Depends(get_current_admin)):
    configs = repo.get_all(db)
    counts  = dict(db.query(Project.gitlab_config_id, func.count(Project.id)).group_by(Project.gitlab_config_id).all())
    for c in configs:
        c.projects_count = counts.get(c.id, 0)
    return configs

@router.post("", response_model=GitLabConfigResponse, status_code=201)
def create_config(request: GitLabConfigCreate, db: Session = Depends(get_db), current_admin: AppUser = Depends(get_current_admin)):
    try:
        encrypted = encrypt_token(request.token)
    except ValueError as e:
        raise HTTPException(status_code=500, detail=f"Token encryption failed: {e}")
    data = request.model_dump()
    data["token"] = encrypted
    config = repo.create(db, data)
    db.commit(); db.refresh(config)
    config.projects_count = 0
    return config

@router.get("/{config_id}", response_model=GitLabConfigResponse)
def get_config(config_id: int, db: Session = Depends(get_db), current_admin: AppUser = Depends(get_current_admin)):
    config = repo.get_by_id(db, config_id)
    if not config:
        raise HTTPException(status_code=404, detail="GitLab config not found")
    config.projects_count = db.query(func.count(Project.id)).filter(Project.gitlab_config_id == config_id).scalar() or 0
    return config

@router.put("/{config_id}", response_model=GitLabConfigResponse)
def update_config(config_id: int, request: GitLabConfigUpdate, db: Session = Depends(get_db), current_admin: AppUser = Depends(get_current_admin)):
    config = repo.get_by_id(db, config_id)
    if not config:
        raise HTTPException(status_code=404, detail="GitLab config not found")
    update_data = request.model_dump(exclude_unset=True)
    if "token" in update_data:
        try:
            update_data["token"] = encrypt_token(update_data["token"])
        except ValueError as e:
            raise HTTPException(status_code=500, detail=f"Token encryption failed: {e}")
    repo.update(db, config, update_data)
    db.commit(); db.refresh(config)
    config.projects_count = db.query(func.count(Project.id)).filter(Project.gitlab_config_id == config_id).scalar() or 0
    return config

@router.delete("/{config_id}", status_code=204)
def delete_config(config_id: int, db: Session = Depends(get_db), current_admin: AppUser = Depends(get_current_admin)):
    config = repo.get_by_id(db, config_id)
    if not config:
        raise HTTPException(status_code=404, detail="GitLab config not found")
    db.delete(config); db.commit()

@router.post("/{config_id}/test", status_code=200)
async def test_config(config_id: int, db: Session = Depends(get_db), current_admin: AppUser = Depends(get_current_admin)):
    import httpx
    config = repo.get_by_id(db, config_id)
    if not config:
        raise HTTPException(status_code=404, detail="GitLab config not found")
    try:
        plain_token = decrypt_token(config.token)
    except Exception:
        raise HTTPException(status_code=500, detail="Cannot decrypt GitLab token")
    url = f"{config.domain.rstrip('/')}/api/v4/user"
    try:
        async with httpx.AsyncClient(timeout=10.0) as client:
            response = await client.get(url, headers={"PRIVATE-TOKEN": plain_token})
    except httpx.RequestError as e:
        return {"status": "error", "detail": f"Cannot reach GitLab: {e}"}
    if response.status_code == 200:
        user_data = response.json()
        return {"status": "ok", "gitlab_user": user_data.get("username"), "gitlab_url": config.domain}
    return {"status": "error", "http_status": response.status_code, "detail": response.text[:200]}