"""
api/routers/auth.py

"""
import logging
import threading
import time
from datetime import timedelta

from fastapi import APIRouter, Depends, HTTPException, Request, status
from sqlalchemy.orm import Session

from app.api.dependencies import get_current_user
from app.core.config import get_settings
from app.core.security import create_access_token, hash_password, verify_password, get_auth_db, decode_access_token
from app.core.email_service import get_email_service
from app.database.session import get_db
from app.models.app_user import AppUser
from app.repositories.user_repository import AppUserRepository
from app.schemas.auth import LoginRequest, RegisterRequest, TokenResponse, UserResponse, ForgotPasswordRequest, ResetPasswordRequest

logger   = logging.getLogger(__name__)
router   = APIRouter(prefix="/auth", tags=["Auth"])
settings = get_settings()
repo     = AppUserRepository()
_LOGIN_ATTEMPTS = {}
_LOGIN_GUARD = threading.Lock()


def _http_error(status_code: int, code: str, message: str) -> HTTPException:
    return HTTPException(status_code=status_code, detail=f"{code}: {message}")


def _login_bucket_key(request: Request, login_hint: str) -> str:
    client_ip = request.client.host if request.client else "unknown"
    return f"{client_ip}:{login_hint.lower().strip()}"


def _is_rate_limited(key: str, max_attempts: int, lock_seconds: int) -> bool:
    now = time.time()
    with _LOGIN_GUARD:
        state = _LOGIN_ATTEMPTS.get(key)
        if not state:
            return False
        if state.get("locked_until", 0) > now:
            return True
        if now - state.get("window_start", now) > lock_seconds:
            _LOGIN_ATTEMPTS.pop(key, None)
            return False
    return False


def _register_failed_attempt(key: str, max_attempts: int, lock_seconds: int) -> None:
    now = time.time()
    with _LOGIN_GUARD:
        state = _LOGIN_ATTEMPTS.get(key)
        if not state or now - state.get("window_start", now) > lock_seconds:
            state = {"count": 0, "window_start": now, "locked_until": 0}
            _LOGIN_ATTEMPTS[key] = state
        state["count"] += 1
        if state["count"] >= max_attempts:
            state["locked_until"] = now + lock_seconds


def _reset_attempts(key: str) -> None:
    with _LOGIN_GUARD:
        _LOGIN_ATTEMPTS.pop(key, None)


@router.post("/register", response_model=UserResponse, status_code=201)
def register(request: RegisterRequest, db: Session = Depends(get_auth_db)):
    if repo.email_exists(db, request.email):
        raise _http_error(400, "AUTH_EMAIL_ALREADY_REGISTERED", "Email already registered")

    if request.login and repo.get_by_login(db, request.login):
        raise _http_error(400, "AUTH_LOGIN_ALREADY_TAKEN", "Login already taken")

    # ✅ FIX : hash dans le router — pas de mot de passe en clair dans le repo
    hashed = hash_password(request.password)

    user = repo.create_user(
        db              = db,
        email           = request.email,
        hashed_password = hashed,
        login           = request.login,
        name            = request.name,
    )
    db.commit()
    db.refresh(user)
    logger.info(f"User registered — id={user.id} email={user.email}")
    return user


@router.post("/login", response_model=TokenResponse)
def login(request: LoginRequest, raw_request: Request, db: Session = Depends(get_auth_db)):
    user = None
    max_attempts = max(1, settings.LOGIN_MAX_ATTEMPTS)
    lock_seconds = max(1, settings.LOGIN_LOCK_SECONDS)
    login_hint = request.username or request.email or "unknown"
    bucket_key = _login_bucket_key(raw_request, login_hint)

    if _is_rate_limited(bucket_key, max_attempts=max_attempts, lock_seconds=lock_seconds):
        raise _http_error(429, "AUTH_TOO_MANY_ATTEMPTS", "Too many login attempts. Retry later.")

    # ✅ ARCHITECTURE MULTI-TENANT: Authentification uniquement dans auth_db
    # Lookup par email (prioritaire)
    if request.email:
        user = repo.get_by_email(db, request.email)

    # Fallback sur username/login
    if not user and request.username:
        user = repo.get_by_login(db, request.username)

    # Fallback : email fourni sans @  → traité comme login
    if not user and request.email and "@" not in request.email:
        user = repo.get_by_login(db, request.email)

    if not user or not verify_password(request.password, user.hashed_password):
        _register_failed_attempt(bucket_key, max_attempts=max_attempts, lock_seconds=lock_seconds)
        raise _http_error(status.HTTP_401_UNAUTHORIZED, "AUTH_INVALID_CREDENTIALS", "Invalid credentials")

    if not user.is_active:
        _register_failed_attempt(bucket_key, max_attempts=max_attempts, lock_seconds=lock_seconds)
        raise _http_error(status.HTTP_403_FORBIDDEN, "AUTH_USER_INACTIVE", "User account is inactive")

    # ✅ OPTIMISATION: Charger les données tenant de manière asynchrone en arrière-plan
    # Le login retourne immédiatement avec les données auth_db, les données tenant sont chargées via /auth/me
    # Cela réduit le temps de réponse du login de ~5-10s à ~1-2s
    import threading
    def load_tenant_data_background(user_id):
        try:
            from app.database.session import get_db as get_tenant_db
            from app.repositories.user_site_access_repository import UserSiteAccessRepository
            from app.repositories.user_group_access_repository import UserGroupAccessRepository
            from app.repositories.user_project_access_repository import UserProjectAccessRepository
            
            tenant_db = next(get_tenant_db())
            tenant_user = repo.get_by_id(tenant_db, user_id)
            if tenant_user:
                # Fusionner les données tenant avec l'utilisateur auth
                user.site_id = tenant_user.site_id
                user.group_id = tenant_user.group_id
                
                # Charger les assignations depuis les tables d'accès multi-tenant
                site_access_repo = UserSiteAccessRepository()
                group_access_repo = UserGroupAccessRepository()
                project_access_repo = UserProjectAccessRepository()
                
                try:
                    site_accesses = site_access_repo.get_by_user_id(tenant_db, user_id)
                    user._site_accesses = site_accesses
                except Exception:
                    user._site_accesses = []
                
                try:
                    group_accesses = group_access_repo.get_by_user_id(tenant_db, user_id)
                    user._group_accesses = group_accesses
                except Exception:
                    user._group_accesses = []
                
                try:
                    project_accesses = project_access_repo.get_by_user_id(tenant_db, user_id)
                    user._project_accesses = project_accesses
                except Exception:
                    user._project_accesses = []
            tenant_db.close()
            logger.info(f"Background tenant data loaded for user {user_id}")
        except Exception as e:
            logger.warning(f"Failed to load tenant data in background for user {user_id}: {e}")
    
    # Lancer le chargement en arrière-plan
    thread = threading.Thread(target=load_tenant_data_background, args=(user.id,))
    thread.daemon = True
    thread.start()

    access_token = create_access_token(
        data           = {
            "sub": str(user.id), 
            "role": user.role,
            "name": user.name,
            "email": user.email,
            "site_id": user.site_id,
            "group_id": user.group_id,
            "project_ids": user.project_ids if user.is_project_manager else None
        },
        expires_delta  = timedelta(minutes=settings.ACCESS_TOKEN_EXPIRE_MINUTES),
    )

    _reset_attempts(bucket_key)
    logger.info(f"Login success — user id={user.id} role={user.role}")
    return TokenResponse(
        access_token = access_token,
        expires_in   = settings.ACCESS_TOKEN_EXPIRE_MINUTES * 60,
    )


@router.get("/me", response_model=UserResponse)
def get_me(current_user: AppUser = Depends(get_current_user), db: Session = Depends(get_db)):
    """Récupère l'utilisateur courant avec ses assignations multi-tenant."""
    from app.repositories.user_site_access_repository import UserSiteAccessRepository
    from app.repositories.user_group_access_repository import UserGroupAccessRepository
    from app.repositories.user_project_access_repository import UserProjectAccessRepository
    from app.repositories.user_repository import AppUserRepository

    user_repo = AppUserRepository()

    # Récupérer le tenant_user par email
    tenant_user = user_repo.get_by_email(db, current_user.email)
    if tenant_user:
        # Fusionner les données tenant avec l'utilisateur courant
        current_user.site_id = tenant_user.site_id
        current_user.group_id = tenant_user.group_id

        # Charger les assignations multi-tenant
        site_access_repo = UserSiteAccessRepository()
        group_access_repo = UserGroupAccessRepository()
        project_access_repo = UserProjectAccessRepository()

        try:
            site_accesses = site_access_repo.get_by_user_id(db, tenant_user.id)
            # Utiliser l'attribut temporaire _site_access_ids pour la propriété calculée
            current_user._site_access_ids = [access.site_id for access in site_accesses]
        except Exception:
            current_user._site_access_ids = []

        try:
            group_accesses = group_access_repo.get_by_user_id(db, tenant_user.id)
            # Utiliser l'attribut temporaire _group_access_ids pour la propriété calculée
            current_user._group_access_ids = [access.group_id for access in group_accesses]
        except Exception:
            current_user._group_access_ids = []

        try:
            project_accesses = project_access_repo.get_by_user_id(db, tenant_user.id)
            # Utiliser l'attribut temporaire _project_access_ids pour la propriété calculée
            current_user._project_access_ids = [access.project_id for access in project_accesses]
        except Exception:
            current_user._project_access_ids = []

    return current_user


@router.get("/assignments")
def get_user_assignments(
    current_user: AppUser = Depends(get_current_user),
):
    """Récupère les assignations multi-tenant de l'utilisateur courant."""
    from app.database.session import get_db as get_tenant_db
    from app.repositories.user_site_access_repository import UserSiteAccessRepository
    from app.repositories.user_group_access_repository import UserGroupAccessRepository
    from app.repositories.user_project_access_repository import UserProjectAccessRepository
    from app.repositories.user_repository import AppUserRepository
    import logging
    logger = logging.getLogger(__name__)
    
    user_repo = AppUserRepository()
    
    logger.info(f"[DEBUG /assignments] current_user.id={current_user.id}, current_user.email={current_user.email}")
    
    # Get tenant database connection
    tenant_db = next(get_tenant_db())
    
    # Récupérer le tenant_user par email
    tenant_user = user_repo.get_by_email(tenant_db, current_user.email)
    if not tenant_user:
        logger.warning(f"[DEBUG /assignments] No tenant_user found for email={current_user.email}")
        return {"site_ids": [], "group_ids": [], "project_ids": []}
    
    logger.info(f"[DEBUG /assignments] tenant_user.id={tenant_user.id}, tenant_user.site_id={tenant_user.site_id}")
    
    site_access_repo = UserSiteAccessRepository()
    group_access_repo = UserGroupAccessRepository()
    project_access_repo = UserProjectAccessRepository()
    
    # Récupérer les assignations depuis tenant avec tenant_user.id
    site_accesses = site_access_repo.get_by_user_id(tenant_db, tenant_user.id)
    group_accesses = group_access_repo.get_by_user_id(tenant_db, tenant_user.id)
    project_accesses = project_access_repo.get_by_user_id(tenant_db, tenant_user.id)
    
    logger.info(f"[DEBUG /assignments] site_accesses={len(site_accesses)}, group_accesses={len(group_accesses)}, project_accesses={len(project_accesses)}")
    
    result = {
        "site_ids": [access.site_id for access in site_accesses],
        "group_ids": [access.group_id for access in group_accesses],
        "project_ids": [access.project_id for access in project_accesses]
    }
    
    logger.info(f"[DEBUG /assignments] Returning: {result}")
    return result


@router.post("/forgot-password")
def forgot_password(request: ForgotPasswordRequest, db: Session = Depends(get_auth_db)):
    """
    Envoie un email de réinitialisation de mot de passe.
    
    Pour des raisons de sécurité, ne révèle jamais si un email existe ou non.
    """
    user = repo.get_by_email(db, request.email)
    
    if not user:
        # Pour des raisons de sécurité, on ne révèle pas si l'email existe
        logger.info(f"Forgot password requested for non-existent email: {request.email}")
        return {"message": "Si un compte existe avec cet email, vous recevrez des instructions."}
    
    if not user.is_active:
        logger.warning(f"Forgot password requested for inactive user: {request.email}")
        return {"message": "Si un compte existe avec cet email, vous recevrez des instructions."}
    
    # Générer un token JWT avec expiration courte (30 minutes)
    reset_token = create_access_token(
        data={"sub": str(user.id), "email": user.email, "type": "password_reset"},
        expires_delta=timedelta(minutes=30)
    )
    
    # Construire le lien de réinitialisation
    frontend_url = settings.FRONTEND_URL
    reset_link = f"{frontend_url}/reset-password?token={reset_token}"
    
    # Envoyer l'email
    email_service = get_email_service()
    email_sent = email_service.send_password_reset_email(
        to_email=user.email,
        reset_link=reset_link,
        to_name=user.name,
        expiry_minutes=30
    )
    
    if email_sent:
        logger.info(f"Password reset email sent to {user.email}")
        return {"message": "Si un compte existe avec cet email, vous recevrez des instructions."}
    else:
        logger.error(f"Failed to send password reset email to {user.email}")
        raise _http_error(500, "AUTH_EMAIL_SEND_FAILED", "Failed to send reset email")


@router.post("/reset-password")
def reset_password(request: ResetPasswordRequest, db: Session = Depends(get_auth_db)):
    """
    Réinitialise le mot de passe avec un token valide.
    """
    # Décoder et valider le token
    payload = decode_access_token(request.token)
    
    if payload is None:
        raise _http_error(400, "AUTH_INVALID_TOKEN", "Token invalide ou expiré")
    
    # Vérifier que c'est un token de reset de mot de passe
    if payload.get("type") != "password_reset":
        raise _http_error(400, "AUTH_INVALID_TOKEN_TYPE", "Type de token invalide")
    
    user_id = payload.get("sub")
    if user_id is None:
        raise _http_error(400, "AUTH_TOKEN_PAYLOAD_INVALID", "Token payload invalide")
    
    try:
        user_id = int(user_id)
    except (TypeError, ValueError):
        raise _http_error(400, "AUTH_TOKEN_USER_ID_INVALID", "ID utilisateur invalide")
    
    # Récupérer l'utilisateur
    user = repo.get_by_id(db, user_id)
    
    if user is None:
        raise _http_error(404, "AUTH_USER_NOT_FOUND", "Utilisateur non trouvé")
    
    if not user.is_active:
        raise _http_error(403, "AUTH_USER_INACTIVE", "Compte utilisateur inactif")
    
    # Hasher le nouveau mot de passe
    hashed = hash_password(request.new_password)
    
    # Mettre à jour le mot de passe
    user.hashed_password = hashed
    db.commit()
    # ❌ FIX : Supprimer db.refresh(user) car il peut recharger depuis auth_db et perdre les données temporaires
    # Les assignations (site_id, group_id) sont gérées dans tenant_db, pas dans auth_db
    
    logger.info(f"Password reset successful for user {user.id} ({user.email})")
    
    # Envoyer une notification de confirmation
    email_service = get_email_service()
    email_service.send_password_changed_notification(
        to_email=user.email,
        to_name=user.name
    )
    
    return {"message": "Mot de passe réinitialisé avec succès"}