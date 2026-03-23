"""api/routers/admin_users.py — inchangé fonctionnellement."""
import logging
from fastapi import APIRouter, Depends, HTTPException, Request, status
from sqlalchemy.orm import Session
from typing import List
from app.database.session import get_db
from app.api.dependencies import get_current_admin, get_current_user
from app.models.app_user import AppUser
from app.services.admin.user_service import UserService
from app.schemas.user import ChangePasswordRequest, CreateUserRequest, UpdateUserRequest, UserManagementResponse

logger  = logging.getLogger(__name__)
router  = APIRouter(tags=["User Management"])
service = UserService()

@router.get("/admin/users", response_model=List[UserManagementResponse])
def list_users(db: Session = Depends(get_db), current_admin: AppUser = Depends(get_current_admin)):
    return service.get_all_users(db)

@router.post("/admin/users", response_model=UserManagementResponse, status_code=status.HTTP_201_CREATED)
def create_user(request: CreateUserRequest, req: Request, db: Session = Depends(get_db), current_admin: AppUser = Depends(get_current_admin)):
    return service.create_user(db=db, payload=request, created_by=current_admin.id, ip_address=req.client.host if req.client else None)

@router.put("/admin/users/{user_id}", response_model=UserManagementResponse)
def update_user(user_id: int, request: UpdateUserRequest, req: Request, db: Session = Depends(get_db), current_admin: AppUser = Depends(get_current_admin)):
    user = service.get_user(db, user_id)
    if user.id == current_admin.id and request.is_active is False:
        raise HTTPException(status_code=400, detail="You cannot deactivate your own account")
    if user.id == current_admin.id and request.role and str(request.role) == "user":
        raise HTTPException(status_code=400, detail="You cannot downgrade your own admin role")
    return service.update_user(db=db, user_id=user_id, payload=request, updated_by=current_admin.id, ip_address=req.client.host if req.client else None)

@router.delete("/admin/users/{user_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_user(user_id: int, req: Request, db: Session = Depends(get_db), current_admin: AppUser = Depends(get_current_admin)):
    user = service.get_user(db, user_id)
    if user.id == current_admin.id:
        raise HTTPException(status_code=400, detail="You cannot delete your own account")
    service.delete_user(db=db, user_id=user_id, deleted_by=current_admin.id, ip_address=req.client.host if req.client else None)

@router.post("/admin/users/{user_id}/dashboard-access/{dashboard_id}", response_model=UserManagementResponse)
def grant_dashboard_access(user_id: int, dashboard_id: int, req: Request, db: Session = Depends(get_db), current_admin: AppUser = Depends(get_current_admin)):
    return service.grant_dashboard_access(db=db, user_id=user_id, dashboard_id=dashboard_id, granted_by=current_admin.id, ip_address=req.client.host if req.client else None)

@router.delete("/admin/users/{user_id}/dashboard-access/{dashboard_id}", response_model=UserManagementResponse)
def revoke_dashboard_access(user_id: int, dashboard_id: int, req: Request, db: Session = Depends(get_db), current_admin: AppUser = Depends(get_current_admin)):
    return service.revoke_dashboard_access(db=db, user_id=user_id, dashboard_id=dashboard_id, revoked_by=current_admin.id, ip_address=req.client.host if req.client else None)

@router.get("/users/me", response_model=UserManagementResponse)
def get_my_profile(current_user: AppUser = Depends(get_current_user)):
    return current_user

@router.put("/users/me/password", status_code=200)
def change_my_password(request: ChangePasswordRequest, db: Session = Depends(get_db), current_user: AppUser = Depends(get_current_user)):
    service.change_password(db=db, user_id=current_user.id, current_password=request.current_password, new_password=request.new_password, confirm_password=request.confirm_password)
    return {"message": "Password updated successfully"}