"""Router pour les endpoints d'intelligence statistique (Super Admin et Site Manager)."""
import logging
from typing import Optional, List
from fastapi import Request

from fastapi import APIRouter, Depends, Query, HTTPException
from sqlalchemy.orm import Session

from app.api.dependencies import get_current_viewer_or_above
from app.database.session import get_db
from app.models.app_user import AppUser
from app.services.intelligence import IntelligenceService
from app.repositories.user_repository import AppUserRepository
from app.repositories.user_site_access_repository import UserSiteAccessRepository
from app.repositories.user_group_access_repository import UserGroupAccessRepository

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/intelligence", tags=["Intelligence"])
user_repo = AppUserRepository()

def _get_tenant_user_id(db: Session, current_user: AppUser) -> int:
    """Récupère l'ID du tenant_user correspondant à l'utilisateur courant."""
    tenant_user = user_repo.get_by_email(db, current_user.email)
    if not tenant_user:
        raise HTTPException(status_code=404, detail="Utilisateur non trouvé dans la base tenant")
    return tenant_user.id

def _http_error(status_code: int, code: str, message: str) -> HTTPException:
    """Return a standardized API error payload."""
    return HTTPException(status_code=status_code, detail=f"{code}: {message}")

# INDICATEUR DE VERSION - MODIFIÉ POUR DÉBOGGER
print("[INTELLIGENCE ROUTER] Module loaded - VERSION 2026-06-12-16:50")


@router.get("/admin/{project_id}")
def get_admin_intelligence(
    project_id: int,
    period_id: Optional[int] = Query(default=None, description="ID de la période (None = dernière)"),
    site_id: Optional[int] = Query(default=None, description="Filtrer par site (optionnel, priorité sur le rôle)"),
    site_ids: Optional[str] = Query(default=None, description="Filtrer par sites multiples (optionnel, pour multi-sites)"),
    db: Session = Depends(get_db),
    current_admin: AppUser = Depends(get_current_viewer_or_above),
):
    """
    Retourne les insights d'intelligence statistique pour le Super Admin et Site Manager.
    
    Endpoint accessible pour : super_admin, site_manager.
    
    Pour site_manager : filtre les données pour afficher uniquement les sites de l'utilisateur.
    
    ✅ AJOUT : Support multi-sites pour site_manager via site_ids array
    
    Inclut :
    - Détection d'anomalies inter-sites
    - Analyse des corrélations entre métriques
    - Recommandations d'action
    """
    service = IntelligenceService(db)
    # ✅ FIX : Parser site_ids depuis la chaîne de caractères
    effective_site_ids = None
    if site_ids:
        try:
            # Parser "13" ou "[13]" ou "13,14,15"
            site_ids_str = site_ids.strip("[]")
            effective_site_ids = [int(x.strip()) for x in site_ids_str.split(",") if x.strip()]
            logger.info(f"[Intelligence Router] Parsed site_ids from '{site_ids}' to {effective_site_ids}")
        except Exception as e:
            logger.warning(f"[Intelligence Router] Failed to parse site_ids '{site_ids}': {e}")
            effective_site_ids = None
    
    # Fallback pour site_manager - utiliser le même pattern que analytics router
    if effective_site_ids is None and current_admin.role == 'site_manager':
        site_access_repo = UserSiteAccessRepository()
        
        # Charger les assignations de sites depuis tenant
        tenant_user_id = _get_tenant_user_id(db, current_admin)
        accessible_site_ids = [access.site_id for access in site_access_repo.get_by_user_id(db, tenant_user_id)]
        
        # Fallback vers l'ancien système single site
        if current_admin.site_id:
            accessible_site_ids.append(current_admin.site_id)
        
        effective_site_ids = accessible_site_ids if accessible_site_ids else None
        logger.info(f"[Intelligence Router] Fallback to tenant site_accesses for site_manager: {effective_site_ids}")
    
    # Pour project_manager: ne pas filtrer par site (voir tous les sites de ses projets)
    if effective_site_ids is None and current_admin.role == 'project_manager':
        logger.info(f"[Intelligence Router] project_manager accessing project {project_id} - no site filtering")
        effective_site_ids = None  # Tous les sites du projet
    
    # Pour viewer: charger les assignations de sites depuis tenant
    if effective_site_ids is None and current_admin.role == 'viewer':
        site_access_repo = UserSiteAccessRepository()
        
        # Charger les assignations de sites depuis tenant
        tenant_user_id = _get_tenant_user_id(db, current_admin)
        accessible_site_ids = [access.site_id for access in site_access_repo.get_by_user_id(db, tenant_user_id)]
        
        effective_site_ids = accessible_site_ids if accessible_site_ids else None
        logger.info(f"[Intelligence Router] viewer site_accesses: {effective_site_ids}")
    
    logger.info(f"[Intelligence Router] Final effective_site_ids: {effective_site_ids}")
    return service.get_admin_intelligence(project_id, period_id, site_ids=effective_site_ids)


@router.get("/team/{project_id}")
def get_team_intelligence(
    project_id: int,
    request: Request,  # Pour accéder aux query params bruts
    period_id: Optional[int] = Query(default=None, description="ID de la période (None = dernière)"),
    group_id: Optional[int] = Query(default=None, description="ID du groupe/équipe (optionnel, priorité sur le rôle)"),
    group_ids: Optional[List[int]] = Query(default=None, description="Filtrer par groupes multiples (optionnel, pour multi-équipes)"),
    db: Session = Depends(get_db),
    current_admin: AppUser = Depends(get_current_viewer_or_above),
):
    """
    Retourne les insights d'intelligence statistique pour les équipes (teams).
    
    Endpoint accessible pour : super_admin, site_manager, team_lead.
    
    Pour team_lead : filtre les données pour afficher uniquement les équipes de l'utilisateur.
    
    ✅ AJOUT : Support multi-équipes pour team_lead via group_ids array
    
    Inclut :
    - Détection d'anomalies inter-équipes
    - Analyse des corrélations entre métriques
    - Recommandations d'action
    """
    print(f"[DEBUG] Intelligence API called: project_id={project_id}, period_id={period_id}, group_id={group_id}, group_ids={group_ids}, user_role={current_admin.role}")
    logger.info(f"[Intelligence API] get_team_intelligence called: project_id={project_id}, period_id={period_id}, group_id={group_id}, group_ids={group_ids}, user_role={current_admin.role}")
    
    # ✅ FIX : Support multi-équipes via group_ids array
    # Priorité: group_ids (nouveau) > parse group_id[] depuis query string > group_id (ancien)
    effective_group_ids = None
    if group_ids and len(group_ids) > 0:
        effective_group_ids = group_ids
    else:
        # Parser manuellement group_id[] depuis la query string
        try:
            query_params = request.query_params
            group_id_list = query_params.getlist("group_id")
            print(f"[DEBUG] query_params.getlist('group_id') = {group_id_list}")
            if group_id_list and len(group_id_list) > 0:
                effective_group_ids = [int(g) for g in group_id_list]
                logger.info(f"[Intelligence Router] Parsed group_id[] from query string: {effective_group_ids}")
        except Exception as e:
            logger.error(f"[Intelligence Router] Error parsing group_id[]: {e}")
            print(f"[DEBUG] Error parsing group_id[]: {e}")
    
    # Fallback pour team_lead - utiliser le même pattern que analytics router
    # ✅ FIX: Traiter effective_group_ids vide comme None pour déclencher le fallback
    if (effective_group_ids is None or len(effective_group_ids) == 0) and current_admin.role == 'team_lead':
        group_access_repo = UserGroupAccessRepository()
        
        # Charger les assignations de groupes depuis tenant
        tenant_user_id = _get_tenant_user_id(db, current_admin)
        accessible_group_ids = [access.group_id for access in group_access_repo.get_by_user_id(db, tenant_user_id)]
        
        # Fallback vers l'ancien système single group (seulement si aucun groupe trouvé dans tenant)
        if not accessible_group_ids and current_admin.group_id:
            accessible_group_ids.append(current_admin.group_id)
        
        effective_group_ids = accessible_group_ids if accessible_group_ids else None
        logger.info(f"[Intelligence Router] Fallback to tenant group_accesses for team_lead: {effective_group_ids}")
    
    # Pour viewer: charger les assignations de groupes depuis tenant
    if (effective_group_ids is None or len(effective_group_ids) == 0) and current_admin.role == 'viewer':
        group_access_repo = UserGroupAccessRepository()
        
        # Charger les assignations de groupes depuis tenant
        tenant_user_id = _get_tenant_user_id(db, current_admin)
        accessible_group_ids = [access.group_id for access in group_access_repo.get_by_user_id(db, tenant_user_id)]
        
        effective_group_ids = accessible_group_ids if accessible_group_ids else None
        logger.info(f"[Intelligence Router] viewer group_accesses: {effective_group_ids}")
    
    # ✅ ARCHITECTURE MULTI-TENANT: Enforce project-based access control for project_manager
    if current_admin.role == 'project_manager':
        from app.repositories.user_project_access_repository import UserProjectAccessRepository
        from app.repositories.project_repository import ProjectRepository
        project_access_repo = UserProjectAccessRepository()
        project_repo = ProjectRepository()
        
        # Charger les assignations de projets depuis tenant
        accessible_project_ids = [access.project_id for access in project_access_repo.get_by_user_id(db, _get_tenant_user_id(db, current_admin))]
        
        # Vérifier que l'utilisateur a accès au projet demandé
        if project_id not in accessible_project_ids:
            # Récupérer les noms des projets pour un message plus clair
            all_projects = project_repo.get_all(db)
            project_map = {p.id: p.name for p in all_projects}
            
            requested_project_name = project_map.get(project_id, f"projet {project_id}")
            accessible_project_names = [project_map.get(pid, f"projet {pid}") for pid in accessible_project_ids]
            
            logger.warning(f"[Intelligence Router] project_manager {current_admin.email} tried to access project {requested_project_name} but only manages {accessible_project_names}")
            # Pour project_manager, ne pas rejeter mais utiliser les projets accessibles
            # Si le projet demandé n'est pas accessible, retourner une erreur claire
            raise HTTPException(
                status_code=403,
                detail=f"Accès au projet {requested_project_name} refusé. Vous gérez uniquement les projets {accessible_project_names}."
            )
        
        logger.info(f"[Intelligence Router] project_manager accessing project {project_id}, accessible projects: {accessible_project_ids}")
    
    # ✅ ARCHITECTURE MULTI-TENANT: Enforce project-based access control for viewer
    if current_admin.role == 'viewer':
        from app.repositories.user_project_access_repository import UserProjectAccessRepository
        from app.repositories.project_repository import ProjectRepository
        project_access_repo = UserProjectAccessRepository()
        project_repo = ProjectRepository()
        
        # Charger les assignations de projets depuis tenant
        accessible_project_ids = [access.project_id for access in project_access_repo.get_by_user_id(db, _get_tenant_user_id(db, current_admin))]
        
        # Vérifier que l'utilisateur a accès au projet demandé
        if project_id not in accessible_project_ids:
            # Récupérer les noms des projets pour un message plus clair
            all_projects = project_repo.get_all(db)
            project_map = {p.id: p.name for p in all_projects}
            
            requested_project_name = project_map.get(project_id, f"projet {project_id}")
            accessible_project_names = [project_map.get(pid, f"projet {pid}") for pid in accessible_project_ids]
            
            logger.warning(f"[Intelligence Router] viewer {current_admin.email} tried to access project {requested_project_name} but only has access to {accessible_project_names}")
            raise HTTPException(
                status_code=403,
                detail=f"Accès au projet {requested_project_name} refusé. Vous avez accès uniquement aux projets {accessible_project_names}."
            )
        
        logger.info(f"[Intelligence Router] viewer accessing project {project_id}, accessible projects: {accessible_project_ids}")
    
    logger.info(f"[Intelligence Router] Final effective_group_ids: {effective_group_ids}")
    
    try:
        service = IntelligenceService(db)
        result = service.get_team_intelligence(project_id, period_id, group_ids=effective_group_ids)
        print(f"[DEBUG] Intelligence API returned: {result is not None}, keys={result.keys() if result else 'None'}")
        logger.info(f"[Intelligence API] get_team_intelligence returned: {result is not None}, keys={result.keys() if result else 'None'}")
        return result
    except Exception as e:
        print(f"[DEBUG] Intelligence API ERROR: {e}")
        logger.error(f"[Intelligence API] ERROR: {e}", exc_info=True)
        raise
