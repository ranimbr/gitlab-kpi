# Flux Technique - Calcul des KPI Intelligents aux Missions et Actions de Gestion

## Vue d'Ensemble du Calcul des KPI

```
Page : /comparative-analytics (ComparativeAnalyticsPage.jsx)
    ↓
Frontend : Chargement Intelligence Admin/Team
    ↓
Frontend : analyticsService.getAdminIntelligence() / getTeamIntelligence()
    ↓
HTTP GET /intelligence/admin/{projectId} ou /intelligence/team/{projectId}
    ↓
Backend : api/routers/intelligence.py (endpoint get_admin_intelligence)
    ↓
Backend : services/intelligence.py (IntelligenceService.get_admin_intelligence)
    ↓
Backend : services/kpi/kpi_aggregator.py (KpiAggregator.generate_monthly_snapshots)
    ↓
Backend : services/kpi/kpi_calculator.py (KpiCalculator.calculate_project_kpis)
    ↓
Backend : utils/mission_utils.py (get_certified_developers_for_mission)
    ↓
Base de données PostgreSQL (SELECT commits, MRs, developers avec filtres mission)
    ↓
Backend : services/kpi/kpi_calculator.py (Calcul KPI avec nb_developers dynamique)
    ↓
Base de données PostgreSQL (INSERT kpi_snapshot avec KPI calculés)
    ↓
Frontend : ComparativeAnalyticsPage.jsx (Affichage KPI avec nb_developers)
```

---

## Intelligence du Calcul des KPI

### 1. Intelligence aux Missions des Développeurs

Le calcul des KPI est **intelligent** aux missions des développeurs :

**A. Règle des 15 jours (RG-02)**
- Un développeur est compté dans l'effectif d'un mois M si et seulement si
- Sa date de sortie (offboarding_date) est >= au 15 de ce mois M
- Cette règle s'inspire de la pratique RH standard de proratisation de la paie

**B. Vérification Triple (Site + Groupe + Projet)**
- Un développeur suspendu n'a PAS de segment site OU groupe actif pendant la suspension
- Le moteur vérifie les DEUX pour exclure correctement les suspensions
- Il utilise les segments temporels (SCD Type 2) pour vérifier la couverture temporelle

**C. Vérification de la Mission Spécifique**
- Le moteur vérifie que le développeur a une mission active sur le projet
- Il utilise la table `developer_project` pour vérifier la couverture temporelle
- Il vérifie que la date de contribution est dans la période de mission

---

### 2. Intelligence aux Actions de Gestion des Développeurs

Le calcul des KPI est **intelligent** aux actions de gestion des développeurs dans la page Admin :

**A. Mutation Historique (Case B)**
- Lorsqu'un développeur change de site/groupe/projet via une mutation historique
- Le moteur utilise les segments temporels (SCD Type 2) pour calculer les KPI
- Les KPI avant la mutation sont calculés avec l'ancienne affectation
- Les KPI après la mutation sont calculés avec la nouvelle affectation

**B. Correction Rétroactive (Case A)**
- Lorsqu'un développeur est corrigé rétroactivement
- Le moteur recalcule tous les KPI selon la nouvelle affectation
- Il utilise le mode "correction rétroactive" pour modifier l'historique

**C. Activation/Désactivation**
- Lorsqu'un développeur est désactivé (`is_active = false`)
- Le moteur exclut ses contributions des calculs KPI
- Les KPI passés sont conservés dans les snapshots historiques
- Les KPI futurs sont recalculés sans ce développeur

**D. Archivage (Offboarding)**
- Lorsqu'un développeur est archivé avec une date de sortie
- Le moteur applique la **Règle des 15 jours (RG-02)**
- Les KPI avant le 15 du mois incluent ce développeur
- Les KPI après le 15 du mois excluent ce développeur

---

## ÉTAPE 1 : Frontend - Chargement Intelligence Admin

**Fichier** : `dataCollection/src/frontend/src/pages/ComparativeAnalyticsPage.jsx`

**Chemin complet** : `c:\Users\ranim\Downloads\gitlab-kpi-dashboard-versionaprescorrectionMAIimportant\dataCollection\src\frontend\src\pages\ComparativeAnalyticsPage.jsx`

### Code Frontend (Ligne 1490-1521)
```javascript
// 4. Chargement Intelligence Admin (Super Admin, Site Manager et Viewer)
useEffect(() => {
  if (projectId && (user?.role === 'super_admin' || user?.role === 'site_manager' || user?.role === 'viewer')) {
    const fetchIntelligence = async () => {
      setIntelligenceLoading(true);
      try {
        // ✅ FIX: Pour site_manager, utiliser ses assignments de sites
        let effectiveSiteIds = null;
        if (user?.role === 'site_manager') {
          if (userAssignments.site_ids.length > 0) {
            effectiveSiteIds = userAssignments.site_ids;
          } else {
            effectiveSiteIds = userAssignments.site_ids;
          }
        } else if (user?.role === 'viewer') {
          // ✅ FIX: Pour viewer, utiliser ses assignments de sites
          effectiveSiteIds = userAssignments.site_ids.length > 0 ? userAssignments.site_ids : null;
        }

        console.log("[DEBUG] Fetching intelligence - user role:", user?.role, "siteIds:", effectiveSiteIds);
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
- Le frontend détecte le rôle de l'utilisateur (super_admin, site_manager, viewer)
- Il charge les assignments de sites selon le rôle
- Il appelle `analyticsService.getAdminIntelligence(projectId, null, null, effectiveSiteIds)`

---

## ÉTAPE 2 : Frontend - Appel API Intelligence

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
```

---

## ÉTAPE 3 : Backend - Réception de la Requête Intelligence

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
    
    logger.info(f"[Intelligence Router] Final effective_site_ids: {effective_site_ids}")
    return service.get_admin_intelligence(project_id, period_id, site_ids=effective_site_ids)
```

### Ce qui se passe
- FastAPI reçoit la requête GET
- Il parse les `site_ids` depuis la chaîne de caractères
- Il applique les filtres selon le rôle de l'utilisateur
- Il appelle le service `IntelligenceService.get_admin_intelligence()`

---

## ÉTAPE 4 : Backend - Service Intelligence

**Fichier** : `dataCollection/src/backend/app/services/intelligence.py`

### Code Backend (Méthode get_admin_intelligence)
```python
def get_admin_intelligence(
    self,
    project_id: int,
    period_id: Optional[int] = None,
    site_ids: Optional[List[int]] = None,
) -> dict:
    """
    Retourne les insights d'intelligence statistique pour le Super Admin et Site Manager.
    
    Inclut :
    - Détection d'anomalies inter-sites
    - Analyse des corrélations entre métriques
    - Recommandations d'action
    """
    # Récupération de la période
    period = self.period_repo.get_or_create(self.db, datetime.now().year, datetime.now().month)
    if period_id:
        period = self.period_repo.get_by_id(self.db, period_id)
    
    # Récupération des snapshots KPI pour la période
    snapshots = self.kpi_snapshot_repo.get_by_project_period(
        self.db, project_id, period.id, site_ids=site_ids
    )
    
    # Calcul des métriques d'intelligence
    anomalies = self._detect_anomalies(snapshots)
    correlations = self._calculate_correlations(snapshots)
    recommendations = self._generate_recommendations(snapshots, anomalies, correlations)
    
    return {
        "period_id": period.id,
        "period_label": f"{period.year}-{period.month:02d}",
        "snapshots": snapshots,
        "anomalies": anomalies,
        "correlations": correlations,
        "recommendations": recommendations,
    }
```

### Ce qui se passe
- Le service récupère la période (courante ou spécifiée)
- Il récupère les snapshots KPI pour cette période
- Il détecte les anomalies inter-sites
- Il calcule les corrélations entre métriques
- Il génère des recommandations d'action

---

## ÉTAPE 5 : Backend - Génération des Snapshots KPI

**Fichier** : `dataCollection/src/backend/app/services/kpi/kpi_aggregator.py`

**Chemin complet** : `c:\Users\ranim\Downloads\gitlab-kpi-dashboard-versionaprescorrectionMAIimportant\dataCollection\src\backend\app\services\kpi\kpi_aggregator.py`

### Code Backend (Ligne 39-84)
```python
def generate_monthly_snapshots(
    self,
    project_id: int,
    year:       int,
    month:      int,
    lot_id:     Optional[int] = None,
) -> List[KpiSnapshot]:
    """
    Génère tous les snapshots KPI pour un projet et une période donnée.

    Niveaux générés :
        1. Par site    — un snapshot par site associé au projet (ProjectSite M2M)
        2. Global      — agrégat tous sites confondus
        3. Par dev     — un snapshot par développeur validé
                         + calcul du score et du classement dans le site
    """
    # ── Résolution de la plage de dates du mois (Source Unique de Vérité) ──
    start_date, end_date = get_period_date_range_exclusive(year, month)

    period = self.period_repo.get_by_year_month(self.db, year, month)
    if not period:
        raise ValueError(f"Period {year}/{month:02d} not found")

    #  Harmonisation Mission-Strict (FIX 1: Matérialisation unique)
    eligible_ids = get_certified_developers_for_mission(
        db=self.db, project_id=project_id, period_id=period.id,
        start_date=start_date.date(), end_date=end_date.date()
    )

    # ── Nettoyage des snapshots agrégés périmés (site / global / groupe) ──
    self.db.query(KpiSnapshot).filter(
        KpiSnapshot.project_id   == project_id,
        KpiSnapshot.period_id    == period.id,
        KpiSnapshot.developer_id.is_(None),   # site, global et groupe uniquement
    ).delete(synchronize_session=False)
    self.db.flush()

    #  Élagage des snapshots de développeurs obsolètes (SCD Type 2 Rebalancing)
    self._prune_stale_developer_snapshots(project_id, period.id, eligible_ids)

    snapshots = []

    # ── Résolution des sites impactés pour cette période
    project_site_ids = self._get_project_site_ids(project_id, period.id)

    # ── 1. Snapshot par site du projet ────────────────────────────────────
    if project_site_ids:
        for site_id in project_site_ids:
            kpis = self.calculator.calculate_for_site(
                project_id, site_id, start_date, end_date, eligible_ids=eligible_ids
            )
            kpis["site_id"] = site_id
            snapshot = self._upsert_with_deltas(
                kpis=kpis, period_id=period.id,
                year=year, month=month, lot_id=lot_id,
            )
            snapshots.append(snapshot)
```

### Ce qui se passe
- Le service calcule la fenêtre temporelle du mois
- Il identifie les développeurs certifiés pour la mission via `get_certified_developers_for_mission()`
- Il nettoie les snapshots périmés
- Il génère les snapshots par site, global, et par développeur
- Il utilise `KpiCalculator.calculate_for_site()` pour calculer les KPI

---

## ÉTAPE 6 : Backend - Calcul des KPI avec Intelligence Mission

**Fichier** : `dataCollection/src/backend/app/services/kpi/kpi_calculator.py`

**Chemin complet** : `c:\Users\ranim\Downloads\gitlab-kpi-dashboard-versionaprescorrectionMAIimportant\dataCollection\src\backend\app\services\kpi\kpi_calculator.py`

### Code Backend (Ligne 96-178)
```python
def calculate_project_kpis(
    self,
    project_id:   int,
    start_date:   datetime,
    end_date:     datetime,
    site_id:      Optional[int] = None,
    group_id:     Optional[int] = None,
    developer_id: Optional[int] = None,
    eligible_ids: Optional[list] = None,
) -> dict:

    # 1. Volumes bruts
    nb_commits_project = self._count_all_project_commits(project_id, start_date, end_date, site_id=site_id)
    nb_devs            = self._count_developers(project_id, start_date, end_date, site_id, group_id, developer_id, eligible_ids)
    nb_commits_devs    = self._count_commits_by_devs(project_id, start_date, end_date, site_id, group_id, developer_id, eligible_ids)
    nb_mrs             = self._count_mrs(project_id, start_date, end_date, site_id, group_id, developer_id, eligible_ids)
    nb_mrs_approved    = self._count_approved_mrs(project_id, start_date, end_date, site_id, group_id, developer_id, eligible_ids)
    nb_mrs_with_time   = self._count_approved_mrs(project_id, start_date, end_date, site_id, group_id, developer_id, eligible_ids, with_time_only=True)
    nb_mrs_merged      = self._count_merged_mrs(project_id, start_date, end_date, site_id, group_id, developer_id, eligible_ids)
    sum_review_time    = self._sum_review_time(project_id, start_date, end_date, site_id, group_id, developer_id, eligible_ids)

    denom = max(nb_devs, 1)

    mr_rate_per_site      = round(nb_mrs / denom, 4)
    approved_mr_rate      = min(1.0, round(nb_mrs_approved / nb_mrs, 4))         if nb_mrs > 0          else 0.0
    merged_mr_rate        = min(1.0, round(nb_mrs_merged / nb_mrs_approved, 4))  if nb_mrs_approved > 0 else 0.0
    commit_rate_per_site  = round(nb_commits_devs / denom, 4)
    avg_review_time_hours = round(sum_review_time / nb_mrs_with_time, 2) if nb_mrs_with_time > 0 else 0.0

    kpis = {
        "mr_rate_per_site":        mr_rate_per_site,
        "approved_mr_rate":        approved_mr_rate,
        "merged_mr_rate":          merged_mr_rate,
        "commit_rate_per_site":    commit_rate_per_site,
        "nb_commits_per_project":  nb_commits_project,
        "avg_review_time_hours":   avg_review_time_hours,
        "nb_developers":           nb_devs,
        "total_commits":           nb_commits_devs,
        "total_mrs_created":       nb_mrs,
        "total_mrs_approved":      nb_mrs_approved,
        "total_mrs_merged":        nb_mrs_merged,
        "review_time_hours":       round(sum_review_time, 2),
        # ...
    }

    return kpis
```

### Ce qui se passe
- Le service compte les volumes bruts (commits, MRs, développeurs)
- Il utilise `nb_devs` comme dénominateur pour calculer les KPI par développeur
- Il calcule les KPI : `mr_rate_per_site`, `commit_rate_per_site`, etc.
- Il retourne les KPI avec `nb_developers` pour affichage

---

## ÉTAPE 7 : Backend - Comptage Dynamique des Développeurs

**Fichier** : `dataCollection/src/backend/app/services/kpi/kpi_calculator.py`

### Code Backend (Ligne 266-283)
```python
def _count_developers(
    self, 
    project_id: int, 
    start_date: datetime,
    end_date: datetime,
    site_id: Optional[int] = None, 
    group_id: Optional[int] = None, 
    developer_id: Optional[int] = None,
    eligible_ids: Optional[list] = None
) -> int:
    """
    [SENIOR STRATEGY] Assigned Headcount (Full Squad).
    Compte tous les développeurs officiellement affectés au projet/site.
    Indispensable pour le pilotage de la capacité et du ROI.
    """
    # On utilise le helper d'ID qui gère déjà les filtres Project/Site/Group
    q = self._active_dev_ids_query(project_id, start_date, end_date, site_id, group_id, developer_id, eligible_ids)
    return q.count()
```

### Ce qui se passe
- Le service utilise `_active_dev_ids_query()` pour identifier les développeurs actifs
- Il applique les filtres de site, groupe, développeur
- Il utilise `eligible_ids` si fourni (développé par `get_certified_developers_for_mission()`)
- Il retourne le nombre de développeurs

---

## ÉTAPE 8 : Backend - Query des Développeurs Actifs avec Intelligence Mission

**Fichier** : `dataCollection/src/backend/app/services/kpi/kpi_calculator.py`

### Code Backend (Ligne 184-264)
```python
def _active_dev_ids_query(self, project_id: int, start_date: datetime, end_date: datetime, site_id: Optional[int], group_id: Optional[int], developer_id: Optional[int], eligible_ids: Optional[list] = None):
    """
    [SENIOR] Retourne les IDs de développeurs ASSIGNÉS pour cette période.
    Optimisé : Utilise une sous-requête SQL au lieu d'une liste d'IDs Python.
    """
    if eligible_ids is not None:
        # ✅ [FIX 1] Si les IDs sont déjà matérialisés, on les utilise directement
        q = self.db.query(Developer.id).filter(
            Developer.id.in_(eligible_ids)
        )
    else:
        # ✅ [SENIOR] Mise en cache de la requête de base pour éviter de la reconstruire 7x
        cache_key = (project_id, start_date, end_date)
        if not hasattr(self, '_base_mission_query_cache'):
            self._base_mission_query_cache = {}
        
        if cache_key not in self._base_mission_query_cache:
            # Résolution de la période pour le scoping temporel strict
            period = self.db.query(Period).filter(
                Period.year == start_date.year,
                Period.month == start_date.month
            ).first()

            # ✅ [SENIOR] Calcul du mois suivant sans dépendance externe
            next_month = start_date.month + 1
            next_year = start_date.year
            if next_month > 12:
                next_month = 1
                next_year += 1
            end_date_month = datetime(next_year, next_month, 1)

        # ✅ [SENIOR++++] SQL Composition : on récupère une QUERY, pas une LISTE
            from app.utils.mission_utils import get_certified_developers_query
            period_id = period.id if period else None
            subq = get_certified_developers_query(
                db=self.db, project_id=project_id, period_id=period_id,
                start_date=start_date.date(), end_date=end_date_month.date()
            ).subquery()
            self._base_mission_query_cache[cache_key] = subq

        mission_subq = self._base_mission_query_cache[cache_key]
        # ✅ [FIX] Ajout de .distinct() pour éviter les doublons si un dev a plusieurs missions
        # ✅ [RG-02] threshold via get_rg02_threshold() — Source de Vérité Unique
        threshold_date = get_rg02_threshold(start_date.year, start_date.month)

        q = self.db.query(Developer.id).distinct().filter(
            Developer.id.in_(select(mission_subq.c.id)),
            # ✅ [INTELLIGENT] Respect strict des dates contractuelles RH + Règle des 15 jours
            or_(Developer.onboarding_date.is_(None), Developer.onboarding_date < end_date.date()),
            or_(Developer.offboarding_date.is_(None), Developer.offboarding_date >= threshold_date)
        )

    # ✅ [STRICT TEMPORAL INTEGRITY] Respect strict des dates d'affectation (SCD Type 2)
    # S'applique même si eligible_ids est fourni.
    if site_id is not None:
        q = q.join(
            DeveloperSite,
            (DeveloperSite.developer_id == Developer.id)
        ).filter(
            DeveloperSite.site_id == site_id,
            DeveloperSite.start_date < end_date.date(),
            or_(DeveloperSite.end_date >= start_date.date(), DeveloperSite.is_active.is_(True))
        )

    if group_id is not None and developer_id is None:
        # ✅ [SENIOR++++] SCD Type 2 Robust Intersection
        from app.models.developer_group import DeveloperGroupLink
        q = q.join(
            DeveloperGroupLink,
            (DeveloperGroupLink.developer_id == Developer.id) &
            (DeveloperGroupLink.group_id     == group_id) &
            (DeveloperGroupLink.start_date    <  end_date.date()) &
            ((DeveloperGroupLink.end_date    >= start_date.date()) | (DeveloperGroupLink.is_active.is_(True)))
        )

    if developer_id is not None:
        q = q.filter(Developer.id == developer_id)

    return q
```

### Ce qui se passe
- Le service utilise `get_certified_developers_query()` pour identifier les développeurs certifiés
- Il applique la **Règle des 15 jours (RG-02)** via `get_rg02_threshold()`
- Il vérifie les dates contractuelles RH (onboarding_date, offboarding_date)
- Il applique les filtres de site et groupe avec segments temporels (SCD Type 2)
- Il retourne une query SQL optimisée

**En base de données** :
```sql
SELECT DISTINCT developer.id
FROM developer
WHERE developer.id IN (
    SELECT developer.id
    FROM developer
    JOIN developer_project ON developer_project.developer_id = developer.id AND developer_project.project_id = 1234
    JOIN developer_site ON developer_site.developer_id = developer.id
    JOIN developer_group_link ON developer_group_link.developer_id = developer.id
    WHERE developer.is_bot = false
      AND (developer.onboarding_date IS NULL OR developer.onboarding_date < '2024-12-31')
      AND (developer.offboarding_date IS NULL OR developer.offboarding_date >= '2024-12-15')
      AND (developer_site.start_date IS NULL OR developer_site.start_date < '2024-12-31')
      AND (developer_site.end_date IS NULL OR developer_site.end_date >= '2024-12-01')
      AND (developer_group_link.start_date IS NULL OR developer_group_link.start_date < '2024-12-31')
      AND (developer_group_link.end_date IS NULL OR developer_group_link.end_date >= '2024-12-01')
      AND (developer_project.start_date IS NULL OR developer_project.start_date < '2024-12-31')
      AND (developer_project.end_date IS NULL OR developer_project.end_date >= '2024-12-01')
)
)
AND developer.site_id = 1;
```

---

## ÉTAPE 9 : Backend - Intelligence Mission (get_certified_developers_for_mission)

**Fichier** : `dataCollection/src/backend/app/utils/mission_utils.py`

**Chemin complet** : `c:\Users\ranim\Downloads\gitlab-kpi-dashboard-versionaprescorrectionMAIimportant\dataCollection\src\backend\app\utils\mission_utils.py`

### Code Backend (Ligne 39-130)
```python
def get_certified_developers_query(
    db: Session,
    project_id: int,
    period_id: Optional[int] = None,
    start_date: Optional[date] = None,
    end_date: Optional[date] = None,
    eligible_ids: Optional[List[int]] = None
):
    """
    [SENIOR] Version Query de la logique Mission-Strict.
    Permet l'utilisation comme sous-requête pour éviter les N+1 et les clauses IN massives.
    """
    # Calcul de la fenêtre temporelle
    if not start_date or not end_date:
        if period_id:
            period = db.query(Period).filter(Period.id == period_id).first()
            if period:
                start_date = date(period.year, period.month, 1)
                if period.month == 12:
                    end_date = date(period.year + 1, 1, 1)
                else:
                    end_date = date(period.year, period.month + 1, 1)
    
    # [STRICT CYCLE DE VIE] Règle des 15 jours (RG-02)
    threshold_date = date(start_date.year, start_date.month, 15)

    # ── [FIX SUSPENSION] Vérification TRIPLE : Site + Groupe + Projet ─────────────
    query = (
        db.query(Developer.id)
        .join(DeveloperProject, (DeveloperProject.developer_id == Developer.id) & (DeveloperProject.project_id == project_id))
        # Join DeveloperSite temporel (SCD Type 2)
        .join(DeveloperSite, (DeveloperSite.developer_id == Developer.id))
        # Join DeveloperGroupLink temporel (SCD Type 2)
        .join(DeveloperGroupLink, (DeveloperGroupLink.developer_id == Developer.id))
        .filter(
            Developer.is_bot.is_(False),
            
            # [STRICT CYCLE DE VIE] Respect des dates contractuelles RH globales + Règle des 15 jours
            or_(Developer.onboarding_date.is_(None), Developer.onboarding_date < end_date),
            or_(Developer.offboarding_date.is_(None), Developer.offboarding_date >= threshold_date),

            # [SCD2 TEMPORAL - SITE] Le segment de site doit couvrir la période
            or_(DeveloperSite.start_date.is_(None), DeveloperSite.start_date < end_date),
            or_(DeveloperSite.end_date.is_(None), DeveloperSite.end_date >= start_date),

            # [SCD2 TEMPORAL - GROUPE] Le segment de groupe doit couvrir la période
            or_(DeveloperGroupLink.start_date.is_(None), DeveloperGroupLink.start_date < end_date),
            or_(DeveloperGroupLink.end_date.is_(None), DeveloperGroupLink.end_date >= start_date),
        )
        .distinct()
    )

    if eligible_ids:
        query = query.filter(Developer.id.in_(eligible_ids))

    # [STRICT TEMPORAL SCOPE] La mission spécifique au projet doit couvrir la période
    query = query.filter(
        or_(DeveloperProject.start_date.is_(None), DeveloperProject.start_date < end_date),
        or_(DeveloperProject.end_date.is_(None), DeveloperProject.end_date >= start_date)
    )
    return query
```

### Ce qui se passe
- Le service construit une requête SQL complexe pour identifier les développeurs certifiés
- Il applique la **Vérification Triple** : Site + Groupe + Projet
- Il applique la **Règle des 15 jours (RG-02)** pour les offboardings
- Il utilise les segments temporels (SCD Type 2) pour vérifier la couverture
- Il retourne une query SQL optimisée

---

## ÉTAPE 10 : Backend - Insertion des Snapshots KPI

**Fichier** : `dataCollection/src/backend/app/services/kpi/kpi_aggregator.py`

### Code Backend (Méthode _upsert_with_deltas)
```python
def _upsert_with_deltas(
    self,
    kpis: dict,
    period_id: int,
    year: int,
    month: int,
    lot_id: Optional[int] = None,
    site_id: Optional[int] = None,
    group_id: Optional[int] = None,
    developer_id: Optional[int] = None,
) -> KpiSnapshot:
    """
    Upsert d'un snapshot KPI avec calcul des deltas vs période précédente.
    """
    # Récupération du snapshot précédent pour calculer les deltas
    prev_period = self.period_repo.get_previous(self.db, year, month)
    prev_snapshot = None
    if prev_period:
        prev_snapshot = self.snapshot_repo.get_by_scope(
            self.db, project_id=kpis["project_id"],
            period_id=prev_period.id,
            site_id=site_id,
            group_id=group_id,
            developer_id=developer_id
        )
    
    # Calcul des deltas
    deltas = {}
    if prev_snapshot:
        for kpi_field in ["mr_rate_per_site", "commit_rate_per_site", "approved_mr_rate", "avg_review_time_hours"]:
            current = kpis.get(kpi_field, 0)
            previous = getattr(prev_snapshot, kpi_field, 0)
            delta = current - previous
            deltas[f"delta_{kpi_field}"] = delta
    
    # Création ou mise à jour du snapshot
    snapshot = KpiSnapshot(
        project_id=kpis["project_id"],
        period_id=period_id,
        year=year,
        month=month,
        site_id=site_id,
        group_id=group_id,
        developer_id=developer_id,
        lot_id=lot_id,
        
        mr_rate_per_site=kpis["mr_rate_per_site"],
        commit_rate_per_site=kpis["commit_rate_per_site"],
        approved_mr_rate=kpis["approved_mr_rate"],
        avg_review_time_hours=kpis["avg_review_time_hours"],
        nb_developers=kpis["nb_developers"],
        total_commits=kpis["total_commits"],
        total_mrs_created=kpis["total_mrs_created"],
        total_mrs_approved=kpis["total_mrs_approved"],
        total_mrs_merged=kpis["total_mrs_merged"],
        
        # Deltas
        delta_mr_rate=deltas.get("delta_mr_rate_per_site"),
        delta_commit_rate=deltas.get("delta_commit_rate_per_site"),
        delta_approved_rate=deltas.get("delta_approved_mr_rate"),
        delta_review_time=deltas.get("delta_avg_review_time_hours"),
        
        created_at=datetime.now(timezone.utc),
    )
    
    self.db.add(snapshot)
    self.db.flush()
    return snapshot
```

### Ce qui se passe
- Le service récupère le snapshot précédent pour calculer les deltas
- Il calcule les deltas pour chaque KPI
- Il crée ou met à jour le snapshot KPI
- Il stocke les KPI calculés avec `nb_developers`

**En base de données** :
```sql
INSERT INTO kpi_snapshot (
    project_id, period_id, year, month, site_id, group_id, developer_id,
    mr_rate_per_site, commit_rate_per_site, approved_mr_rate, avg_review_time_hours,
    nb_developers, total_commits, total_mrs_created, total_mrs_approved,
    delta_mr_rate, delta_commit_rate, delta_approved_rate, delta_review_time,
    created_at
)
VALUES (
    1234, 5, 2024, 12, 1, NULL, NULL,
    5.2, 12.5, 0.85, 18.5,
    17, 212, 88, 75,
    +0.3, +1.2, -0.05, -2.1,
    NOW()
);
```

---

## ÉTAPE 11 : Frontend - Affichage des KPI avec nb_developers

**Fichier** : `dataCollection/src/frontend/src/pages/ComparativeAnalyticsPage.jsx`

### Code Frontend (Ligne 1559-1597)
```javascript
const executiveSummary = useMemo(() => {
  if (!trends.length) return null;
  const lastPeriod = trends[trends.length - 1]?.period_label;
  const currentData = trends.filter(t => t.period_label === lastPeriod);
  if (currentData.length === 0) return null;
  
  const bestVelocity = [...currentData].sort((a,b) => b.metrics.velocity - a.metrics.velocity)[0];
  const slowReviews = currentData.filter(t => t.metrics.review_time > 48);
  const avgQuality = currentData.reduce((acc, c) => acc + (c.metrics.quality_score || 0), 0) / currentData.length;
  const avgQualityPct = avgQuality <= 1 ? avgQuality * 100 : avgQuality;
  
  let text = `Pour la période de ${lastPeriod}, l'analyse comparative montre que la dynamique est principalement tirée par ${bestVelocity?.entity_name || 'une entité'} qui se distingue avec la meilleure vélocité (${fmt(bestVelocity?.metrics?.velocity)} commits/dev). `;
  
  if (avgQualityPct > 85) {
    text += `La qualité globale du code est à un excellent niveau (${fmt(avgQualityPct, 0)}% d'approbation). `;
  } else {
    text += `La qualité globale du code nécessite une attention particulière (${fmt(avgQualityPct, 0)}% d'approbation). `;
  }
  
  if (slowReviews.length > 0) {
    text += `⚠️ Attention cependant au goulot d'étranglement identifié sur ${slowReviews.length} entité(s) (${slowReviews.map(s => s.entity_name).join(', ')}) où le temps de revue dépasse les 48 heures.`;
  } else {
    text += `Le flux de revue est fluide sur l'ensemble du périmètre (aucun site critique > 48h).`;
  }
  
  return { title: `Résumé Exécutif — ${lastPeriod}`, text };
}, [trends]);

const healthScore = useMemo(() => {
  if (!trends.length) return 0;
  const latest = trends[trends.length - 1];
  if (!latest) return 0;
  
  const vScore = Math.min(100, (latest.metrics.velocity / 6) * 100);
  const qScore = (latest.metrics.quality_score || 0) * 100;
  const rScore = Math.max(0, 100 - (latest.metrics.review_time / 72) * 100);
  
  return Math.round((vScore * 0.4) + (qScore * 0.4) + (rScore * 0.2));
}, [trends]);
```

### Ce qui se passe
- Le frontend utilise les données de `trends` (snapshots KPI)
- Il calcule le résumé exécutif avec les métriques
- Il calcule le score de santé (health score) avec les métriques
- Il affiche les KPI avec `nb_developers` pour contextualiser

---

## Résumé Chronologique du Flux de Calcul des KPI

| Étape | Couche | Fichier | Action | Résultat |
|-------|-------|--------|--------|----------|
| 1 | Frontend | `ComparativeAnalyticsPage.jsx` | Chargement intelligence | Appel `getAdminIntelligence()` |
| 2 | Frontend | `analyticsService.js` | Appel API | Envoi GET `/intelligence/admin/{projectId}` |
| 3 | Backend | `intelligence.py` | Réception GET | Parse `site_ids` + filtres rôle |
| 4 | Backend | `intelligence.py` | Service intelligence | Appel `get_admin_intelligence()` |
| 5 | Backend | `intelligence.py` | Récupération snapshots | `kpi_snapshot_repo.get_by_project_period()` |
| 6 | Backend | `kpi_aggregator.py` | Génération snapshots | `generate_monthly_snapshots()` |
| 7 | Backend | `mission_utils.py` | Intelligence mission | `get_certified_developers_for_mission()` |
| 8 | Backend | `kpi_calculator.py` | Calcul KPI | `calculate_project_kpis()` |
| 9 | Backend | `kpi_calculator.py` | Comptage développeurs | `_count_developers()` |
| 10 | Backend | `kpi_calculator.py` | Query développeurs actifs | `_active_dev_ids_query()` |
| 11 | Backend | `kpi_aggregator.py` | Insertion snapshots | `_upsert_with_deltas()` |
| 12 | Frontend | `ComparativeAnalyticsPage.jsx` | Affichage KPI | Affichage avec `nb_developers` |

---

## Points Clés de l'Intelligence du Calcul des KPI

### 1. Nombre de Développeurs Dynamique

Le nombre de développeurs (`nb_developers`) est **dynamique** selon les actions de gestion :

**A. Mutation Historique (Case B)**
- Si un développeur change de site via mutation historique
- Le nombre de développeurs pour l'ancien site diminue
- Le nombre de développeurs pour le nouveau site augmente
- Les KPI par développeur sont recalculés avec les nouveaux dénominateurs

**B. Correction Rétroactive (Case A)**
- Si un développeur est corrigé rétroactivement
- Le nombre de développeurs est recalculé pour toute la période
- Les KPI par développeur sont recalculés avec le nouveau dénominateur

**C. Activation/Désactivation**
- Si un développeur est désactivé
- Le nombre de développeurs diminue pour les périodes futures
- Les KPI par développeur sont recalculés avec le nouveau dénominateur

**D. Archivage (Offboarding)**
- Si un développeur est archivé avec date de sortie
- Le nombre de développeurs applique la **Règle des 15 jours (RG-02)**
- Les KPI par développeur sont recalculés avec le nouveau dénominateur

### 2. Division par nb_developers

Certains KPI sont divisés par `nb_developers` pour obtenir des métriques par développeur :

```python
denom = max(nb_devs, 1)

mr_rate_per_site      = round(nb_mrs / denom, 4)
commit_rate_per_site  = round(nb_commits_devs / denom, 4)
```

**Exemple** :
```
Site Tunis :
- nb_mrs = 88
- nb_developers = 17
- mr_rate_per_site = 88 / 17 = 5.18 MRs/dev

Site Paris :
- nb_mrs = 120
- nb_developers = 25
- mr_rate_per_site = 120 / 25 = 4.8 MRs/dev
```

### 3. Règle des 15 jours (RG-02)

La **Règle des 15 jours (RG-02)** est appliquée pour compter les développeurs :

```python
threshold_date = date(start_date.year, start_date.month, 15)

or_(Developer.offboarding_date.is_(None), Developer.offboarding_date >= threshold_date)
```

**Exemple** :
```
Ahmed Ben Ali :
- offboarding_date = 2024-12-20

Décembre 2024 :
- threshold_date = 2024-12-15
- offboarding_date (20) >= threshold_date (15) = TRUE
- Ahmed est compté dans nb_developers

Janvier 2025 :
- threshold_date = 2025-01-15
- offboarding_date (20) >= threshold_date (15) = FALSE
- Ahmed n'est PAS compté dans nb_developers
```

### 4. Vérification Triple (Site + Groupe + Projet)

La **Vérification Triple** est appliquée pour exclure les suspensions :

```python
.join(DeveloperSite, (DeveloperSite.developer_id == Developer.id))
.join(DeveloperGroupLink, (DeveloperGroupLink.developer_id == Developer.id))
.join(DeveloperProject, (DeveloperProject.developer_id == Developer.id) & (DeveloperProject.project_id == project_id))
```

**Exemple** :
```
Ahmed Ben Ali :
- Suspendu du 01/09/2024 au 30/09/2024
- Segment site : Tunis (01/01/2024 - 31/08/2024) + NULL (suspension)
- Segment groupe : Backend (01/01/2024 - 31/08/2024) + NULL (suspension)

Septembre 2024 :
- Site : PAS de segment actif → Exclu
- Groupe : PAS de segment actif → Exclu
- Ahmed n'est PAS compté dans nb_developers
```

---

## Conclusion

Le calcul des KPI est **intelligent** et **contextuel** :

1. **Intelligence aux missions** : Vérification triple (Site + Groupe + Projet) + Règle des 15 jours (RG-02)
2. **Intelligence aux actions de gestion** : Réaction aux mutations, corrections, activations/désactivations, archivages
3. **Nombre de développeurs dynamique** : Recalculé selon les actions de gestion
4. **Division par nb_developers** : KPI par développeur pour normalisation
5. **Segments temporels (SCD Type 2)** : Utilisés pour vérifier la couverture temporelle
6. **Snapshots KPI** : Stockés avec `nb_developers` pour traçabilité

Cette architecture permet un calcul des KPI **précis**, **traçable** et **contextuel** qui réagit intelligemment aux actions de gestion des développeurs dans la page Admin.
