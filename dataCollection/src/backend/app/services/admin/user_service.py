"""
services/admin/user_service.py

CORRECTIONS (modèles mis à jour) :
─────────────────────────────────────
1. UserRoleEnum : 4 rôles (super_admin, site_manager, team_lead, developer).
2. create_user() : ajout site_id et group_id.
3. update_user() : ajout site_id et group_id.
4. ✅ AJOUT : support multi-sites et multi-équipes via site_ids et group_ids.
"""
import logging
from typing import List, Optional

from fastapi import HTTPException, status
from sqlalchemy.orm import Session

from app.core.security import hash_password, verify_password
from app.models.app_user import AppUser
from app.repositories.audit_log_repository import AuditLogRepository
from app.repositories.user_repository import AppUserRepository
from app.repositories.user_site_access_repository import UserSiteAccessRepository
from app.repositories.user_group_access_repository import UserGroupAccessRepository
from app.repositories.user_project_access_repository import UserProjectAccessRepository
from app.schemas.user import CreateUserRequest, UpdateUserRequest

logger = logging.getLogger(__name__)


class UserService:

    def __init__(self):
        self.user_repo  = AppUserRepository()
        self.audit_repo = AuditLogRepository()
        self.site_access_repo = UserSiteAccessRepository()
        self.group_access_repo = UserGroupAccessRepository()
        self.project_access_repo = UserProjectAccessRepository()

    def create_user(
        self,
        db:         Session,
        payload:    CreateUserRequest,
        created_by: Optional[int] = None,
        ip_address: Optional[str] = None,
    ) -> AppUser:
        """
        ✅ ARCHITECTURE MULTI-TENANT:
        - Crée l'identifiant utilisateur dans auth_db (partagé)
        - Crée les assignations multi-sites/multi-équipes dans la base tenant courante
        """
        from app.database.session import get_auth_db, get_db as get_tenant_db
        
        # 1. Vérifier doublon dans auth_db
        auth_db = next(get_auth_db())
        if self.user_repo.email_exists(auth_db, payload.email):
            auth_db.close()
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail="Un utilisateur avec cet email existe déjà.",
            )
        if payload.login and self.user_repo.get_by_login(auth_db, payload.login):
            auth_db.close()
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail="Ce login est déjà utilisé.",
            )
        
        hashed = hash_password(payload.password)
        
        # Resolve the profile ID in auth_db using the profile name from tenant db
        auth_profile_id = None
        if payload.profile_id:
            from app.models.profile import Profile
            tenant_profile = db.query(Profile).filter(Profile.id == payload.profile_id).first()
            if tenant_profile:
                auth_profile = auth_db.query(Profile).filter(Profile.name == tenant_profile.name).first()
                if auth_profile:
                    auth_profile_id = auth_profile.id

        # 2. Créer l'identifiant dans auth_db (sans site_id/group_id/project_ids)
        auth_user = self.user_repo.create_user(
            db=auth_db,
            email=payload.email,
            hashed_password=hashed,
            role=payload.role,
            login=payload.login,
            name=payload.name,
            # DISABLED: Dashboard functionality removed
            # dashboard_access=payload.dashboard_access,
            site_id=None,  # Pas de site_id dans auth_db
            group_id=None,  # Pas de group_id dans auth_db
            profile_id=auth_profile_id,
        )
        auth_db.commit()
        auth_db.refresh(auth_user)
        logger.info(f"User created in auth_db — id={auth_user.id} email={auth_user.email}")
        auth_db.close()
        
        # 3. Créer l'utilisateur dans tenant (avec métadonnées complètes)
        # ✅ FIX : Utiliser db (la base de données sélectionnée) au lieu de get_tenant_db()
        tenant_user = self.user_repo.create_user(
            db=db,
            email=payload.email,
            hashed_password=hashed,
            role=payload.role,
            login=payload.login,
            name=payload.name,
            # DISABLED: Dashboard functionality removed
            # dashboard_access=payload.dashboard_access,
            site_id=payload.site_id,  # site_id pour compatibilité
            group_id=payload.group_id,  # group_id pour compatibilité
            profile_id=payload.profile_id,
        )
        db.flush()
        
        # 4. Gérer les assignations multi-sites et multi-équipes dans tenant
        # Utiliser tenant_user.id car c'est l'ID qui existe dans la base tenant
        if payload.site_ids:
            primary_site_id = payload.site_id if payload.site_id else (payload.site_ids[0] if payload.site_ids else None)
            logger.info(f"Creating site assignments in tenant for user {tenant_user.id} with site_ids: {payload.site_ids}, primary_site_id: {primary_site_id}")
            self.site_access_repo.bulk_create(db, tenant_user.id, payload.site_ids, primary_site_id)
        
        if payload.group_ids:
            primary_group_id = payload.group_id if payload.group_id else (payload.group_ids[0] if payload.group_ids else None)
            self.group_access_repo.bulk_create(db, tenant_user.id, payload.group_ids, primary_group_id)
        
        # ✅ AJOUT : Gérer les assignations multi-projets dans tenant
        if payload.project_ids:
            primary_project_id = payload.project_ids[0] if payload.project_ids else None
            logger.info(f"Creating project assignments in tenant for user {tenant_user.id} with project_ids: {payload.project_ids}, primary_project_id: {primary_project_id}")
            self.project_access_repo.sync_smart(db, tenant_user.id, payload.project_ids, is_primary=(primary_project_id is not None))

        # 5. Audit log dans tenant (avant commit)
        tenant_user_id = tenant_user.id  # Sauvegarder l'ID avant fermeture
        tenant_user_name = tenant_user.name  # Sauvegarder le nom avant fermeture
        tenant_user_email = tenant_user.email  # Sauvegarder l'email avant fermeture
        self.audit_repo.log(
            db=db, user_id=created_by, action="CREATE_USER",
            entity_type="AppUser", entity_id=tenant_user_id,
            entity_name=tenant_user_name or tenant_user_email,
            new_value=payload.model_dump(exclude={"password", "new_password"}),
            ip_address=ip_address,
        )
        
        db.commit()
        
        logger.info(f"User created in tenant — id={tenant_user_id} email={tenant_user_email}")
        
        # ✅ ARCHITECTURE MULTI-TENANT: Charger les assignations depuis tenant pour Pydantic
        # Recharger auth_user depuis auth_db pour avoir une session active
        auth_db = next(get_auth_db())
        auth_user = auth_db.query(AppUser).filter(AppUser.id == auth_user.id).first()
        
        # Charger les assignations depuis tenant (db est la session tenant)
        try:
            site_accesses = self.site_access_repo.get_by_user_id(db, auth_user.id)
            auth_user._site_accesses = site_accesses
        except Exception:
            auth_user._site_accesses = []
        
        try:
            group_accesses = self.group_access_repo.get_by_user_id(db, auth_user.id)
            auth_user._group_accesses = group_accesses
        except Exception:
            auth_user._group_accesses = []
        
        # ✅ AJOUT : Charger les assignations de projets depuis tenant
        try:
            project_accesses = self.project_access_repo.get_by_user_id(db, auth_user.id)
            auth_user._project_accesses = project_accesses
        except Exception:
            auth_user._project_accesses = []
        
        auth_db.close()
        db.close()
        
        return auth_user  # Retourne l'utilisateur auth_db pour le token

    def get_all_users(self, db: Session) -> List[AppUser]:
        """
        ✅ ARCHITECTURE MULTI-TENANT:
        - Charge les utilisateurs depuis auth_db (partagé)
        - Charge les assignations multi-sites/multi-équipes depuis tenant et les attache manuellement
        - Si un utilisateur n'a pas d'assignations dans ce tenant, retourne des listes vides
        """
        from app.database.session import get_auth_db, get_db as get_tenant_db
        
        # 1. Charger les utilisateurs depuis auth_db
        auth_db = next(get_auth_db())
        users = self.user_repo.get_all(auth_db)
        auth_db.close()
        
        # 2. Charger les assignations depuis tenant avec une session séparée par utilisateur
        # pour éviter les erreurs de transaction en cascade
        for user in users:
            # Créer une session séparée pour chaque utilisateur pour isoler les erreurs
            tenant_db = next(get_tenant_db())
            try:
                # Trouver l'utilisateur correspondant dans tenant par email
                tenant_user = self.user_repo.get_by_email(tenant_db, user.email)
                if tenant_user:
                    # Charger les assignations de sites depuis tenant en utilisant tenant_user.id
                    site_accesses = self.site_access_repo.get_by_user_id(tenant_db, tenant_user.id)
                    # Extraire les IDs avant de fermer la session pour éviter detached instance errors
                    site_access_ids = [access.site_id for access in site_accesses]
                    user._site_accesses = site_accesses
                    user._site_access_ids = site_access_ids
                    logger.info(f"✅ User {user.id} ({user.email}): {len(site_accesses)} site accesses loaded (tenant_user.id={tenant_user.id})")
                else:
                    user._site_accesses = []
                    user._site_access_ids = []
                    logger.warning(f"⚠️ User {user.id} ({user.email}): No matching user in tenant")
            except Exception as e:
                # Si pas d'assignations dans ce tenant, utiliser une liste vide
                user._site_accesses = []
                user._site_access_ids = []
                logger.warning(f"⚠️ User {user.id} ({user.email}): No site accesses - {e}")
            
            try:
                # Trouver l'utilisateur correspondant dans tenant par email
                tenant_user = self.user_repo.get_by_email(tenant_db, user.email)
                if tenant_user:
                    # Charger les assignations de groupes depuis tenant en utilisant tenant_user.id
                    group_accesses = self.group_access_repo.get_by_user_id(tenant_db, tenant_user.id)
                    # Extraire les IDs avant de fermer la session
                    group_access_ids = [access.group_id for access in group_accesses]
                    user._group_accesses = group_accesses
                    user._group_access_ids = group_access_ids
                    logger.info(f"✅ User {user.id} ({user.email}): {len(group_accesses)} group accesses loaded (tenant_user.id={tenant_user.id})")
                else:
                    user._group_accesses = []
                    user._group_access_ids = []
            except Exception as e:
                # Si pas d'assignations dans ce tenant, utiliser une liste vide
                user._group_accesses = []
                user._group_access_ids = []
                logger.warning(f"⚠️ User {user.id} ({user.email}): No group accesses - {e}")
            
            try:
                # Trouver l'utilisateur correspondant dans tenant par email
                tenant_user = self.user_repo.get_by_email(tenant_db, user.email)
                if tenant_user:
                    # ✅ AJOUT : Charger les assignations de projets depuis tenant en utilisant tenant_user.id
                    project_accesses = self.project_access_repo.get_by_user_id(tenant_db, tenant_user.id)
                    # Extraire les IDs avant de fermer la session
                    project_access_ids = [access.project_id for access in project_accesses]
                    user._project_accesses = project_accesses
                    user._project_access_ids = project_access_ids
                    logger.info(f"✅ User {user.id} ({user.email}): {len(project_accesses)} project accesses loaded (tenant_user.id={tenant_user.id})")
                else:
                    user._project_accesses = []
                    user._project_access_ids = []
            except Exception as e:
                # Si pas d'assignations dans ce tenant, utiliser une liste vide
                user._project_accesses = []
                user._project_access_ids = []
                logger.warning(f"⚠️ User {user.id} ({user.email}): No project accesses - {e}")
            finally:
                # Toujours fermer la session pour éviter les fuites
                tenant_db.close()
        
        return users

    def get_user(self, db: Session, user_id: int) -> AppUser:
        # ✅ FIX : Chercher l'utilisateur dans auth_db (partagé) pas dans tenant
        from app.database.session import get_auth_db
        auth_db = next(get_auth_db())
        user = self.user_repo.get_by_id(auth_db, user_id)
        auth_db.close()
        if not user:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND,
                detail="Utilisateur introuvable.")
        return user

    def update_user(
        self,
        db:         Session,
        user_id:    int,
        payload:    UpdateUserRequest,
        updated_by: Optional[int] = None,
        ip_address: Optional[str] = None,
    ) -> AppUser:
        """
        ✅ ARCHITECTURE MULTI-TENANT:
        - Met à jour l'identifiant utilisateur dans auth_db (partagé)
        - Met à jour les assignations multi-sites/multi-équipes dans la base tenant courante
        """
        from app.database.session import get_auth_db, get_db as get_tenant_db
        
        # 1. Mettre à jour l'identifiant dans auth_db
        auth_db = next(get_auth_db())
        auth_user = self.user_repo.get_by_id(auth_db, user_id)
        if not auth_user:
            auth_db.close()
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND,
                detail="Utilisateur introuvable.")
        
        old_value = {
            "role": auth_user.role.value, "is_active": auth_user.is_active,
            # DISABLED: Dashboard functionality removed
            # "dashboard_access": list(auth_user.dashboard_access or []),
        }
        
        new_hashed = hash_password(payload.new_password) if payload.new_password else None
        
        # Resolve the profile ID in auth_db using the profile name from tenant db
        from app.repositories.base import UNSET
        auth_profile_id = UNSET
        if payload.profile_id is not UNSET:
            if payload.profile_id is not None:
                from app.models.profile import Profile
                tenant_profile = db.query(Profile).filter(Profile.id == payload.profile_id).first()
                if tenant_profile:
                    auth_profile = auth_db.query(Profile).filter(Profile.name == tenant_profile.name).first()
                    if auth_profile:
                        auth_profile_id = auth_profile.id
                    else:
                        auth_profile_id = None
                else:
                    auth_profile_id = None
            else:
                auth_profile_id = None

        self.user_repo.update_user(
            db=auth_db, user=auth_user,
            role=payload.role, is_active=payload.is_active,
            new_hashed_password=new_hashed,
            # DISABLED: Dashboard functionality removed
            # dashboard_access=payload.dashboard_access,
            site_id=None,  # Pas de site_id dans auth_db
            group_id=None,  # Pas de group_id dans auth_db
            profile_id=auth_profile_id,
            project_ids=None,  # Pas de project_ids dans auth_db
        )
        auth_db.commit()
        auth_db.refresh(auth_user)
        logger.info(f"User updated in auth_db — id={auth_user.id} email={auth_user.email}")
        auth_db.close()
        
        # 2. Mettre à jour l'utilisateur dans tenant (recherche par email)
        tenant_db = next(get_tenant_db())
        tenant_user = self.user_repo.get_by_email(tenant_db, auth_user.email)
        if not tenant_user:
            # Si l'utilisateur n'existe pas dans tenant, le créer
            tenant_user = self.user_repo.create_user(
                db=tenant_db,
                email=auth_user.email,
                hashed_password=auth_user.hashed_password,
                role=auth_user.role,
                login=auth_user.login,
                name=auth_user.name,
                # DISABLED: Dashboard functionality removed
                # dashboard_access=auth_user.dashboard_access,
                site_id=payload.site_id,
                group_id=payload.group_id,
                profile_id=auth_user.profile_id,
            )
            logger.info(f"User created in tenant (was missing) — id={tenant_user.id} email={tenant_user.email}")
        else:
            self.user_repo.update_user(
                db=tenant_db, user=tenant_user,
                role=payload.role, is_active=payload.is_active,
                new_hashed_password=new_hashed,
                # DISABLED: Dashboard functionality removed
                # dashboard_access=payload.dashboard_access,
                site_id=payload.site_id,
                group_id=payload.group_id,
                profile_id=payload.profile_id,
                project_ids=None,  # Géré séparément
            )
            tenant_db.flush()
        
        self.user_repo.update_user(
            db=tenant_db, user=tenant_user,
            role=payload.role, is_active=payload.is_active,
            new_hashed_password=new_hashed,
            # DISABLED: Dashboard functionality removed
            # dashboard_access=payload.dashboard_access,
            site_id=payload.site_id,  # site_id pour compatibilité
            group_id=payload.group_id,  # group_id pour compatibilité
            profile_id=payload.profile_id,
            project_ids=payload.project_ids,
        )
        
        # 3. Gérer les assignations multi-sites et multi-équipes dans tenant
        # Utiliser tenant_user.id car c'est l'ID qui existe dans la base tenant
        if payload.site_ids is not None:
            primary_site_id = payload.site_id if payload.site_id else (payload.site_ids[0] if payload.site_ids else None)
            logger.info(f"Updating site assignments in tenant for user {tenant_user.id} with site_ids: {payload.site_ids}, primary_site_id: {primary_site_id}")
            self.site_access_repo.bulk_create(tenant_db, tenant_user.id, payload.site_ids, primary_site_id)
        
        if payload.group_ids is not None:
            primary_group_id = payload.group_id if payload.group_id else (payload.group_ids[0] if payload.group_ids else None)
            self.group_access_repo.bulk_create(tenant_db, tenant_user.id, payload.group_ids, primary_group_id)

        # ✅ AJOUT : Gérer les assignations multi-projets dans tenant
        if payload.project_ids is not None:
            primary_project_id = payload.project_ids[0] if payload.project_ids else None
            logger.info(f"Updating project assignments in tenant for user {tenant_user.id} with project_ids: {payload.project_ids}, primary_project_id={primary_project_id}")
            self.project_access_repo.sync_smart(tenant_db, tenant_user.id, payload.project_ids, is_primary=(primary_project_id is not None))

        # ✅ FIX : Stocker les valeurs avant de fermer la session pour éviter DetachedInstanceError
        tenant_user_name = tenant_user.name
        tenant_user_email = tenant_user.email
        tenant_user_id = tenant_user.id
        
        # Audit log dans tenant (avant commit)
        self.audit_repo.log(
            db=tenant_db, user_id=updated_by, action="UPDATE_USER",
            entity_type="AppUser", entity_id=tenant_user_id,
            entity_name=tenant_user_name or tenant_user_email,
            old_value=old_value,
            new_value=payload.model_dump(exclude_unset=True, exclude={"new_password"}),
            ip_address=ip_address,
        )
        
        tenant_db.commit()
        
        logger.info(f"User updated in tenant — id={tenant_user_id} email={tenant_user_email}")
        
        # ✅ FIX : Charger les assignations multi-tenant pour auth_user avant de fermer la session
        try:
            site_accesses = self.site_access_repo.get_by_user_id(tenant_db, auth_user.id)
            auth_user._site_accesses = site_accesses
        except Exception:
            auth_user._site_accesses = []
        
        try:
            group_accesses = self.group_access_repo.get_by_user_id(tenant_db, auth_user.id)
            auth_user._group_accesses = group_accesses
        except Exception:
            auth_user._group_accesses = []
        
        # ✅ AJOUT : Charger les assignations de projets depuis tenant
        try:
            project_accesses = self.project_access_repo.get_by_user_id(tenant_db, auth_user.id)
            auth_user._project_accesses = project_accesses
        except Exception:
            auth_user._project_accesses = []
        
        tenant_db.close()
        
        return auth_user

    def delete_user(
        self,
        db:         Session,
        user_id:    int,
        deleted_by: Optional[int] = None,
        ip_address: Optional[str] = None,
    ) -> None:
        # Get user from auth_db (shared authentication database)
        from app.database.session import get_auth_db
        auth_db_session = next(get_auth_db())
        user = self.get_user(db, user_id)
        
        self.audit_repo.log(
            db=db, user_id=deleted_by, action="DELETE_USER",
            entity_type="AppUser", entity_id=user_id,
            entity_name=user.name or user.email,
            old_value={"email": user.email, "role": user.role.value},
            ip_address=ip_address,
        )
        
        # Delete from tenant database (gitlab_kpi1)
        db.delete(user)
        db.commit()
        
        # Also delete from auth_db (shared authentication database)
        auth_user = auth_db_session.query(AppUser).filter(AppUser.id == user_id).first()
        if auth_user:
            auth_db_session.delete(auth_user)
            auth_db_session.commit()

    # DISABLED: Dashboard functionality removed
    # def grant_dashboard_access(
    #     self,
    #     db:           Session,
    #     user_id:      int,
    #     dashboard_id: int,
    #     granted_by:   Optional[int] = None,
    #     ip_address:   Optional[str] = None,
    # ) -> AppUser:
    #     user = self.get_user(db, user_id)
    #     old_access = list(user.dashboard_access or [])
    #     self.user_repo.add_dashboard_access(db, user, dashboard_id)
    #     self.audit_repo.log(
    #         db=db, user_id=granted_by, action="UPDATE_USER_ACCESS",
    #         entity_type="AppUser", entity_id=user_id,
    #         old_value={"dashboard_access": old_access},
    #         new_value={"dashboard_access": list(user.dashboard_access or [])},
    #         ip_address=ip_address,
    #     )
    #     db.commit()
    #     db.refresh(user)
    #     return user

    # def revoke_dashboard_access(
    #     self,
    #     db:           Session,
    #     user_id:      int,
    #     dashboard_id: int,
    #     revoked_by:   Optional[int] = None,
    #     ip_address:   Optional[str] = None,
    # ) -> AppUser:
    #     user = self.get_user(db, user_id)
    #     old_access = list(user.dashboard_access or [])
    #     self.user_repo.remove_dashboard_access(db, user, dashboard_id)
    #     self.audit_repo.log(
    #         db=db, user_id=revoked_by, action="UPDATE_USER_ACCESS",
    #         entity_type="AppUser", entity_id=user_id,
    #         old_value={"dashboard_access": old_access},
    #         new_value={"dashboard_access": list(user.dashboard_access or [])},
    #         ip_address=ip_address,
    #     )
    #     db.commit()

    def change_password(
        self, db: Session, user_id: int,
        current_password: str, new_password: str, confirm_password: str,
    ) -> None:
        if new_password != confirm_password:
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST,
                detail="Les nouveaux mots de passe ne correspondent pas.")
        
        # ✅ FIX : Utiliser auth_db directement sans passer par get_user pour éviter de casser les autres fonctionnalités
        from app.database.session import get_auth_db
        from app.repositories.user_repository import AppUserRepository
        user_repo = AppUserRepository()
        
        # 1. Mettre à jour le mot de passe dans auth_db
        auth_db = next(get_auth_db())
        auth_user = user_repo.get_by_id(auth_db, user_id)
        if not auth_user:
            auth_db.close()
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND,
                detail="Utilisateur introuvable.")
        
        if not verify_password(current_password, auth_user.hashed_password):
            auth_db.close()
            raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED,
                detail="Mot de passe actuel incorrect.")
        
        new_hashed = hash_password(new_password)
        user_repo.update_user(db=auth_db, user=auth_user, new_hashed_password=new_hashed)
        auth_db.commit()
        logger.info(f"Password updated in auth_db — id={auth_user.id} email={auth_user.email}")
        auth_db.close()
        
        # 2. Mettre à jour le mot de passe dans tenant_db (recherche par email)
        tenant_db = next(get_tenant_db())
        tenant_user = user_repo.get_by_email(tenant_db, auth_user.email)
        if tenant_user:
            user_repo.update_user(db=tenant_db, user=tenant_user, new_hashed_password=new_hashed)
            tenant_db.commit()
            logger.info(f"Password updated in tenant_db — id={tenant_user.id} email={tenant_user.email}")
        else:
            logger.warning(f"User not found in tenant_db for password update — email={auth_user.email}")
        
        tenant_db.close()