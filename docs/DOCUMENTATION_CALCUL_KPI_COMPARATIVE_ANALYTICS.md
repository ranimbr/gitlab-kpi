# Documentation du Calcul et Affichage des KPIs
## Page ComparativeAnalyticsPage.jsx

## Table des Matières

1. [Vue d'Ensemble](#vue-densemble)
2. [Architecture du Système](#architecture-du-système)
3. [Flux de Calcul des KPIs](#flux-de-calcul-des-kpis)
4. [Flux d'Affichage dans ComparativeAnalyticsPage.jsx](#flux-daffichage-dans-comparativeanalyticspagejsx)
5. [Composants Techniques](#composants-techniques)
6. [Exemple Complet : Calcul et Affichage](#exemple-complet--calcul-et-affichage)

---

## Vue d'Ensemble

### Objectif
La page **ComparativeAnalyticsPage.jsx** est un dashboard de Business Intelligence qui permet de :
- Comparer les tendances entre Sites (ex: France vs Tunisie)
- Comparer les tendances entre Équipes (Teams)
- Visualiser l'évolution historique des KPIs de vélocité et qualité
- Afficher des recommandations d'intelligence (anomalies, corrélations)

### Architecture Globale

```
┌─────────────────────────────────────────────────────────────────────────┐
│                    FRONTEND (React)                              │
│              ComparativeAnalyticsPage.jsx                              │
└────────────────────┬────────────────────────────────────────────────────────┘
                     │ HTTP GET /api/v1/analytics/...
                     ▼
┌────────────────────┴────────────────────────────────────────────────────────┐
│                    BACKEND (FastAPI)                              │
│              analytics.py (Router API)                              │
└────────────────────┬────────────────────────────────────────────────────────┘
                     │
                     ▼
┌────────────────────┴────────────────────────────────────────────────────────┐
│              SERVICES BACKEND (Business Logic)                        │
│  ┌──────────────────────────────────────────────────────────────────────┐ │
│  │ KpiAggregator (kpi_aggregator.py)                             │ │
│  │ - Génération des snapshots KPIs mensuels                           │ │
│  │ - Calcul des métriques par site/groupe/développeur              │ │
│  └──────────────────────────────────────────────────────────────────────┘ │
│  ┌──────────────────────────────────────────────────────────────────────┐ │
│  │ AnalyticsService (analytics_service.py)                             │ │
│  │ - Récupération des snapshots KPIs                                        │
│  │ - Calcul des tendances comparatives                                          │
│  │ - Intelligence statistique (anomalies, recommandations)              │ │
│  └──────────────────────────────────────────────────────────────────────┘ │
│  ┌──────────────────────────────────────────────────────────────────────┐ │
│  │ KpiCalculator (kpi_calculator.py)                             │ │
│  │ - Calcul des métriques brutes (commits, MRs, commentaires)     │ │
│  │ - Calcul des scores de performance (developer_score)                │ │
│  │ - Calcul des ratios (mr_rate, approved_rate)                      │
│  └──────────────────────────────────────────────────────────────────────┘ │
└────────────────────┬────────────────────────────────────────────────────────┘
                     │
                     ▼
┌────────────────────┴────────────────────────────────────────────────────────┐
│              BASE DE DONNÉES (PostgreSQL)                              │
│  - KpiSnapshot (snapshots KPIs)                                            │
│  - Commit (commits)                                                       │
│  - MergeRequest (merge requests)                                            │
│  - Developer (développeurs)                                                 │
│  - DeveloperSite (affectations site)                                             │
│  - DeveloperGroupLink (affectations équipes)                                   │
│  - DeveloperProject (missions projet)                                           │
│  - Period (périodes)                                                     │
└─────────────────────────────────────────────────────────────────────────┘
```

---

## Architecture du Système

### 1. Frontend - ComparativeAnalyticsPage.jsx

**Fichier :** `dataCollection/src/frontend/src/pages/ComparativeAnalyticsPage.jsx`

**Responsabilités :**
- Interface utilisateur pour l'analyse comparative
- Appels API via analyticsService
- Affichage des graphiques avec ReactApexChart
- Gestion de l'état (loading, error, empty states)
- Affichage des recommandations d'intelligence

### 2. Frontend - analyticsService.js

**Fichier :** `dataCollection/src/frontend/src/services/analyticsService.js`

**Responsabilités :**
- Service canonique pour tous les appels KPI/analytics
- Construction des requêtes HTTP vers le backend
- Transformation des réponses API pour le frontend
- Gestion des paramètres de requête

### 3. Backend - analytics.py

**Fichier :** `dataCollection/src/backend/app/api/routers/analytics.py`

**Responsabilités :**
- Définition des routes API REST (FastAPI)
- Contrôle d'accès multi-tenant (site_manager, team_lead, project_manager)
- Validation des paramètres de requête
- Appel des services métier (AnalyticsService, KpiAggregator)

### 4. Backend - AnalyticsService

**Fichier :** `dataCollection/src/backend/app/services/kpi/analytics_service.py`

**Responsabilités :**
- Récupération des snapshots KPIs depuis la base de données
- Calcul des tendances comparatives
- Génération des insights pour les managers
- Calcul des métriques d'agrégation globale

### 5. Backend - KpiAggregator

**Fichier :** `dataCollection/src/backend/app/services/kpi/kpi_aggregator.py`

**Responsabilités :**
- Génération des snapshots KPIs mensuels
- Calcul des métriques par site/groupe/développeur
- Application de la règle RG-02 (15 jours) pour le headcount
- Nettoyage des snapshots obsolètes

### 6. Backend - KpiCalculator

**Fichier :** `dataCollection/src/backend/app/services/kpi/kpi_calculator.py`

**Responsabilités :**
- Calcul des métriques brutes depuis les données GitLab
- Calcul des scores de performance (developer_score)
- Calcul des ratios (mr_rate, approved_rate)
- Application des filtres temporels et de mission

---

## Flux de Calcul des KPIs

### Étape 1 : Génération des Snapshots KPIs

**Déclenchement :**
- Extraction GitLab terminée (lot d'extraction)
- Admin clique sur "Générer Snapshots" OU génération automatique après extraction

**Code Backend :**
```python
# kpi_aggregator.py
class KpiAggregator:
    def generate_monthly_snapshots(
        self, project_id: int, year: int, month: int, lot_id: Optional[int] = None
    ) -> List[KpiSnapshot]:
        # Résolution de la plage de dates du mois
        start_date, end_date = get_period_date_range_exclusive(year, month)
        
        # Harmonisation Mission-Strict (FIX 1)
        eligible_ids = get_certified_developers_for_mission(
            db=self.db, project_id=project_id, period_id=period.id,
            start_date=start_date.date(), end_date=end_date.date()
        )
        
        # Nettoyage des snapshots agrégés périmés
        self.db.query(KpiSnapshot).filter(
            KpiSnapshot.project_id == project_id,
            KpiSnapshot.period_id == period.id,
            KpiSnapshot.developer_id.is_(None)
        ).delete()
        
        # Résolution des sites impactés pour cette période
        project_site_ids = self._get_project_site_ids(project_id, period.id)
        
        # 1. Snapshot par site du projet
        for site_id in project_site_ids:
            kpis = self.calculator.calculate_for_site(
                project_id, site_id, start_date, end_date, eligible_ids=eligible_ids
            )
            snapshot = self._upsert_with_deltas(
                kpis=kpis, period_id=period.id,
                year=year, month=month, lot_id=lot_id
            )
            snapshots.append(snapshot)
        
        # 2. Snapshot global
        global_kpis = self.calculator.calculate_global(project_id, start_date, end_date, eligible_ids=eligible_ids)
        global_snapshot = self._upsert_with_deltas(
            kpis=global_kpis, period_id=period.id,
            year=year, month=month, lot_id=lot_id
        )
        snapshots.append(global_snapshot)
        
        # 3. Snapshot par groupe
        project_group_ids = self._get_project_group_ids(project_id, period.id)
        for group_id in project_group_ids:
            kpis = self.calculator.calculate_for_group(
                project_id, group_id, start_date, end_date, eligible_ids=eligible_ids
            )
            snapshot = self._upsert_with_deltas(
                kpis=kpis, period_id=period.id,
                year=year, month=month, lot_id=lot_id
            )
            snapshots.append(snapshot)
        
        # 4. Snapshots individuels par développeur
        for developer in developers:
            dev_kpis = self.calculator.calculate_for_developer(
                project_id=project_id, developer_id=developer.id,
                start_date=start_date, end_date=end_date, eligible_ids=eligible_ids
            )
            snapshot = self._upsert_with_deltas(
                kpis=dev_kpis, period_id=period.id,
                year=year, month=month, lot_id=lot_id,
                developer_id=developer.id
            )
            snapshots.append(snapshot)
```

**Méthodes Clés de KpiCalculator :**
- `calculate_for_site()` : Métriques par site (commits, MRs, commentaires)
- `calculate_for_group()` : Métriques par groupe
- `calculate_for_developer()` : Métriques individuelles + score
- `calculate_global()` : Agrégation globale (tous projets)

---

### Étape 2 : Calcul des Métriques Brutes

**Code Backend :**
```python
# kpi_calculator.py
class KpiCalculator:
    def calculate_for_site(
        self, project_id: int, site_id: int,
        start_date: date, end_date: date,
        eligible_ids: List[int]
    ) -> Dict[str, Any]:
        # 1. Calcul des commits
        commits = self._calculate_commits(
            project_id, site_id, start_date, end_date, eligible_ids
        )
        
        # 2. Calcul des merge requests
        mrs = self._calculate_merge_requests(
            project_id, site_id, start_date, end_date, eligible_ids
        )
        
        # 3. Calcul des commentaires
        comments = self._calculate_comments(
            project_id, site_id, start_date, end_date, eligible_ids
        )
        
        # 4. Calcul des métriques dérivées
        mr_rate_per_site = (
            (mrs["total_mrs_created"] / eligible_count)
            if eligible_count > 0 else 0
        )
        approved_mr_rate = (
            (mrs["total_mrs_approved"] / mrs["total_mrs_created"])
            if mrs["total_mrs_created"] > 0 else 0
        )
        
        # 5. Calcul du score de performance
        developer_score = self._calculate_developer_score(
            commits, mrs, comments
        )
```

**Méthodes Clés de Calcul :**
- `_calculate_commits()` : Requête SQL avec filtres temporels et de mission
- `_calculate_merge_requests()` : Requête SQL avec filtres temporels et de mission
- `_calculate_comments()` : Requête SQL avec filtres temporels et de mission
- `_calculate_developer_score()` : Formule pondérée (vélocité, qualité, réactivité)

---

### Étape 3 : Stockage des Snapshots

**Code Backend :**
```python
# kpi_aggregator.py
def _upsert_with_deltas(
    self, kpis: Dict[str, Any], period_id: int,
    year: int, month: int, lot_id: Optional[int],
    site_id: Optional[int] = None, group_id: Optional[int] = None,
    developer_id: Optional[int] = None
) -> KpiSnapshot:
    # Vérification si snapshot existe déjà
    existing = self.snapshot_repo.get_by_project_period_site(
        self.db, project_id=project_id, period_id=period_id,
        site_id=site_id, group_id=group_id, developer_id=developer_id
    )
    
    # Création ou mise à jour
    snapshot = KpiSnapshot(
        project_id=project_id,
        period_id=period_id,
        site_id=site_id,
        group_id=group_id,
        developer_id=developer_id,
        snapshot_date=date.today(),
        # Métriques calculées
        mr_rate_per_site=kpis.get("mr_rate_per_site", 0),
        approved_mr_rate=kpis.get("approved_mr_rate", 0),
        commit_rate_per_site=kpis.get("commit_rate_per_site", 0),
        total_commits=kpis.get("total_commits", 0),
        total_mrs_created=kpis.get("total_mrs", 0),
        total_mrs_approved=kpis.get("total_mrs_approved", 0),
        avg_review_time_hours=kpis.get("avg_review_time_hours", 0),
        developer_score=kpis.get("developer_score", 0),
        nb_developers=kpis.get("nb_developers", 0),
    )
    
    self.snapshot_repo.create_or_update(self.db, snapshot)
    return snapshot
```

---

### Étape 4 : Application de la Règle RG-02

**Code Backend :**
```python
# kpi_aggregator.py
def generate_monthly_snapshots(...):
    # Harmonisation Mission-Strict (FIX 1)
    eligible_ids = get_certified_developers_for_mission(
        db=self.db, project_id=project_id, period_id=period.id,
        start_date=start_date.date(), end_date=end_date()
    )
```

**Code Mission Utils :**
```python
# mission_utils.py
def get_certified_developers_for_mission(
    db: Session, project_id: int, period_id: int,
    start_date: date, end_date: date
) -> List[int]:
    """
    [SENIOR] Récupère les développeurs éligibles pour l'extraction de données.
    Applique la règle des 15 jours (RG-02) pour le calcul des KPIs.
    
    Un développeur est compté dans l'effectif et seulement si
    sa date de sortie (offboarding_date) est >= au 15 du mois M.
    """
    threshold_date = date(start_date.year, start_date.month, 15)
    
    query = (
        db.query(Developer.id)
        .join(DeveloperProject, DeveloperProject.developer_id == Developer.id)
        .join(DeveloperSite, DeveloperSite.developer_id == Developer.id)
        .join(DeveloperGroupLink, DeveloperGroupLink.developer_id == Developer.id)
        .filter(
            Developer.is_bot.is_(False),
            # Règle des 15 jours (KPIs uniquement)
            or_(Developer.offboarding_date.is_(None), Developer.offboarding_date >= threshold_date),
            # Filtre temporel
            or_(DeveloperSite.start_date.is_(None), DeveloperSite.start_date < end_date),
            or_(DeveloperSite.end_date.is_(None), DeveloperSite.end_date >= start_date),
            or_(DeveloperGroupLink.start_date.is_(None), DeveloperGroupLink.start_date < end_date),
            or_(DeveloperGroupLink.end_date.is_(None), DeveloperGroupLink.end_date >= start_date),
        )
    )
    return [row.id for row in query.all()]
```

**Application :**
- Pour l'extraction de données brutes : PAS de règle RG-02
- Pour le calcul des KPIs : AVEC règle RG-02 (offboarding >= 15 du mois)

---

## Flux d'Affichage dans ComparativeAnalyticsPage.jsx

### Étape 1 : Chargement de la Page

**Code Frontend :**
```javascript
// ComparativeAnalyticsPage.jsx
const ComparativeAnalyticsPage = () => {
  const [loading, setLoading] = useState(true);
  const [pageError, setPageError] = useState("");
  const [entityType, setEntityType] = useState("site"); // "site" ou "group"
  const [selectedEntityIds, setSelectedEntityIds] = useState([]);
  const [trendsData, setTrendsData] = useState([]);
  const [intelligenceData, setIntelligenceData] = useState(null);
  const [intelligenceLoading, setIntelligenceLoading] = useState(false);
  
  const { user } = useAuth();
  const [searchParams] = useSearchParams();
  const projectId = searchParams.get("project_id");
  
  useEffect(() => {
    const loadInitialData();
  }, [projectId, entityType]);
```

**Action :**
- Chargement initial des données
- Détermination du type d'entité (site ou groupe)
- Chargement des tendances et intelligence

---

### Étape 2 : Chargement des Tendances

**Code Frontend :**
```javascript
const fetchTrends = async () => {
  try {
    setPageError("");
    const data = await analyticsService.getComparativeTrends(projectId, {
      siteIds: entityType === "site" ? selectedEntityIds : [],
      groupIds: entityType === "group" ? selectedEntityIds : [],
    });
    setTrendsData(data);
  } catch (err) {
    setPageError("Erreur lors du chargement des tendances");
  }
};
```

**Appel API :**
```
GET /analytics/{projectId}/trends/comparative?site_ids=1,2,3&group_ids=4,5,6
```

**Réponse Backend :**
```python
# analytics.py
@router.get("/{project_id}/trends/comparative")
def get_comparative_trends(
    project_id: int,
    site_ids: List[int] = Query(default=[]),
    group_ids: List[int] = Query(default=[]),
    start_date: Optional[date] = Query(default=None),
    end_date: Optional[date] = Query(default=None),
):
    # Contrôle d'accès multi-tenant
    if current_user.is_site_manager:
        # Filtrer les site_ids aux sites accessibles
        accessible_site_ids = [access.site_id for access in site_access_repo.get_by_user_id(db, _get_tenant_user_id(db, current_user))]
        site_ids = [sid for sid in site_ids if sid in accessible_site_ids]
    
    # Appel AnalyticsService
    data = AnalyticsService(db).get_comparative_trends(
        project_id, site_ids=site_ids, group_ids=group_ids
    )
    return data
```

---

### Étape 3 : Chargement de l'Intelligence

**Code Frontend :**
```javascript
const fetchIntelligence = async () => {
  try {
    setIntelligenceLoading(true);
    
    if (user?.role === 'super_admin' || user?.role === 'site_manager') {
      const data = await analyticsService.getAdminIntelligence(
        projectId, null, null, effectiveSiteIds
      );
      setIntelligenceData(data);
    } else if (user?.role === 'team_lead') {
      const data = await analyticsService.getTeamIntelligence(
        projectId, null, groupIds
      );
      setTeamIntelligenceData(data);
    }
  } catch (err) {
    console.warn("Intelligence non disponible:", err);
  } finally {
    setIntelligenceLoading(false);
  }
};
```

**Appel API :**
```
GET /intelligence/admin/{projectId}?site_ids=1,2,3
GET /intelligence/team/{projectId}?group_ids=1,2,3
```

**Réponse Backend :**
```python
# analytics.py
@router.get("/intelligence/admin/{projectId}")
def get_admin_intelligence(
    project_id: int, period_id: None, siteId=None, siteIds=None
):
    # Appel AnalyticsService
    data = AnalyticsService(db).get_admin_intelligence(
        project_id, period_id, siteId, siteIds
    )
    return data
```

---

### Étape 4 : Affichage des Graphiques

**Code Frontend :**
```javascript
// ComparativeAnalyticsPage.jsx
const chartOptions = {
  series: [
    {
      name: entity.entity_name,
      data: entity.velocity_trend.values,
      type: 'area',
      color: CHART_COLORS[index % CHART_COLORS.length],
    }
  ],
  chart: {
    type: 'area',
    height: 350,
    toolbar: { show: false },
    animations: { enabled: false },
    background: 'transparent',
    theme: { mode: 'dark' },
    xaxis: {
      categories: entity.velocity_trend.labels,
      labels: {
        style: { colors: '#94a3b8', fontSize: '11px', fontFamily: CHART_FONT },
      }
    },
    yaxis: {
      labels: { style: { colors: '#94a3b8', fontSize: '11px', fontFamily: CHART_FONT } }
  }
};

<ReactApexChart
  options={chartOptions}
  series={chartOptions.series}
  height={350}
/>
```

---

### Étape 5 : Affichage des Recommandations

**Code Frontend :**
```javascript
// ComparativeAnalyticsPage.jsx
{intelligenceData?.anomalies?.map(anomaly => (
  <RecommendationCard
    key={anomaly.id}
    rec={{
      category: anomaly.category,
      message: anomaly.message,
      priority: anomaly.priority,
      color: anomaly.color,
      icon: anomaly.icon
    }}
  />
))}
```

**Données Intelligence :**
```python
# analytics_service.py
def get_admin_intelligence(project_id, period_id=None, siteId=None, siteIds=None):
    # Analyse des anomalies et tendances
    anomalies = self._detect_anomalies(project_id, siteIds, period_id)
    trend_analysis = self._analyze_trends(project_id, siteIds, period_id)
    
    return {
        "anomalies": anomalies,
        "trend_analysis": trend_analysis
    }
```

---

## Composants Techniques

### 1. ReactApexChart
**Fichier :** `react-apexcharts`
**Utilisation :** Graphiques interactifs pour les tendances
**Configuration :**
- Type de graphique : line, area, bar
- Thème sombre pour le mode sombre
- Animations désactivées pour la performance
- Palette de couleurs personnalisée

### 2. Composants UI
**EntityCard :** : Carte récapitulatif pour chaque site/groupe
**CircularProgress :** : Indicateur circulaire de score de santé
**IntelligenceDrawer :** Panel latéral pour l'intelligence
**RecommendationCard :** Carte de recommandation

### 3. Services Frontend
**analyticsService.js** : Service canonique pour les appels API
**projectService.js** : Gestion des projets
**developerService.js** : Gestion des développeurs

### 4. Services Backend
**AnalyticsService** : Récupération et agrégation des KPIs
**KpiAggregator** : Génération des snapshots mensuels
**KpiCalculator** : Calcul des métriques brutes
**MissionUtils** : Application de la règle RG-02

---

## Exemple Complet : Calcul et Affichage

### Scénario : Comparaison de Tendances Sites

**1. Utilisateur sélectionne "Sites"**
```javascript
const handleEntityTypeChange = (type) => {
  setEntityType(type);
  setSelectedEntityIds([]);
};
```

**2. Utilisateur sélectionne les sites à comparer**
```javascript
const handleEntityToggle = (entityId) => {
  if (selectedEntityIds.includes(entityId)) {
    setSelectedEntityIds(selectedEntityIds.filter(id => id !== entityIdId));
  } else {
    setSelectedEntityIds([...selectedEntityIds, entityId]);
  }
  fetchTrends();
};
```

**3. Appel API Backend**
```
GET /analytics/123/trends/comparative?site_ids=1,2,3
```

**4. Réponse Backend**
```json
[
  {
    "entity_name": "Site Paris",
    "entity_type": "site",
    "site_id": 1,
    "velocity_trend": {
      "labels": ["Jan", "Fév", "Mar", "Avr", "Mai", "Juin", "Juil", "Août", "Sep", "Oct", "Nov", "Déc"],
      "values": [5.2, 5.8, 6.1, 6.3, 5.9, 6.2, 5.8, 5.5, 5.7, 6.0]
    },
    "review_trend": {
      "labels": ["Jan", "Fév", "Mar", "Avr", "Mai", "Juin", "Juil", "Août", "Sep", "Oct", "Nov", "Déc"],
      "values": [12.5, 11.8, 13.2, 12.9, 11.5, 10.8, 11.2, 13.5, 12.1, 11.9, 12.4]
    },
    "quality_trend": {
      "labels": ["Jan", "Fév", "Mar", "Avr", "Mai", "Juin", "Juil", "Août", "Sep", "Oct", "Nov", "Déc"],
      "values": [0.78, 0.82, 0.85, 0.81, 0.79, 0.83, 0.87, 0.84, 0.86, 0.88, 0.85]
    },
    "health_score": 85,
    "n_periods": 12
  }
]
```

**5. Affichage dans ComparativeAnalyticsPage.jsx**
```javascript
<ReactApexChart
  options={chartOptions}
  series={chartOptions.series}
  height={350}
/>
<EntityCard
  entity={entity}
  entityType="site"
  onViewDetails={() => setSelectedEntity(entity)}
/>
```

---

## Résumé du Flux de Travail

### 1. Déclenchement
- Extraction GitLab terminée
- Génération automatique des snapshots KPIs via KpiAggregator
- Stockage dans KpiSnapshot table

### 2. Calcul
- KpiCalculator calcule les métriques brutes depuis Commit, MergeRequest, Comment
- Application de la règle RG-02 pour le headcount
- Calcul des scores de performance pondérés

### 3. Récupération
- AnalyticsService récupère les snapshots depuis KpiSnapshotRepository
- Calcul des tendances comparatives
- Génération de l'intelligence (anomalies, recommandations)

### 4. Affichage
- ComparativeAnalyticsPage.jsx affiche les graphiques avec ReactApexChart
- EntityCard affiche les métriques et scores
- IntelligenceDrawer affiche les recommandations

### 5. Interactivité
- Sélection des sites/groupe à comparer
- Clic sur EntityCard pour détails
- FAB pour accéder à l'intelligence

---

## Points Clés à Retenir pour la Réunion

### 1. Précision des Données
- Les KPIs sont calculés à partir des données brutes GitLab
- Application de la règle RH (RG-02) pour le headcount
- Filtrage strict par mission temporelle (SCD Type 2)

### 2. Performance
- Calcul optimisé avec agrégation SQL
- Pagination des requêtes pour éviter les timeouts
- Caching intelligent pour éviter les requêtes redondantes

### 3. Intelligence
- Détection automatique des anomalies
- Recommandations basées sur les tendances
- Analyse comparative multi-sites et multi-équipes

### 4. Sécurité
- Contrôle d'accès multi-tenant par rôle
- Filtrage des données selon les assignations utilisateur
- Validation des paramètres de requête

### 5. Traçabilité
- Chaque snapshot est lié à une période et un lot d'extraction
- Historique complet des snapshots pour l'analyse historique
- Logs structurés pour le debugging

---

## Conclusion

Le système de calcul et d'affichage des KPIs dans ComparativeAnalyticsPage.jsx est une solution professionnelle qui combine :

- **Calcul Précis** : Métriques calculées à partir des données brutes GitLab avec application des règles RH
- **Performance** : Optimisé avec agrégation SQL et caching
- **Intelligence** : Détection d'anomalies et recommandations automatiques
- **Sécurité** : Contrôle d'accès multi-tenant et validation stricte
- **Traçabilité** : Historique complet et logs structurés

Cette architecture garantit des données fiables et exploitables pour la prise de décision stratégique de l'entreprise.
