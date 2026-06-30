# Gestion des Utilisateurs et Architecture Multi-Tenant

## Résumé Exécutif

Ce document explique en détail comment le système de gestion des utilisateurs fonctionne, comment l'affichage dans `ComparativeAnalyticsPage.jsx` est personnalisé selon le rôle de l'utilisateur, et comment les données circulent entre la base **auth_db** (authentification) et les bases **tenant** (données métier).

---

## 1. Architecture Multi-Tenant

### 1.1 Séparation des Bases de Données

Le système utilise **2 bases de données distinctes** :

#### **auth_db** - Base d'Authentification (Centrale)
- **Fonction** : Stocke les informations d'authentification uniquement
- **Tables principales** :
  - `app_user` : Utilisateurs (email, mot de passe haché, rôle technique)
  - `profile` : Profils d'accès aux menus
  - `role` : Rôles dynamiques (nouveau système)
  - `profile_menu_item` : Association profil ↔ menu

#### **tenant_db** - Base de Données Métier (Projet)
- **Fonction** : Stocke les données métier (KPIs, développeurs, sites, équipes, projets) ET les assignations d'accès
- **Tables principales** :
  - `site` : Sites géographiques
  - `developer_group` : Équipes de développeurs
  - `project` : Projets GitLab
  - `developer` : Développeurs GitLab
  - `kpi_snapshot` : Snapshots KPI mensuels
  - `user_site_access` : Assignations multi-sites (dans tenant_db)
  - `user_group_access` : Assignations multi-équipes (dans tenant_db)
  - `user_project_access` : Assignations multi-projets (dans tenant_db)

### 1.2 Pourquoi cette Séparation ?

**Avantages** :
- **Sécurité** : Les données d'authentification sont isolées des données métier
- **Scalabilité** : Chaque projet peut avoir sa propre base tenant
- **Isolation** : Les données d'un projet ne polluent pas celles d'un autre
- **Performance** : Les requêtes d'authentification sont rapides (base légère)

---

## 2. Système de Rôles Utilisateurs

### 2.1 Hiérarchie des Rôles

**Fichier** : `AuthContext.jsx` (lignes 8-29)

```javascript
export const ROLES = {
  SUPER_ADMIN:     "super_admin",    // Niveau 6 - Accès total
  PROJECT_MANAGER: "project_manager", // Niveau 5 - Projets assignés
  SITE_MANAGER:    "site_manager",   // Niveau 4 - Son site uniquement
  TEAM_LEAD:       "team_lead",      // Niveau 3 - Son équipe uniquement
  VIEWER:          "viewer",         // Niveau 2 - Lecture seule flexible
  DEVELOPER:       "developer",      // Niveau 1 - Ses propres KPIs
};
```

**Hiérarchie** :
```
super_admin (6)
    ↓
project_manager (5)
    ↓
site_manager (4)
    ↓
team_lead (3)
    ↓
viewer (2)
    ↓
developer (1)
```

### 2.2 Définition des Rôles

**Fichier** : `app_user.py` (lignes 44-51)

| Rôle | Description | Périmètre |
|------|-------------|-----------|
| **super_admin** | Accès total à tout | Tous les sites, équipes, projets |
| **project_manager** | Gestion de projets assignés | Projets spécifiques (multi-projets) |
| **site_manager** | Gestion d'un site géographique | Son site (multi-sites possible) |
| **team_lead** | Gestion d'une équipe | Son équipe (multi-équipes possible) |
| **viewer** | Lecture seule flexible | Sites/équipes/projets assignés combinés |
| **developer** | Lecture seule de ses KPIs | Ses propres données uniquement |

### 2.3 Assignations Multi-Tenant

#### **Tables d'Assignation**

**user_site_access** (dans tenant_db) :
```python
class UserSiteAccess(Base):
    user_id = Column(Integer, ForeignKey("app_user.id"))
    site_id = Column(Integer, ForeignKey("site.id"))
    is_primary = Column(Boolean, default=False)  # Site principal
```

**user_group_access** (dans tenant_db) :
```python
class UserGroupAccess(Base):
    user_id = Column(Integer, ForeignKey("app_user.id"))
    group_id = Column(Integer, ForeignKey("developer_group.id"))
    is_primary = Column(Boolean, default=False)  # Équipe principale
```

**user_project_access** (dans tenant_db) :
```python
class UserProjectAccess(Base):
    user_id = Column(Integer)  # ID utilisateur depuis auth_db
    project_id = Column(Integer)  # ID projet
    is_primary = Column(Boolean, default=False)  # Projet principal
```

#### **Pourquoi toutes les assignations dans tenant_db ?**

Les assignations d'accès (sites, équipes, projets) sont stockées dans tenant_db car :
- Elles sont spécifiques au contexte métier de chaque projet
- Elles sont liées aux données métier (sites, équipes, projets) qui sont dans tenant_db
- Cela permet une isolation complète par projet
- auth_db ne contient que les données d'authentification pure (email, mot de passe, rôle)

---

## 3. Flux d'Authentification

### 3.1 Processus de Login

**Fichier** : `auth.py` (lignes 94-184)

```
1. Utilisateur soumet email/password
   ↓
2. Lookup dans auth_db (table app_user)
   ↓
3. Vérification du mot de passe (hash)
   ↓
4. Vérification is_active
   ↓
5. Chargement des données tenant depuis tenant_db
   - site_id, group_id
   - user_site_access (multi-sites)
   - user_group_access (multi-équipes)
   - user_project_access (multi-projets)
   ↓
6. Fusion des données dans l'objet utilisateur
   ↓
7. Génération du JWT token avec :
   - sub (user id)
   - role
   - name
   - email
   - site_id
   - group_id
   - project_ids (si project_manager)
   ↓
8. Retour du token au frontend
```

### 3.2 Endpoint `/auth/assignments`

**Fichier** : `auth.py` (lignes 233-279)

```python
@router.get("/assignments")
def get_user_assignments(current_user: AppUser = Depends(get_current_user)):
    """
    Récupère les assignations multi-tenant de l'utilisateur courant.
    Retourne : { "site_ids": [...], "group_ids": [...], "project_ids": [...] }
    """
    # 1. Se connecter à tenant_db
    tenant_db = next(get_tenant_db())
    
    # 2. Récupérer tenant_user par email
    tenant_user = user_repo.get_by_email(tenant_db, current_user.email)
    
    # 3. Charger les assignations
    site_accesses = site_access_repo.get_by_user_id(tenant_db, tenant_user.id)
    group_accesses = group_access_repo.get_by_user_id(tenant_db, tenant_user.id)
    project_accesses = project_access_repo.get_by_user_id(tenant_db, tenant_user.id)
    
    # 4. Retourner les IDs
    return {
        "site_ids": [access.site_id for access in site_accesses],
        "group_ids": [access.group_id for access in group_accesses],
        "project_ids": [access.project_id for access in project_accesses]
    }
```

### 3.3 Frontend - Chargement des Assignations

**Fichier** : `AuthContext.jsx` (lignes 97-110)

```javascript
// Après login, enrichir les données utilisateur
const me = await authService.getMe(true);
setUser(prev => ({
  ...prev,
  site_id: me.site_id,
  group_id: me.group_id,
  project_ids: me.project_ids || [],
}));

// Récupérer les assignations multi-tenant
if (me.role === 'site_manager' || me.role === 'team_lead' || me.role === 'project_manager' || me.role === 'viewer') {
  const assignments = await authService.getUserAssignments();
  setUser(prev => ({
    ...prev,
    site_ids: assignments.site_ids || [],
    group_ids: assignments.group_ids || [],
    project_ids: assignments.project_ids || []
  }));
}
```

---

## 4. Personnalisation dans ComparativeAnalyticsPage.jsx

### 4.1 État des Assignations

**Fichier** : `ComparativeAnalyticsPage.jsx` (lignes 1265-1270)

```javascript
// État séparé pour éviter de modifier l'objet user en lecture seule
const [userAssignments, setUserAssignments] = useState({ 
  site_ids: [], 
  group_ids: [], 
  project_ids: [] 
});

// Stabiliser les valeurs pour éviter les boucles infinies
const siteIdsLength = userAssignments.site_ids.length;
const groupIdsLength = userAssignments.group_ids.length;
```

### 4.2 Chargement Initial des Assignations

**Fichier** : `ComparativeAnalyticsPage.jsx` (lignes 1278-1292)

```javascript
useEffect(() => {
  const fetchAssignments = async () => {
    if (user?.role === 'site_manager' || user?.role === 'team_lead' || 
        user?.role === 'project_manager' || user?.role === 'viewer') {
      try {
        const assignments = await authService.getUserAssignments();
        setUserAssignments(assignments);
      } catch (e) {
        console.error("Error fetching initial assignments:", e);
      }
    }
  };
  fetchAssignments();
}, [user?.role]);
```

### 4.3 Filtrage Automatique des Données

**Fichier** : `ComparativeAnalyticsPage.jsx` (lignes 1332-1417)

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

// Charger les données avec ces paramètres
const [sitesData, groupsData] = await Promise.all([
  analyticsService.getAvailableSites(projectId),
  developerService.getGroups(siteIdParam, false, null, groupIdParam)
]);

// ✅ FILTRER LES DONNÉES AVANT DE LES DÉFINIR (pour Viewer)
let filteredSites = sitesData;
let filteredGroups = groupsData;

if (user?.role === "viewer") {
  // Viewer: ne montrer que les sites/équipes assignés
  if (userAssignments.site_ids?.length > 0) {
    filteredSites = sitesData.filter(s => userAssignments.site_ids.includes(s.id || s.site_id));
    filteredGroups = groupsData.filter(g => userAssignments.group_ids.includes(g.id || g.group_id));
  } else if (userAssignments.group_ids?.length > 0) {
    filteredSites = sitesData.filter(s => userAssignments.group_ids.includes(s.id || s.site_id));
    filteredGroups = groupsData.filter(g => userAssignments.group_ids.includes(g.id || g.group_id));
  }
}

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
} else if (filteredSites.length > 0) {
  // Super admin ou fallback: tous les sites
  setSelectedEntityIds(filteredSites.map(s => s.id || s.site_id));
}
```

### 4.4 Chargement Intelligence Statistique (Sites)

**Fichier** : `ComparativeAnalyticsPage.jsx` (lignes 1460-1499)

```javascript
useEffect(() => {
  if (projectId && (user?.role === 'super_admin' || user?.role === 'site_manager' || 
      user?.role === 'project_manager' || user?.role === 'viewer')) {
    const fetchIntelligence = async () => {
      setIntelligenceLoading(true);
      
      // Pour site_manager, rafraîchir les assignments si vides
      let effectiveSiteIds = null;
      if (user?.role === 'site_manager') {
        if (userAssignments.site_ids.length === 0) {
          const assignments = await authService.getUserAssignments();
          setUserAssignments(assignments);
          effectiveSiteIds = assignments.site_ids.length > 0 ? assignments.site_ids : [user?.site_id].filter(Boolean);
        } else {
          effectiveSiteIds = userAssignments.site_ids;
        }
      } else if (user?.role === 'viewer') {
        effectiveSiteIds = userAssignments.site_ids.length > 0 ? userAssignments.site_ids : null;
      }

      // Appel API avec filtrage par site_ids
      const data = await analyticsService.getAdminIntelligence(
        projectId, 
        null,  // site_id (single)
        null,  // group_id (single)
        effectiveSiteIds  // site_ids (multi)
      );
      setIntelligenceData(data);
    };
    fetchIntelligence();
  }
}, [projectId, user]);
```

### 4.5 Chargement Intelligence Équipes

**Fichier** : `ComparativeAnalyticsPage.jsx` (lignes 1501-1535)

```javascript
useEffect(() => {
  if (projectId && (user?.role === 'super_admin' || user?.role === 'team_lead' || 
      user?.role === 'project_manager' || user?.role === 'viewer')) {
    const fetchTeamIntelligence = async () => {
      setTeamIntelligenceLoading(true);
      
      // Pour team_lead, rafraîchir les assignments si nécessaires
      const needsRefresh = user?.role === 'team_lead' && userAssignments.group_ids.length === 0;
      if (needsRefresh) {
        const assignments = await authService.getUserAssignments();
        setUserAssignments(assignments);
      }

      // Pour team_lead, project_manager et viewer, utiliser group_ids depuis userAssignments
      const groupIds = (user?.role === 'team_lead' || user?.role === 'project_manager' || 
                        user?.role === 'viewer') ? 
                        (userAssignments.group_ids.length > 0 ? userAssignments.group_ids : [user?.group_id].filter(Boolean)) : 
                        null;

      // Appel API avec filtrage par group_ids
      const data = await analyticsService.getTeamIntelligence(
        projectId, 
        null,  // site_id
        groupIds  // group_ids (multi)
      );
      setTeamIntelligenceData(data);
    };
    fetchTeamIntelligence();
  }
}, [projectId, user, groupIdsLength]);
```

### 4.6 Navigation par Onglets (Tabs)

**Fichier** : `ComparativeAnalyticsPage.jsx` (lignes 769-818)

```javascript
// Tabbed Navigation dans IntelligenceDrawer
{(user?.role === 'super_admin' || user?.role === 'site_manager' || 
  user?.role === 'project_manager' || user?.role === 'viewer') && (
  <button onClick={() => setIntelligenceView('sites')}>
    <i className="ri-building-4-line"></i>
    Sites
  </button>
)}

{(user?.role === 'super_admin' || user?.role === 'team_lead' || 
  user?.role === 'project_manager' || user?.role === 'viewer') && (
  <button onClick={() => setIntelligenceView('teams')}>
    <i className="ri-team-line"></i>
    Équipes
  </button>
)}
```

**Logique d'affichage des onglets** :
- **Sites** : visible pour super_admin, site_manager, project_manager, viewer
- **Équipes** : visible pour super_admin, team_lead, project_manager, viewer

---

## 5. Résumé par Rôle

### 5.1 Super Admin

**Accès** :
- Tous les sites, équipes, projets
- Intelligence Sites et Équipes
- Gestion des utilisateurs

**Filtrage** :
- Aucun filtrage automatique
- Peut voir tout le périmètre

**Assignations** :
- Aucune assignation requise
- Accès total par défaut

### 5.2 Site Manager

**Accès** :
- Ses sites assignés (multi-sites possible)
- Intelligence Sites uniquement
- Gestion des développeurs de ses sites

**Filtrage** :
- `site_ids` depuis `user_site_access`
- Sélection automatique de ses sites
- Données filtrées par `site_ids`

**Assignations** :
- `user_site_access` (tenant_db) avec `is_primary`
- Peut gérer plusieurs sites

### 5.3 Team Lead

**Accès** :
- Ses équipes assignées (multi-équipes possible)
- Intelligence Équipes uniquement
- Gestion des développeurs de ses équipes

**Filtrage** :
- `group_ids` depuis `user_group_access`
- Sélection automatique de ses équipes
- Données filtrées par `group_ids`

**Assignations** :
- `user_group_access` (tenant_db) avec `is_primary`
- Peut gérer plusieurs équipes

### 5.4 Project Manager

**Accès** :
- Ses projets assignés (multi-projets)
- Intelligence Sites et Équipes (filtré par projets)
- Gestion des développeurs de ses projets

**Filtrage** :
- `project_ids` depuis `user_project_access` (tenant_db)
- Données filtrées par `project_ids`

**Assignations** :
- `user_project_access` (tenant_db) avec `is_primary`
- Peut gérer plusieurs projets

### 5.5 Viewer

**Accès** :
- Lecture seule flexible
- Sites/équipes/projets assignés combinés
- Intelligence Sites et Équipes (selon assignations)

**Filtrage** :
- Priorité aux équipes si `group_ids` assignés
- Sinon priorité aux sites si `site_ids` assignés
- Sinon tous les sites (fallback)

**Assignations** :
- Combinaison de `user_site_access`, `user_group_access`, `user_project_access`
- Flexible selon les besoins

### 5.6 Developer

**Accès** :
- Ses propres KPIs uniquement
- Pas d'accès à l'intelligence
- Pas de filtrage multi-tenant

**Filtrage** :
- Aucun filtrage
- Données limitées à l'utilisateur lui-même

**Assignations** :
- Aucune assignation requise
- Accès limité par défaut

---

## 6. Flux de Travail Complet

### 6.1 Création d'un Utilisateur

**Étapes** :

1. **Admin crée l'utilisateur** via interface UsersPage
2. **Sélection du profil** (ex: "Site Manager")
3. **Mapping automatique** du profil vers le rôle technique
4. **Assignation des sites/équipes/projets** selon le rôle
5. **Sauvegarde dans auth_db** :
   - `app_user` : email, mot de passe, rôle
6. **Sauvegarde dans tenant_db** :
   - `user_site_access` : sites assignés
   - `user_group_access` : équipes assignées
   - `user_project_access` : projets assignés

### 6.2 Connexion de l'Utilisateur

**Étapes** :

1. **Login** avec email/password
2. **Authentification** dans auth_db
3. **Chargement des assignations** depuis tenant_db
4. **Génération du JWT** avec rôle et assignations
5. **Stockage du token** dans localStorage
6. **Redirection** vers le dashboard

### 6.3 Chargement de ComparativeAnalyticsPage

**Étapes** :

1. **Vérification du token** (AuthContext)
2. **Récupération des assignations** via `/auth/assignments`
3. **Chargement des projets** disponibles
4. **Filtrage automatique** selon le rôle :
   - Site manager → sites assignés
   - Team lead → équipes assignées
   - Project manager → projets assignés
   - Viewer → assignations combinées
   - Super admin → tout
5. **Sélection automatique** des entités par défaut
6. **Chargement des tendances** filtrées
7. **Chargement de l'intelligence** filtrée :
   - Sites intelligence (super_admin, site_manager, project_manager, viewer)
   - Teams intelligence (super_admin, team_lead, project_manager, viewer)

### 6.4 Affichage des Données

**Selon le rôle** :

| Rôle | Sites Visibles | Équipes Visibles | Intelligence Sites | Intelligence Équipes |
|------|--------------|-----------------|-------------------|-------------------|
| Super Admin | Tous | Toutes | ✅ | ✅ |
| Site Manager | Ses sites | Toutes (du site) | ✅ | ❌ |
| Team Lead | Tous (du site) | Ses équipes | ❌ | ✅ |
| Project Manager | Tous (du projet) | Toutes (du projet) | ✅ | ✅ |
| Viewer | Assignés | Assignés | ✅ | ✅ |
| Developer | Aucun | Aucun | ❌ | ❌ |

---

## 7. Points Clés à Communiquer

### ✅ Ce que c'est

- **Architecture multi-tenant** : Séparation claire entre auth_db (authentification) et tenant_db (données métier)
- **Rôles granulaires** : 6 rôles avec périmètres d'accès spécifiques
- **Assignations flexibles** : Multi-sites, multi-équipes, multi-projets selon le rôle
- **Filtrage automatique** : L'interface s'adapte automatiquement au rôle de l'utilisateur
- **Sécurité** : Chaque utilisateur ne voit que son périmètre autorisé

### ❌ Ce que ce n'est PAS

- **Pas de duplication** : Les utilisateurs ne sont pas dupliqués entre bases
- **Pas de confusion** : Les assignations sont clairement séparées (auth_db vs tenant_db)
- **Pas de "magic"** : Tout est explicite et documenté dans le code
- **Pas d'IA** : Le filtrage est basé sur des règles métier explicites

### 🎯 Pourquoi cette Architecture ?

1. **Sécurité** : Isolation des données d'authentification
2. **Scalabilité** : Support multi-projets avec bases séparées
3. **Flexibilité** : Rôles adaptables aux besoins métier
4. **Performance** : Authentification rapide (base légère)
5. **Maintenabilité** : Code clair et documenté

---

**Document préparé pour** : Réunion avec encadrement Telnet Holding  
**Date** : 19 juin 2026  
**Auteur** : Équipe technique Dashboard KPI  
**Version** : 1.0
