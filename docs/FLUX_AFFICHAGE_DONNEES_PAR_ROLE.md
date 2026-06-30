# Flux Technique - Affichage des Données selon le Rôle Utilisateur

## Vue d'Ensemble du Flux de Filtrage par Rôle

```
ComparativeAnalyticsPage.jsx
    ↓
Chargement des Assignations Multi-Tenant (user.site_ids, user.group_ids, user.project_ids)
    ↓
Filtrage Automatique des Sites/Groupes selon le Rôle
    ↓
Chargement Intelligence Admin (Sites) selon le Rôle
    ↓
Chargement Intelligence Team (Équipes) selon le Rôle
    ↓
Affichage des Données Filtrées dans l'UI
```

---

## Rôles Utilisateur et Périmètres d'Accès

### 1. super_admin
**Périmètre** : Accès total à tous les sites, groupes et projets
**Filtrage** : Aucun filtrage automatique
**Affichage** : Tous les sites et groupes disponibles

### 2. site_manager
**Périmètre** : Accès limité à ses sites assignés (user.site_ids)
**Filtrage** : Sites filtrés selon user.site_ids
**Affichage** : Uniquement ses sites assignés

### 3. team_lead
**Périmètre** : Accès limité à ses équipes assignées (user.group_ids)
**Filtrage** : Groupes filtrés selon user.group_ids
**Affichage** : Uniquement ses équipes assignées

### 4. project_manager
**Périmètre** : Accès limité à ses projets assignés (user.project_ids)
**Filtrage** : Projets filtrés selon user.project_ids
**Affichage** : Uniquement ses projets assignés

### 5. viewer
**Périmètre** : Accès flexible (sites, équipes, projets combinés)
**Filtrage** : Sites/groupes filtrés selon userAssignments.site_ids/group_ids
**Affichage** : Ses assignations (priorité aux équipes si disponibles)

---

## ÉTAPE 1 : Frontend - Chargement des Assignations Multi-Tenant

**Fichier** : `dataCollection/src/frontend/src/pages/ComparativeAnalyticsPage.jsx`

**Chemin complet** : `c:\Users\ranim\Downloads\gitlab-kpi-dashboard-versionaprescorrectionMAIimportant\dataCollection\src\frontend\src\pages\ComparativeAnalyticsPage.jsx`

### Code Frontend (Ligne 1278-1292)
```javascript
// ✅ Rafraîchir les assignations au chargement du composant (pour les utilisateurs connectés avant l'ajout du endpoint)
useEffect(() => {
  const fetchAssignments = async () => {
    if (user?.role === 'site_manager' || user?.role === 'team_lead' || user?.role === 'project_manager' || user?.role === 'viewer') {
      try {
        const assignments = await authService.getUserAssignments();
        console.log("[DEBUG] Initial assignments fetch:", assignments);
        setUserAssignments(assignments);
      } catch (err) {
        console.warn("Failed to fetch assignments:", err);
      }
    }
  };
  fetchAssignments();
}, [user?.role]);
```

### Ce qui se passe
- Le frontend détecte le rôle de l'utilisateur
- Si le rôle nécessite des assignations (site_manager, team_lead, project_manager, viewer)
- Il appelle `authService.getUserAssignments()` pour récupérer les assignations depuis telnetdb
- Les assignations sont stockées dans le state `userAssignments`

---

## ÉTAPE 2 : Frontend - Filtrage Automatique des Sites/Groupes selon le Rôle

**Fichier** : `dataCollection/src/frontend/src/pages/ComparativeAnalyticsPage.jsx`

### Code Frontend (Ligne 1332-1413)
```javascript
// ✅ FILTRAGE AUTOMATIQUE MULTI-TENANT
let siteIdParam = null;
let groupIdParam = null;

if (user?.role === "site_manager" && user?.site_ids?.length > 0) {
  // Site manager: utiliser ses sites assignés
  siteIdParam = user.site_ids[0]; // Premier site assigné
} else if (user?.role === "team_lead" && user?.group_ids?.length > 0) {
  // Team lead: utiliser ses équipes assignées
  groupIdParam = user.group_ids[0]; // Première équipe assignée
}

// ✅ FILTRER LES DONNÉES AVANT DE LES DÉFINIR (pour Viewer)
let filteredSites = sitesData;
let filteredGroups = groupsData;

if (user?.role === "viewer") {
  // Viewer: ne montrer que les sites/équipes assignés
  console.log("DEBUG - Applying Viewer filtering logic");
  if (userAssignments.site_ids?.length > 0) {
    filteredSites = sitesData.filter(s => userAssignments.site_ids.includes(s.id || s.site_id));
    filteredGroups = groupsData.filter(g => userAssignments.group_ids.includes(g.id || g.group_id));
  } else if (userAssignments.group_ids?.length > 0) {
    // Si pas de sites assignés mais des équipes assignés
    filteredSites = sitesData.filter(s => {
      const siteGroups = groupsData.filter(g => g.site_id === s.id || s.site_id);
      return siteGroups.some(g => userAssignments.group_ids.includes(g.id || g.group_id));
    });
    filteredGroups = groupsData.filter(g => userAssignments.group_ids.includes(g.id || g.group_id));
  } else {
    console.log("DEBUG - Viewer has no assignments, showing all as fallback");
  }
}

setSites(filteredSites);
setGroups(filteredGroups);

// ✅ FILTRAGE AUTOMATIQUE SELON LE RÔLE
if (user?.role === "site_manager" && user?.site_ids?.length > 0) {
  // Site manager: sélectionner automatiquement ses sites assignés
  const accessibleSites = filteredSites.filter(s => user.site_ids.includes(s.id || s.site_id));
  setSelectedEntityIds(accessibleSites.map(s => s.id || s.site_id));
  setEntityType('site');
} else if (user?.role === "team_lead" && user?.group_ids?.length > 0) {
  // Team lead: sélectionner automatiquement ses équipes assignées
  const accessibleGroups = filteredGroups.filter(g => user.group_ids.includes(g.id || g.group_id));
  setSelectedEntityIds(accessibleGroups.map(g => g.id || g.group_id));
  setEntityType('group');
} else if (user?.role === "viewer") {
  // Viewer: utiliser ses assignations (prioriser les équipes si disponibles)
  if (userAssignments.group_ids?.length > 0) {
    const accessibleGroups = filteredGroups.filter(g => userAssignments.group_ids.includes(g.id || g.group_id));
    setSelectedEntityIds(accessibleGroups.map(g => g.id || g.group_id));
    setEntityType('group');
  } else if (userAssignments.site_ids?.length > 0) {
    const accessibleSites = filteredSites.filter(s => userAssignments.site_ids.includes(s.id || s.site_id));
    setSelectedEntityIds(accessibleSites.map(s => s.id || s.site_id));
    setEntityType('site');
  } else {
    // Viewer sans assignations: tous les sites (fallback)
    setSelectedEntityIds(filteredSites.map(s => s.id || s.site_id));
    setEntityType('site');
  }
} else if (user?.role === "project_manager" && user?.project_ids?.length > 0) {
  // Project manager: utiliser son projet assigné
  setEntityType('project');
  // Les données de projet sont déjà filtrées par le backend
}
```

### Ce qui se passe
- Le frontend filtre les sites et groupes selon le rôle de l'utilisateur
- **site_manager** : Filtre les sites selon `user.site_ids`
- **team_lead** : Filtre les groupes selon `user.group_ids`
- **viewer** : Filtre selon `userAssignments.site_ids` ou `userAssignments.group_ids` (priorité aux équipes)
- **project_manager** : Utilise `user.project_ids` pour filtrer les projets
- **super_admin** : Aucun filtrage (tous les sites et groupes)

---

## ÉTAPE 3 : Frontend - Chargement Intelligence Admin (Sites) selon le Rôle

**Fichier** : `dataCollection/src/frontend/src/pages/ComparativeAnalyticsPage.jsx`

### Code Frontend (Ligne 1482-1521)
```javascript
// 4. Chargement Intelligence Statistique (Super Admin, Site Manager, Project Manager et Viewer)
useEffect(() => {
  if (projectId && (user?.role === 'super_admin' || user?.role === 'site_manager' || user?.role === 'project_manager' || user?.role === 'viewer')) {
    const fetchIntelligence = async () => {
      setIntelligenceLoading(true);
      try {
        // ✅ FIX: Pour site_manager, rafraîchir les assignments si vides et attendre le résultat
        let effectiveSiteIds = null;
        if (user?.role === 'site_manager') {
          if (userAssignments.site_ids.length === 0) {
            try {
              const assignments = await authService.getUserAssignments();
              console.log("[DEBUG] Refreshed assignments for intelligence:", assignments);
              setUserAssignments(assignments);
              effectiveSiteIds = assignments.site_ids.length > 0 ? assignments.site_ids : [user?.site_id].filter(Boolean);
            } catch (e) {
              console.error("[DEBUG] Error refreshing assignments:", e);
              effectiveSiteIds = [user?.site_id].filter(Boolean);
            }
          } else {
            effectiveSiteIds = userAssignments.site_ids;
          }
        } else if (user?.role === 'viewer') {
          // ✅ FIX: Pour viewer, utiliser ses assignments de sites
          effectiveSiteIds = userAssignments.site_ids.length > 0 ? userAssignments.site_ids : null;
        }

        console.log("[DEBUG] Fetching intelligence - user role:", user?.role, "siteIds:", effectiveSiteIds, "userAssignments.site_ids:", userAssignments.site_ids, "user.site_id:", user?.site_id);
        const data = await analyticsService.getAdminIntelligence(projectId, null, null, effectiveSiteIds);
        setIntelligenceData(data);
      } catch (err) {
        console.warn("Intelligence non disponible:", err);
        setIntelligenceData(null);
      } finally {
        setIntelligenceLoading(false);
      }
    };
    fetchIntelligence();
  }
}, [projectId, user]);
```

### Ce qui se passe
- Le frontend charge l'intelligence statistique pour les sites
- **super_admin** : `effectiveSiteIds = null` (tous les sites)
- **site_manager** : `effectiveSiteIds = userAssignments.site_ids` (ses sites assignés)
- **project_manager** : `effectiveSiteIds = null` (tous les sites de ses projets)
- **viewer** : `effectiveSiteIds = userAssignments.site_ids` (ses sites assignés)
- L'appel API `analyticsService.getAdminIntelligence(projectId, null, null, effectiveSiteIds)` est fait avec les filtres

---

## ÉTAPE 4 : Frontend - Chargement Intelligence Team (Équipes) selon le Rôle

**Fichier** : `dataCollection/src/frontend/src/pages/ComparativeAnalyticsPage.jsx`

### Code Frontend (Ligne 1523-1557)
```javascript
// 5. Chargement Intelligence Équipes (Super Admin, Team Lead, Project Manager et Viewer)
useEffect(() => {
  if (projectId && (user?.role === 'super_admin' || user?.role === 'team_lead' || user?.role === 'project_manager' || user?.role === 'viewer')) {
    const fetchTeamIntelligence = async () => {
      setTeamIntelligenceLoading(true);
      try {
        // ✅ FIX: Ne rafraîchir les assignments que si c'est réellement nécessaire (tableaux vides ET pas déjà tenté)
        const needsRefresh = user?.role === 'team_lead' && userAssignments.group_ids.length === 0;
        
        if (needsRefresh) {
          try {
            const assignments = await authService.getUserAssignments();
            console.log("[DEBUG] Refreshed assignments for team intelligence:", assignments);
            setUserAssignments(assignments);
          } catch (e) {
            console.error("[DEBUG] Error refreshing assignments for team intelligence:", e);
          }
        }

        // ✅ FIX: Pour team_lead, project_manager et viewer, utiliser group_ids depuis userAssignments au lieu de user.group_id
        const groupIds = (user?.role === 'team_lead' || user?.role === 'project_manager' || user?.role === 'viewer') ? (userAssignments.group_ids.length > 0 ? userAssignments.group_ids : [user?.group_id].filter(Boolean)) : null;
        console.log("[DEBUG] Fetching team intelligence - user role:", user?.role, "groupIds:", groupIds, "userAssignments.group_ids:", userAssignments.group_ids, "user.group_ids:", user?.group_ids);
        const data = await analyticsService.getTeamIntelligence(projectId, null, groupIds);
        console.log("[DEBUG] Team intelligence data received:", data);
        setTeamIntelligenceData(data);
      } catch (err) {
        console.warn("Intelligence équipes non disponible:", err);
        setTeamIntelligenceData(null);
      } finally {
        setTeamIntelligenceLoading(false);
      }
    };
    fetchTeamIntelligence();
  }
}, [projectId, user, groupIdsLength]);
```

### Ce qui se passe
- Le frontend charge l'intelligence statistique pour les équipes
- **super_admin** : `groupIds = null` (toutes les équipes)
- **team_lead** : `groupIds = userAssignments.group_ids` (ses équipes assignées)
- **project_manager** : `groupIds = userAssignments.group_ids` (ses équipes assignées)
- **viewer** : `groupIds = userAssignments.group_ids` (ses équipes assignées)
- L'appel API `analyticsService.getTeamIntelligence(projectId, null, groupIds)` est fait avec les filtres

---

## ÉTAPE 5 : Frontend - Appel API Intelligence Admin

**Fichier** : `dataCollection/src/frontend/src/services/analyticsService.js`

**Chemin complet** : `c:\Users\ranim\Downloads\gitlab-kpi-dashboard-versionaprescorrectionMAIimportant\dataCollection\src\frontend\src\services\analyticsService.js`

### Code Frontend (Ligne 389-404)
```javascript
getAdminIntelligence: async (projectId, periodId = null, siteId = null, siteIds = null) => {
  // ✅ Support multi-sites: passer site_ids array si fourni, sinon site_id single
  const params = buildParams({ period_id: periodId });
  
  // N'envoyer qu'un seul paramètre de filtrage par site
  if (siteIds && siteIds.length > 0) {
    params.site_ids = siteIds;
  } else if (siteId) {
    params.site_id = siteId;
  }
  
  console.log("[DEBUG] getAdminIntelligence - projectId:", projectId, "periodId:", periodId, "siteId:", siteId, "siteIds:", siteIds, "params:", params);
  const { data } = await api.get(`/intelligence/admin/${projectId}`, { params });
  console.log("[DEBUG] getAdminIntelligence - response data:", data);
  return data;
},
```

### Requête HTTP envoyée
```
GET /api/v1/intelligence/admin/123?period_id=5&site_ids=1,2,3
Content-Type: application/json
Authorization: Bearer <JWT_TOKEN>
```

### Ce qui se passe
- Le frontend construit les paramètres de requête selon le rôle
- **super_admin** : `params = {}` (pas de filtrage)
- **site_manager** : `params = { site_ids: [1, 2, 3] }` (ses sites assignés)
- **project_manager** : `params = {}` (pas de filtrage par site)
- **viewer** : `params = { site_ids: [1, 2] }` (ses sites assignés)
- La requête GET est envoyée au backend avec les filtres

---

## ÉTAPE 6 : Frontend - Appel API Intelligence Team

**Fichier** : `dataCollection/src/frontend/src/services/analyticsService.js`

### Code Frontend (Ligne 412-416)
```javascript
getTeamIntelligence: async (projectId, periodId = null, groupId = null) => {
  const params = buildParams({ period_id: periodId, group_id: groupId });
  const { data } = await api.get(`/intelligence/team/${projectId}`, { params });
  return data;
},
```

### Requête HTTP envoyée
```
GET /api/v1/intelligence/team/123?period_id=5&group_id=5,6,7
Content-Type: application/json
Authorization: Bearer <JWT_TOKEN>
```

### Ce qui se passe
- Le frontend construit les paramètres de requête selon le rôle
- **super_admin** : `params = {}` (pas de filtrage)
- **team_lead** : `params = { group_id: [5, 6, 7] }` (ses équipes assignées)
- **project_manager** : `params = { group_id: [5, 6] }` (ses équipes assignées)
- **viewer** : `params = { group_id: [5, 6] }` (ses équipes assignées)
- La requête GET est envoyée au backend avec les filtres

---

## ÉTAPE 7 : Backend - Réception de la Requête Intelligence Admin

**Fichier** : `dataCollection/src/backend/app/api/routers/intelligence.py`

**Chemin complet** : `c:\Users\ranim\Downloads\gitlab-kpi-dashboard-versionaprescorrectionMAIimportant\dataCollection\src\backend\app\api\routers\intelligence.py`

### Code Backend (Ligne 36-104)
```python
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
```

### Ce qui se passe
- FastAPI reçoit la requête GET avec les paramètres de filtrage
- Il parse les `site_ids` depuis la chaîne de caractères
- Il applique le filtrage selon le rôle de l'utilisateur :
  - **super_admin** : `effective_site_ids = None` (tous les sites)
  - **site_manager** : Charge les assignations depuis `user_site_access` dans telnetdb
  - **project_manager** : `effective_site_ids = None` (tous les sites du projet)
  - **viewer** : Charge les assignations depuis `user_site_access` dans telnetdb
- Il appelle le service `IntelligenceService.get_admin_intelligence()` avec les filtres

---

## ÉTAPE 8 : Backend - Réception de la Requête Intelligence Team

**Fichier** : `dataCollection/src/backend/app/api/routers/intelligence.py`

### Code Backend (Ligne 107-200)
```python
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
    if effective_group_ids is None and current_admin.role == 'team_lead':
        group_access_repo = UserGroupAccessRepository()
        
        # Charger les assignations de groupes depuis tenant
        tenant_user_id = _get_tenant_user_id(db, current_admin)
        accessible_group_ids = [access.group_id for access in group_access_repo.get_by_user_id(db, tenant_user_id)]
        
        # Fallback vers l'ancien système single group
        if current_admin.group_id:
            accessible_group_ids.append(current_admin.group_id)
        
        effective_group_ids = accessible_group_ids if accessible_group_ids else None
        logger.info(f"[Intelligence Router] Fallback to tenant group_accesses for team_lead: {effective_group_ids}")
    
    # Pour project_manager: charger les assignations de groupes depuis tenant
    if effective_group_ids is None and current_admin.role == 'project_manager':
        group_access_repo = UserGroupAccessRepository()
        
        # Charger les assignations de groupes depuis tenant
        tenant_user_id = _get_tenant_user_id(db, current_admin)
        accessible_group_ids = [access.group_id for access in group_access_repo.get_by_user_id(db, tenant_user_id)]
        
        effective_group_ids = accessible_group_ids if accessible_group_ids else None
        logger.info(f"[Intelligence Router] project_manager group_accesses: {effective_group_ids}")
    
    # Pour viewer: charger les assignations de groupes depuis tenant
    if effective_group_ids is None and current_admin.role == 'viewer':
        group_access_repo = UserGroupAccessRepository()
        
        # Charger les assignations de groupes depuis tenant
        tenant_user_id = _get_tenant_user_id(db, current_admin)
        accessible_group_ids = [access.group_id for access in group_access_repo.get_by_user_id(db, tenant_user_id)]
        
        effective_group_ids = accessible_group_ids if accessible_group_ids else None
        logger.info(f"[Intelligence Router] viewer group_accesses: {effective_group_ids}")
    
    logger.info(f"[Intelligence Router] Final effective_group_ids: {effective_group_ids}")
    return service.get_team_intelligence(project_id, period_id, group_ids=effective_group_ids)
```

### Ce qui se passe
- FastAPI reçoit la requête GET avec les paramètres de filtrage
- Il parse les `group_ids` depuis la chaîne de caractères
- Il applique le filtrage selon le rôle de l'utilisateur :
  - **super_admin** : `effective_group_ids = None` (toutes les équipes)
  - **team_lead** : Charge les assignations depuis `user_group_access` dans telnetdb
  - **project_manager** : Charge les assignations depuis `user_group_access` dans telnetdb
  - **viewer** : Charge les assignations depuis `user_group_access` dans telnetdb
- Il appelle le service `IntelligenceService.get_team_intelligence()` avec les filtres

---

## ÉTAPE 9 : Frontend - Affichage des Données Filtrées dans l'UI

**Fichier** : `dataCollection/src/frontend/src/pages/ComparativeAnalyticsPage.jsx`

### Code Frontend (Ligne 769-793)
```javascript
{((user?.role === 'super_admin' || user?.role === 'site_manager' || user?.role === 'project_manager' || user?.role === 'viewer') && (
  <button
    onClick={() => setIntelligenceView('sites')}
    style={{
      background: intelligenceView === 'sites' ? 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)' : 'rgba(255, 255, 255, 0.05)',
      color: intelligenceView === 'sites' ? '#fff' : '#94a3b8',
      border: intelligenceView === 'sites' ? 'none' : '1px solid rgba(255, 255, 255, 0.1)',
      width: '100%'
    }}>
    Sites
  </button>
))}
{((user?.role === 'super_admin' || user?.role === 'team_lead' || user?.role === 'project_manager' || user?.role === 'viewer') && (
  <button
    onClick={() => setIntelligenceView('teams')}
    style={{
      background: intelligenceView === 'teams' ? 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)' : 'rgba(255, 255, 255, 0.05)',
      color: intelligenceView === 'teams' ? '#fff' : '#94a3b8',
      border: intelligenceView === 'teams' ? 'none' : '1px solid rgba(255, 255, 255, 0.1)',
      width: '100%'
    }}>
    Teams
  </button>
))}
```

### Ce qui se passe
- Le frontend affiche les boutons "Sites" et "Teams" selon le rôle de l'utilisateur
- **super_admin** : Les deux boutons sont affichés
- **site_manager** : Seul le bouton "Sites" est affiché
- **team_lead** : Seul le bouton "Teams" est affiché
- **project_manager** : Les deux boutons sont affichés
- **viewer** : Les deux boutons sont affichés
- Les données filtrées sont affichées dans l'UI selon le bouton sélectionné

---

## Résumé Chronologique du Flux de Filtrage par Rôle

| Étape | Couche | Fichier | Action | Résultat |
|-------|-------|--------|--------|----------|
| 1 | Frontend | ComparativeAnalyticsPage.jsx | Chargement assignations multi-tenant | userAssignments |
| 2 | Frontend | ComparativeAnalyticsPage.jsx | Filtrage sites/groupes selon rôle | filteredSites, filteredGroups |
| 3 | Frontend | ComparativeAnalyticsPage.jsx | Sélection automatique selon rôle | selectedEntityIds, entityType |
| 4 | Frontend | ComparativeAnalyticsPage.jsx | Chargement intelligence admin | effectiveSiteIds |
| 5 | Frontend | ComparativeAnalyticsPage.jsx | Chargement intelligence team | effectiveGroupIds |
| 6 | Frontend | analyticsService.js | Appel API intelligence admin | GET /intelligence/admin/{projectId}?site_ids=... |
| 7 | Frontend | analyticsService.js | Appel API intelligence team | GET /intelligence/team/{projectId}?group_ids=... |
| 8 | Backend | intelligence.py | Filtrage selon rôle + chargement assignations tenant | effective_site_ids |
| 9 | Backend | intelligence.py | Filtrage selon rôle + chargement assignations tenant | effective_group_ids |
| 10 | Backend | IntelligenceService | Calcul intelligence avec filtres | intelligenceData |
| 11 | Frontend | ComparativeAnalyticsPage.jsx | Affichage données filtrées | UI avec données filtrées |

---

## Points Clés du Filtrage par Rôle

### 1. Chargement Dynamique des Assignations
- Les assignations sont chargées depuis telnetdb via `authService.getUserAssignments()`
- Les assignations sont stockées dans `userAssignments` (site_ids, group_ids, project_ids)
- Le rafraîchissement est fait si les assignations sont vides

### 2. Filtrage Frontend
- Le frontend filtre les sites et groupes selon le rôle avant de les afficher
- Le frontend sélectionne automatiquement les entités accessibles selon le rôle
- Le frontend envoie les filtres au backend via les paramètres de requête

### 3. Filtrage Backend
- Le backend applique un double filtrage :
  - Filtrage selon les paramètres de requête envoyés par le frontend
  - Fallback : Chargement des assignations depuis telnetdb si les paramètres sont vides
- Le backend utilise les repositories `UserSiteAccessRepository` et `UserGroupAccessRepository` pour charger les assignations

### 4. Affichage UI
- Les boutons "Sites" et "Teams" sont affichés selon le rôle
- Les données filtrées sont affichées dans l'UI selon le bouton sélectionné
- L'utilisateur ne voit que les données de son périmètre d'accès

---

## Conclusion

Le système de filtrage par rôle fonctionne de manière cohérente entre le frontend et le backend :

1. **Frontend** : Charge les assignations multi-tenant, filtre les données, envoie les filtres au backend
2. **Backend** : Applique le filtrage selon le rôle, charge les assignations depuis telnetdb si nécessaire
3. **UI** : Affiche uniquement les données du périmètre d'accès de l'utilisateur

Cette architecture garantit que chaque utilisateur ne voit que les données de son périmètre d'accès, tout en maintenant une séparation claire entre authentification (auth_db) et données métier (telnetdb).
