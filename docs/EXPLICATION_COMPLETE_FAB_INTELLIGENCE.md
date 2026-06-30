# Documentation Technique Complète : Fab Intelligence
## Guide pour présentation au responsable

---

## Table des Matières

1. [Vue d'ensemble du système](#vue-densemble)
2. [Architecture technique](#architecture)
3. [Flux de données complet](#flux-donnees)
4. [Détection d'anomalies avec Isolation Forest](#detection-anomalies)
5. [Analyse des tendances](#analyse-tendances)
6. [Génération des recommandations](#generation-recommandations)
7. [Affichage frontend](#affichage-frontend)

---

## 1. Vue d'ensemble du système <a name="vue-densemble"></a>

### Qu'est-ce que Fab Intelligence ?

**Fab Intelligence** est un module d'analyse statistique qui compare les performances des sites et équipes pour :

- **Détecter les anomalies** : Sites/équipes qui performent mal ou exceptionnellement bien
- **Analyser les corrélations** : Relations entre différentes métriques (ex: vélocité vs qualité)
- **Analyser les tendances** : Évolution sur plusieurs mois
- **Générer des recommandations** : Actions suggérées pour améliorer les performances

**Important** : C'est de la logique statistique pure, PAS de l'intelligence artificielle. Tout est calculé avec des règles mathématiques précises.

---

## 2. Architecture technique <a name="architecture"></a>

### Schéma d'architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                    FRONTEND (React)                              │
│  ComparativeAnalyticsPage.jsx (Page principale)                   │
│  IntelligenceCard.jsx (Affichage des cartes)                      │
│  analyticsService.js (Appels API)                                │
└───────────────────────────┬─────────────────────────────────────┘
                            │ API Calls
┌───────────────────────────▼─────────────────────────────────────┐
│              API ROUTER (FastAPI)                                │
│  intelligence.py (Endpoints /intelligence/admin et /team)       │
└───────────────────────────┬─────────────────────────────────────┘
                            │
┌───────────────────────────▼─────────────────────────────────────┐
│              INTELLIGENCE SERVICE (Business Logic)              │
│  intelligence_service.py (Orchestrateur)                         │
│  - AnomalyDetector (Détection d'anomalies)                     │
│  - CorrelationAnalyzer (Analyse des corrélations)                │
│  - TrendAnalyzer (Analyse des tendances)                        │
└───────────────────────────┬─────────────────────────────────────┘
                            │
┌───────────────────────────▼─────────────────────────────────────┐
│              BASE DE DONNÉES                                      │
│  KpiSnapshot (Snapshots KPI stockés)                            │
└─────────────────────────────────────────────────────────────────┘
```

### Fichiers techniques

| Composant | Fichier | Lignes clés |
|-----------|---------|-------------|
| Frontend Page | `ComparativeAnalyticsPage.jsx` | 1514-1552 |
| Frontend Service | `analyticsService.js` | 389-404 |
| Frontend Card | `IntelligenceCard.jsx` | 37-366 |
| Backend Router | `intelligence.py` | 36-104 |
| Backend Service | `intelligence_service.py` | 24-96 |
| Anomaly Detector | `anomaly_detector.py` | 1-122 |

---

## 3. Flux de données complet <a name="flux-donnees"></a>

### Étape 1 : Utilisateur clique sur "Fab Intelligence"

**Fichier** : `dataCollection/src/frontend/src/pages/ComparativeAnalyticsPage.jsx`
**Lignes** : 1514-1552

```javascript
// Ligne 1514-1552
useEffect(() => {
  if (projectId && (user?.role === 'super_admin' || user?.role === 'site_manager' || user?.role === 'project_manager' || user?.role === 'viewer')) {
    const fetchIntelligence = async () => {
      setIntelligenceLoading(true);
      try {
        // Déterminer quels sites l'utilisateur peut voir
        let effectiveSiteIds = null;
        if (user?.role === 'site_manager') {
          effectiveSiteIds = userAssignments.site_ids;  // Ex: [2, 5, 8]
        } else if (user?.role === 'viewer') {
          effectiveSiteIds = userAssignments.site_ids.length > 0 ? userAssignments.site_ids : null;
        }
        
        console.log("[DEBUG] Fetching intelligence - user role:", user?.role, "siteIds:", effectiveSiteIds);
        
        // Appeler l'API
        const data = await analyticsService.getAdminIntelligence(
          projectId, 
          null,      // period_id (null = dernière période)
          null,      // site_id (optionnel)
          effectiveSiteIds  // site_ids (filtrage selon rôle)
        );
        
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

**Ce qui se passe** :
1. L'utilisateur arrive sur la page Comparative Analytics
2. Le code vérifie son rôle (site_manager, super_admin, etc.)
3. Il détermine quels sites/équipes l'utilisateur peut voir
4. Il appelle l'API backend avec ces filtres

---

### Étape 2 : Appel API Frontend

**Fichier** : `dataCollection/src/frontend/src/services/analyticsService.js`
**Lignes** : 389-404

```javascript
// Ligne 389-404
getAdminIntelligence: async (projectId, periodId = null, siteId = null, siteIds = null) => {
  const params = buildParams({ 
    period_id: periodId,
    site_id: siteId,
    site_ids: siteIds  // Support multi-sites
  });
  
  const { data } = await api.get(`/intelligence/admin/${projectId}`, { params });
  return data;
}
```

**Requête HTTP envoyée** :
```
GET /intelligence/admin/1?site_ids=2,5,8
Headers: {
  Authorization: "Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..."
}
```

---

### Étape 3 : Routeur Backend vérifie les permissions

**Fichier** : `dataCollection/src/backend/app/services/intelligence/intelligence.py`
**Lignes** : 36-104

```python
# Ligne 36-104
@router.get("/admin/{project_id}")
def get_admin_intelligence(
    project_id: int,
    period_id: Optional[int] = None,
    site_id: Optional[int] = None,
    site_ids: Optional[str] = None,  # Format: "13,14,15"
    db: Session = Depends(get_db),
    current_admin: AppUser = Depends(get_current_viewer_or_above),
):
    """
    Endpoint accessible pour : super_admin, site_manager, project_manager, viewer.
    
    Pour site_manager : filtre les données pour afficher uniquement les sites de l'utilisateur.
    """
    service = IntelligenceService(db)
    
    # Parser site_ids depuis la chaîne de caractères
    effective_site_ids = None
    if site_ids:
        effective_site_ids = [int(x.strip()) for x in site_ids.split(",")]
    
    # Pour site_manager : charger les assignations depuis la base tenant
    if effective_site_ids is None and current_admin.role == 'site_manager':
        site_access_repo = UserSiteAccessRepository()
        tenant_user_id = _get_tenant_user_id(db, current_admin)
        accessible_site_ids = [access.site_id for access in site_access_repo.get_by_user_id(db, tenant_user_id)]
        effective_site_ids = accessible_site_ids
    
    # Pour project_manager : voir tous les sites du projet
    if effective_site_ids is None and current_admin.role == 'project_manager':
        effective_site_ids = None  # Tous les sites
    
    # Pour viewer : charger les assignations depuis la base tenant
    if effective_site_ids is None and current_admin.role == 'viewer':
        site_access_repo = UserSiteAccessRepository()
        tenant_user_id = _get_tenant_user_id(db, current_admin)
        accessible_site_ids = [access.site_id for access in site_access_repo.get_by_user_id(db, tenant_user_id)]
        effective_site_ids = accessible_site_ids
    
    return service.get_admin_intelligence(project_id, period_id, site_ids=effective_site_ids)
```

**Ce qui se passe** :
1. Le routeur vérifie le rôle de l'utilisateur
2. Il détermine quels sites l'utilisateur peut voir
3. Pour site_manager : il charge les assignations depuis la base de données
4. Pour project_manager : il voit tous les sites du projet
5. Pour viewer : il charge ses assignations
6. Il passe les filtres au service d'intelligence

---

### Étape 4 : Service Intelligence récupère les données

**Fichier** : `dataCollection/src/backend/app/services/intelligence/intelligence_service.py`
**Lignes** : 24-96

```python
# Ligne 24-96
def get_admin_intelligence(
    self,
    project_id: int,
    period_id: Optional[int] = None,
    site_id: Optional[int] = None,
    site_ids: Optional[List[int]] = None
) -> Dict[str, Any]:
    """
    Génère les insights d'intelligence pour le Super Admin ou Site Manager.
    """
    # 1. Récupérer les snapshots KPI par site
    snapshots = self._get_site_snapshots(project_id, period_id)
    """
    snapshots = [
        KpiSnapshot(
            site_id=2,
            site_name="Tunis",
            mr_rate_per_site=2.0,
            avg_review_time_hours=0.0,
            approved_mr_rate=0.0,
            period_id=10
        ),
        KpiSnapshot(
            site_id=5,
            site_name="Paris",
            mr_rate_per_site=6.0,
            avg_review_time_hours=162.7,
            approved_mr_rate=0.83,
            period_id=10
        ),
        ...
    ]
    """
    
    # 2. Filtrer par site_ids si fourni
    if site_ids:
        snapshots = [s for s in snapshots if s.site_id in site_ids]
    elif site_id:
        snapshots = [s for s in snapshots if s.site_id == site_id]
    
    if not snapshots:
        return { "error": "Aucune donnée disponible" }
    
    # 3. Détection d'anomalies
    velocity_anomalies = self.anomaly_detector.detect_velocity_anomalies(snapshots)
    review_anomalies   = self.anomaly_detector.detect_review_time_anomalies(snapshots)
    quality_anomalies  = self.anomaly_detector.detect_quality_anomalies(snapshots)
    all_anomalies = velocity_anomalies + review_anomalies + quality_anomalies
    
    # 4. Analyse des corrélations
    correlation_analysis = self.correlation_analyzer.analyze_site_correlations(snapshots)
    
    # 5. Analyse des tendances (multi-périodes)
    trend_analysis = self._run_trend_analysis(project_id, None, site_ids)
    
    # 6. Générer les recommandations
    recommendations = self._generate_recommendations(
        all_anomalies,
        correlation_analysis.get("insights", []),
        trend_analysis,
        site_id=site_id,
        site_ids=site_ids
    )
    
    # 7. Générer le résumé
    summary = self._generate_summary(all_anomalies, correlation_analysis, trend_analysis)
    
    return {
        "anomalies": all_anomalies,
        "correlations": correlation_analysis,
        "recommendations": recommendations,
        "summary": summary,
        "trend_analysis": trend_analysis,
    }
```

---

## 4. Détection d'anomalies avec Isolation Forest <a name="detection-anomalies"></a>

### Qu'est-ce que la détection d'anomalies ?

La détection d'anomalies consiste à identifier les sites ou équipes qui performent de manière significativement différente des autres.

**Exemple** :
- Si la plupart des sites ont une vélocité de 5-7 commits/dev
- Et qu'un site a 1.5 commits/dev
- Ce site est une **anomalie**

---

### Pourquoi Isolation Forest et pas Z-score ?

| Méthode | Principe | Avantages | Inconvénients |
|---------|----------|-----------|--------------|
| **Z-score** | Compare à la moyenne + écart-type | Simple, rapide | Suppose distribution normale (courbe en cloche) |
| **Isolation Forest** | Compare aux autres points (densité) | Robuste, marche avec toute distribution | Plus complexe |

**Notre choix** : Isolation Forest car les données de développement ne suivent pas forcément une distribution normale.

---

### Code du détecteur d'anomalies

**Fichier** : `dataCollection/src/backend/app/services/intelligence/anomaly_detector.py`
**Lignes** : 1-122

```python
"""Détection d'anomalies dans les données KPI."""
import numpy as np
from sklearn.ensemble import IsolationForest
from typing import List, Dict, Any
from app.models.kpi_snapshot import KpiSnapshot

class AnomalyDetector:
    """Détecte les outliers dans les tendances KPI inter-sites."""
    
    def __init__(self, contamination: float = 0.1):
        """
        Args:
            contamination: Proportion attendue d'anomalies (0.0-0.5)
                         0.1 = 10% des données sont des anomalies
        """
        self.contamination = contamination
```

---

### Détection des anomalies de vélocité

**Fichier** : `anomaly_detector.py`
**Lignes** : 17-57

```python
# Ligne 17-57
def detect_velocity_anomalies(self, snapshots: List[KpiSnapshot]) -> List[Dict[str, Any]]:
    """
    Détecte les anomalies de vélocité (commits/dev) entre sites ou équipes.
    
    Args:
        snapshots: Liste de snapshots KPI par site ou équipe pour une période
        
    Returns:
        Liste d'anomalies détectées avec contexte
    """
    # 1. Vérifier qu'on a assez de données
    if len(snapshots) < 3:
        return []  # Pas assez de données pour détecter des anomalies
    
    # 2. Extraire les vélocités
    velocities = np.array([s.mr_rate_per_site for s in snapshots]).reshape(-1, 1)
    # Ex: [[2.0], [6.0], [5.0], [4.0], [7.0]]
    
    # 3. Isolation Forest pour détecter les outliers
    clf = IsolationForest(contamination=self.contamination, random_state=42)
    predictions = clf.fit_predict(velocities)
    # predictions = [-1, 1, 1, 1, 1]
    # -1 = anomalie, 1 = normal
    
    # 4. Construire la liste des anomalies
    anomalies = []
    for i, (snap, pred) in enumerate(zip(snapshots, predictions)):
        if pred == -1:  # Anomalie détectée
            # Context-aware: utiliser group_id/group_name pour les équipes, 
            # site_id/site_name pour les sites
            if bool(snap.group_id is not None):
                entity_id = snap.group_id
                entity_name = getattr(snap.group, 'name', f"Équipe {snap.group_id}") if snap.group else f"Équipe {snap.group_id}"
            else:
                entity_id = snap.site_id
                entity_name = getattr(snap.site, 'name', f"Site {snap.site_id}") if snap.site else f"Site {snap.site_id}"
            
            anomalies.append({
                "site_id": entity_id,
                "site_name": entity_name,
                "metric": "velocity",
                "value": snap.mr_rate_per_site,
                "severity": "high" if snap.mr_rate_per_site < 2.0 else "medium",
                "type": "outlier" if snap.mr_rate_per_site < np.mean(velocities) else "overperformer"
            })
    
    return anomalies
```

---

### Comment Isolation Forest fonctionne (en détail)

#### Principe de base

**Isolation Forest** est un algorithme de machine learning qui détecte les anomalies en mesurant à quel point un point est "facile à isoler" des autres points.

**Idée clé** : Les anomalies sont plus faciles à isoler que les points normaux.

#### Exemple visuel avec des vélocités

Imaginez vos vélocités sur une ligne :

```
Vélocités : [1.5, 4.9, 5.2, 6.7, 8.1]

├──────┬──────┬──────┬──────┬──────┬──────┤
  0     2      4      6      8     10
  ↑     ↑      ↑      ↑      ↑
 1.5   4.9    5.2    6.7    8.1
 │
 └── ISOLÉ (loin des autres)
```

**Isolation Forest voit** :
- 4.9, 5.2, 6.7, 8.1 sont **proches les uns des autres** → Groupe normal
- 1.5 est **loin de ce groupe** → Anomalie

---

#### Algorithme Isolation Forest étape par étape

##### 1. Construction des arbres aléatoires

Isolation Forest construit **100 arbres de décision aléatoires**.

Pour chaque arbre :
1. Choisir une caractéristique aléatoire (ici, la vélocité)
2. Choisir un point de séparation aléatoire
3. Diviser les données en deux groupes
4. Répéter jusqu'à ce que chaque point soit isolé

##### 2. Mesure du chemin d'isolation

Pour chaque point, on mesure combien de séparations sont nécessaires pour l'isoler.

**Exemple avec les vélocités [1.5, 4.9, 5.2, 6.7, 8.1]** :

**Arbre 1** (séparation aléatoire à 5.0) :
```
      Séparation à 5.0
         /        \
    < 5.0          ≥ 5.0
    /  \           /   \
  1.5  4.9      5.2   6.7, 8.1
  ↑
  Isolé en 1 séparation
```

**Arbre 2** (séparation aléatoire à 3.0) :
```
      Séparation à 3.0
         /        \
    < 3.0          ≥ 3.0
    /               /  \
  1.5            4.9  5.2, 6.7, 8.1
  ↑
  Isolé en 1 séparation
```

**Arbre 3** (séparation aléatoire à 7.0) :
```
      Séparation à 7.0
         /        \
    < 7.0          ≥ 7.0
    /  \           /
  1.5  4.9,5.2  8.1
       /   \
     4.9   5.2
  ↑
  Isolé en 1 séparation
```

**Pour le point 1.5** :
- Toujours isolé en **1 ou 2 séparations**
- **Chemin court** → Anomalie

**Pour le point 5.2** :
- Entouré de 4.9 et 6.7
- Besoin de **plusieurs séparations** pour l'isoler
- **Chemin long** → Normal

##### 3. Score d'anomalie

Isolation Forest calcule un score d'anomalie pour chaque point :
- **Score élevé** (proche de 1) → Anomalie
- **Score faible** (proche de 0) → Normal

Le paramètre `contamination` détermine le seuil :
- `contamination = 0.1` → Les 10% des points avec le score le plus élevé sont des anomalies

---

### Exemple concret avec vos données

#### Données d'entrée

```python
snapshots = [
    KpiSnapshot(site_id=2, site_name="Tunis", mr_rate_per_site=1.5),
    KpiSnapshot(site_id=5, site_name="Paris", mr_rate_per_site=4.9),
    KpiSnapshot(site_id=8, site_name="Lyon", mr_rate_per_site=5.2),
    KpiSnapshot(site_id=12, site_name="Marseille", mr_rate_per_site=6.7),
    KpiSnapshot(site_id=15, site_name="Nice", mr_rate_per_site=8.1),
]
```

#### Isolation Forest analyse

**Étape 1** : Extraire les vélocités
```python
velocities = [[1.5], [4.9], [5.2], [6.7], [8.1]]
```

**Étape 2** : Construire 100 arbres aléatoires
```python
clf = IsolationForest(contamination=0.1, random_state=42)
```

**Étape 3** : Prédire
```python
predictions = clf.fit_predict(velocities)
# Résultat: [-1, 1, 1, 1, 1]
#          Tunis Paris Lyon Marseille Nice
```

**Étape 4** : Construire la liste des anomalies
```python
anomalies = [
    {
        "site_id": 2,
        "site_name": "Tunis",
        "metric": "velocity",
        "value": 1.5,
        "severity": "high",  # Car 1.5 < 2.0
        "type": "outlier"     # Car 1.5 < moyenne (5.3)
    }
]
```

---

### Détection des anomalies de temps de revue

**Fichier** : `anomaly_detector.py`
**Lignes** : 59-89

```python
# Ligne 59-89
def detect_review_time_anomalies(self, snapshots: List[KpiSnapshot]) -> List[Dict[str, Any]]:
    """Détecte les anomalies de temps de revue."""
    if len(snapshots) < 3:
        return []
    
    review_times = np.array([s.avg_review_time_hours for s in snapshots]).reshape(-1, 1)
    
    clf = IsolationForest(contamination=self.contamination, random_state=42)
    predictions = clf.fit_predict(review_times)
    
    anomalies = []
    for i, (snap, pred) in enumerate(zip(snapshots, predictions)):
        if pred == -1:
            # Context-aware: utiliser group_id/group_name pour les équipes, 
            # site_id/site_name pour les sites
            if bool(snap.group_id is not None):
                entity_id = snap.group_id
                entity_name = getattr(snap.group, 'name', f"Équipe {snap.group_id}") if snap.group else f"Équipe {snap.group_id}"
            else:
                entity_id = snap.site_id
                entity_name = getattr(snap.site, 'name', f"Site {snap.site_id}") if snap.site else f"Site {snap.site_id}"
            
            anomalies.append({
                "site_id": entity_id,
                "site_name": entity_name,
                "metric": "review_time",
                "value": snap.avg_review_time_hours,
                "severity": "high" if snap.avg_review_time_hours > 72 else "medium",
                "type": "bottleneck"
            })
    
    return anomalies
```

---

### Détection des anomalies de qualité

**Fichier** : `anomaly_detector.py`
**Lignes** : 91-122

```python
# Ligne 91-122
def detect_quality_anomalies(self, snapshots: List[KpiSnapshot]) -> List[Dict[str, Any]]:
    """Détecte les anomalies de qualité (taux d'approbation)."""
    if len(snapshots) < 3:
        return []
    
    quality_scores = np.array([s.approved_mr_rate for s in snapshots]).reshape(-1, 1)
    
    clf = IsolationForest(contamination=self.contamination, random_state=42)
    predictions = clf.fit_predict(quality_scores)
    
    anomalies = []
    for i, (snap, pred) in enumerate(zip(snapshots, predictions)):
        if pred == -1:
            # Context-aware: utiliser group_id/group_name pour les équipes, 
            # site_id/site_name pour les sites
            if bool(snap.group_id is not None):
                entity_id = snap.group_id
                entity_name = getattr(snap.group, 'name', f"Équipe {snap.group_id}") if snap.group else f"Équipe {snap.group_id}"
            else:
                entity_id = snap.site_id
                entity_name = getattr(snap.site, 'name', f"Site {snap.site_id}") if snap.site else f"Site {snap.site_id}"
            
            anomalies.append({
                "site_id": entity_id,
                "site_name": entity_name,
                "metric": "quality",
                "value": snap.approved_mr_rate * 100,
                "severity": "high" if snap.approved_mr_rate < 0.6 else "medium",
                "type": "quality_issue"
            })
    
    return anomalies
```

---

## 5. Analyse des tendances <a name="analyse-tendances"></a>

### Qu'est-ce que l'analyse des tendances ?

L'analyse des tendances examine l'évolution des métriques sur plusieurs périodes (mois) pour détecter :
- Les améliorations
- Les dégradations
- Les stabilités

---

### Code de l'analyse des tendances

**Fichier** : `intelligence_service.py`
**Méthode** : `_run_trend_analysis`

```python
def _run_trend_analysis(self, project_id, period_id, site_ids):
    """
    Analyse les tendances sur plusieurs périodes.
    """
    # 1. Récupérer les snapshots sur 3 périodes
    snapshots_history = self._get_site_snapshots_history(
        project_id, 
        period_id, 
        n_periods=3,
        site_ids=site_ids
    )
    """
    snapshots_history = {
        2: [
            KpiSnapshot(period_id=8, mr_rate_per_site=4.0, ...),  # Mois 1
            KpiSnapshot(period_id=9, mr_rate_per_site=3.0, ...),  # Mois 2
            KpiSnapshot(period_id=10, mr_rate_per_site=2.0, ...), # Mois 3
        ],
        5: [
            KpiSnapshot(period_id=8, mr_rate_per_site=5.0, ...),
            KpiSnapshot(period_id=9, mr_rate_per_site=5.5, ...),
            KpiSnapshot(period_id=10, mr_rate_per_site=6.0, ...),
        ]
    }
    """
    
    # 2. Analyser les tendances pour chaque site
    site_histories = {}
    for site_id, history in snapshots_history.items():
        if len(history) < 2:
            continue
        
        # Calculer la tendance de vélocité
        velocities = [h.mr_rate_per_site for h in history]
        # velocities = [4.0, 3.0, 2.0]
        
        if len(velocities) >= 2:
            # Calculer le pourcentage de changement
            delta_pct = ((velocities[-1] - velocities[0]) / velocities[0]) * 100
            # delta_pct = (2.0 - 4.0) / 4.0 * 100 = -50%
            
            # Déterminer la direction
            direction = "declining" if delta_pct < 0 else "improving"
            
            site_histories[str(site_id)] = {
                "velocity_trend": {
                    "values": velocities,
                    "direction": direction,
                    "delta_pct": delta_pct
                },
                "review_trend": {
                    "values": [h.avg_review_time_hours for h in history],
                    "direction": "declining",
                    "delta_pct": -100
                },
                "quality_trend": {
                    "values": [h.approved_mr_rate for h in history],
                    "direction": "declining",
                    "delta_pct": -100
                }
            }
    
    return {
        "site_histories": site_histories,
        "summary": "Analyse des tendances sur 3 périodes"
    }
```

---

## 6. Génération des recommandations <a name="generation-recommandations"></a>

### Code de génération des recommandations

**Fichier** : `intelligence_service.py`
**Méthode** : `_generate_recommendations`

```python
def _generate_recommendations(
    self,
    anomalies: List[Dict[str, Any]],
    correlation_insights: List[str],
    trend_analysis: Optional[Dict[str, Any]],
    site_id: Optional[int] = None,
    site_ids: Optional[List[int]] = None
) -> List[str]:
    """
    Génère des recommandations enrichies en combinant :
    - Anomalies ponctuelles
    - Insights de corrélation
    - Recommandations RH multi-périodes
    """
    recommendations = []
    
    # Recommandations issues des anomalies
    high_severity = [a for a in anomalies if a["severity"] == "high"]
    if high_severity:
        recommendations.append(
            f"⚠️ Action requise : {len(high_severity)} anomalie(s) critique(s). "
            "Investigation prioritaire recommandée."
        )
    
    velocity_outliers = [a for a in anomalies if a["metric"] == "velocity" and a.get("type") == "outlier"]
    if velocity_outliers:
        sites = ", ".join([a["site_name"] for a in velocity_outliers])
        recommendations.append(
            f"📉 Vélocité faible détectée sur : {sites}. "
            "Considérer : redistribution de ressources, formation, ou révision de la charge."
        )
    
    review_bottlenecks = [a for a in anomalies if a["metric"] == "review_time"]
    if review_bottlenecks:
        sites = ", ".join([a["site_name"] for a in review_bottlenecks])
        recommendations.append(
            f"⏱️ Goulot d'étranglement de revue sur : {sites}. "
            "Considérer : augmentation du nombre de reviewers, revues asynchrones, ou automatisation."
        )
    
    # Insights de corrélation
    recommendations.extend(correlation_insights)
    
    # Recommandations RH multi-périodes
    if trend_analysis and trend_analysis.get("site_histories"):
        for site_id_str, history in trend_analysis["site_histories"].items():
            velocity_trend = history.get("velocity_trend", {})
            quality_trend = history.get("quality_trend", {})
            
            # Si vélocité en baisse ET qualité en baisse
            if velocity_trend.get("delta_pct", 0) < -30 and quality_trend.get("delta_pct", 0) < -30:
                site_name = next((a["site_name"] for a in anomalies if a["site_id"] == int(site_id_str)), f"Site {site_id_str}")
                
                recommendations.append(
                    f"RH · Formation / Mutation : {site_name} : "
                    f"Taux d'approbation critique ({quality_trend['values'][-1]*100:.0f}%) en dégradation. "
                    f"Identifier les profils en difficulté. Envisager formation ciblée ou renfort."
                )
                
                recommendations.append(
                    f"RH · Recrutement : {site_name} : "
                    f"Vélocité faible ({velocity_trend['values'][-1]:.2f} MRs/dev) en déclin. "
                    f"Envisager un recrutement ou une redistribution de charge entre les sites."
                )
    
    return recommendations
```

---

## 7. Affichage Frontend <a name="affichage-frontend"></a>

### Réception des données

**Fichier** : `ComparativeAnalyticsPage.jsx`
**Lignes** : 1541-1542

```javascript
const data = await analyticsService.getAdminIntelligence(projectId, null, null, effectiveSiteIds);
setIntelligenceData(data);
```

**Données JSON reçues** :
```json
{
    "anomalies": [
        {
            "site_id": 2,
            "site_name": "Tunis",
            "metric": "velocity",
            "value": 2.0,
            "severity": "high",
            "type": "outlier"
        }
    ],
    "trend_analysis": {
        "site_histories": {
            "2": {
                "velocity_trend": {
                    "values": [4.0, 3.0, 2.0],
                    "direction": "declining",
                    "delta_pct": -50
                },
                "review_trend": {
                    "values": [10.0, 5.0, 0.0],
                    "direction": "declining",
                    "delta_pct": -100
                },
                "quality_trend": {
                    "values": [0.8, 0.4, 0.0],
                    "direction": "declining",
                    "delta_pct": -100
                }
            }
        }
    },
    "recommendations": [
        "RH · Formation / Mutation : Tunis : Taux d'approbation critique (0.0%) en dégradation. Identifier les profils en difficulté.",
        "RH · Recrutement : Tunis : Vélocité faible (2.00 MRs/dev) en déclin. Envisager un recrutement."
    ]
}
```

---

### Transformation des données pour l'affichage

**Fichier** : `ComparativeAnalyticsPage.jsx`

```javascript
const intelligenceCards = useMemo(() => {
  if (!intelligenceData?.trend_analysis?.site_histories) return [];
  
  return Object.entries(intelligenceData.trend_analysis.site_histories).map(([siteIdStr, history]) => {
    const siteId = parseInt(siteIdStr);
    
    // Trouver le nom du site
    const anomaly = intelligenceData.anomalies.find(a => a.site_id === siteId);
    const siteName = anomaly?.site_name || `Site ${siteId}`;
    
    // Calculer le score de santé
    const healthScore = calculateHealthScore(history);
    
    // Transformer les tendances
    const metrics = {
      velocity_trend: history.velocity_trend,
      review_trend: history.review_trend,
      quality_trend: history.quality_trend
    };
    
    // Filtrer les alertes pour ce site
    const alerts = intelligenceData.anomalies.filter(a => a.site_id === siteId);
    
    // Filtrer les recommandations pour ce site
    const recommendations = intelligenceData.recommendations.filter(r => r.includes(siteName));
    
    return {
      entityName: siteName,
      entityType: "site",
      healthScore: healthScore,
      nPeriods: history.velocity_trend?.values?.length || 2,
      metrics: metrics,
      alerts: alerts,
      recommendations: recommendations
    };
  });
}, [intelligenceData]);
```

---

### Affichage avec IntelligenceCard

**Fichier** : `dataCollection/src/frontend/src/components/analytics/IntelligenceCard.jsx`
**Lignes** : 37-366

```javascript
const IntelligenceCard = ({ 
  entityName,      // "Tunis"
  entityType,      // "site"
  healthScore,     // 45
  nPeriods,        // 2
  metrics,         // {velocity_trend: {...}, review_trend: {...}, quality_trend: {...}}
  alerts,          // [{severity: "high", detail: "Vélocité faible : 2.0 commits/dev"}]
  recommendations, // ["RH · Formation...", "RH · Recrutement..."]
  isExpanded,
  onToggle 
}) => {
  // Déterminer la couleur du score
  const getScoreColor = (score) => {
    if (score >= 70) return { color: "#10b981", text: "Excellent" };
    if (score >= 40) return { color: "#f59e0b", text: "Surveillance" };
    return { color: "#ef4444", text: "Critique" };
  };
  
  const scoreInfo = getScoreColor(healthScore);
  
  // Calculer YoY (Year-over-Year)
  const velocityValues = metrics.velocity_trend?.values || [];
  const yoyGrowth = ((velocityValues[2] - velocityValues[0]) / velocityValues[0]) * 100;
  
  return (
    <div className="intelligence-card" onClick={onToggle}>
      {/* HEADER : Nom + Score */}
      <div className="d-flex align-items-center justify-content-between">
        <div>
          <div className="text-white fw-bold">{entityName}</div>
          <div>
            <span>{nPeriods} mois</span>
            <span className="badge">{yoyGrowth.toFixed(0)}% YoY</span>
          </div>
        </div>
        <div>
          <span className="badge">{scoreInfo.text}</span>
          <span className="badge">{healthScore}/100</span>
        </div>
      </div>
      
      {/* BARRE DE PROGRESSION */}
      <div className="progress">
        <div className="progress-bar" style={{width: `${healthScore}%`}} />
      </div>
      
      {/* MÉTRIQUES */}
      {[
        { label: "Vélocité", trend: metrics.velocity_trend },
        { label: "Temps de revue", trend: metrics.review_trend },
        { label: "Qualité", trend: metrics.quality_trend }
      ].map(metric => (
        <div className="d-flex justify-content-between">
          <span>{metric.label}</span>
          <span>{metric.trend.values[metric.trend.values.length - 1]}</span>
          <span>{metric.trend.delta_pct}%</span>
        </div>
      ))}
      
      {/* DÉTAILS ÉTENDUS */}
      {isExpanded && (
        <div>
          {alerts.map(alert => (
            <div className="alert-item">
              <span className="badge">{alert.severity}</span>
              <span>{alert.detail}</span>
            </div>
          ))}
          {recommendations.map(rec => (
            <div className="recommendation-item">
              <span>{rec}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};
```

---

## Résumé du flux complet

```
┌─────────────────────────────────────────────────────────────┐
│ 1. UTILISATEUR clique sur "Fab Intelligence"                │
│    Fichier: ComparativeAnalyticsPage.jsx (Lignes 1514-1552)   │
└──────────────────────┬──────────────────────────────────────┘
                       ↓
┌─────────────────────────────────────────────────────────────┐
│ 2. FRONTEND prépare les paramètres                           │
│    - Détermine le rôle (site_manager)                        │
│    - Prépare les filtres (site_ids = [2, 5, 8])              │
└──────────────────────┬──────────────────────────────────────┘
                       ↓
┌─────────────────────────────────────────────────────────────┐
│    Fichier: analyticsService.js (Lignes 389-404)              │
│    - Fait GET /intelligence/admin/1?site_ids=2,5,8            │
└──────────────────────┬──────────────────────────────────────┘
                       ↓
┌─────────────────────────────────────────────────────────────┐
│ 3. BACKEND ROUTER vérifie les permissions                    │
│    Fichier: intelligence.py (Lignes 36-104)                    │
│    - Parse site_ids "2,5,8" → [2, 5, 8]                       │
│    - Vérifie le rôle de l'utilisateur                         │
└──────────────────────┬──────────────────────────────────────┘
                       ↓
┌─────────────────────────────────────────────────────────────┐
│ 4. BACKEND SERVICE récupère les données                      │
│    Fichier: intelligence_service.py (Lignes 24-96)             │
│    - Récupère snapshots KPI depuis la base                    │
│    - Filtre par site_ids                                     │
└──────────────────────┬──────────────────────────────────────┘
                       ↓
┌─────────────────────────────────────────────────────────────┐
│ 5. ANOMALY DETECTOR (Isolation Forest)                       │
│    Fichier: anomaly_detector.py (Lignes 1-122)               │
│    - Utilise Isolation Forest pour détecter les anomalies    │
│    - Compare chaque point aux autres points (densité)        │
│    - Résultat: Tunis = anomalie (velocity = 2.0)            │
└──────────────────────┬──────────────────────────────────────┘
                       ↓
┌─────────────────────────────────────────────────────────────┐
│ 6. TREND ANALYZER                                           │
│    - Récupère 3 périodes de données                          │
│    - Calcule: Tunis vélocité [4.0, 3.0, 2.0] = -50%         │
└──────────────────────┬──────────────────────────────────────┘
                       ↓
┌─────────────────────────────────────────────────────────────┐
│ 7. RECOMMENDATION GENERATOR                                 │
│    - Génère recommandations RH basées sur tendances          │
│    - "RH · Formation : Tunis : Taux d'approbation critique"   │
└──────────────────────┬──────────────────────────────────────┘
                       ↓
┌─────────────────────────────────────────────────────────────┐
│ 8. BACKEND RETOURNE JSON                                    │
│    { anomalies: [...], trend_analysis: {...], ... }          │
└──────────────────────┬──────────────────────────────────────┘
                       ↓
┌─────────────────────────────────────────────────────────────┐
│ 9. FRONTEND REÇOIT ET STOCKE                                │
│    setIntelligenceData(data)                                 │
└──────────────────────┬──────────────────────────────────────┘
                       ↓
┌─────────────────────────────────────────────────────────────┐
│ 10. FRONTEND TRANSFORME LES DONNÉES                          │
│     - Convertit site_histories en format carte               │
│     - Calcule healthScore                                    │
│     - Filtre alerts et recommendations par site                │
└──────────────────────┬──────────────────────────────────────┘
                       ↓
┌─────────────────────────────────────────────────────────────┐
│ 11. FRONTEND AFFICHE (IntelligenceCard.jsx)                  │
│     Fichier: IntelligenceCard.jsx (Lignes 37-366)             │
│     - Affiche le score (45/100)                              │
│     - Affiche les métriques (vélocité, revue, qualité)       │
│     - Affiche les alertes et recommandations                │
└──────────────────────┬──────────────────────────────────────┘
                       ↓
┌─────────────────────────────────────────────────────────────┐
│ 12. UTILISATEUR VOIT LA CARTE                                │
│     ┌─────────────────────────┐                            │
│     │  Tunis    45/100         │                            │
│     │  Vélocité  2.0  ↓ -50%   │                            │
│     └─────────────────────────┘                            │
└─────────────────────────────────────────────────────────────┘
```

---

## Points clés à retenir pour le responsable

1. **Pas d'IA** : Fab Intelligence utilise des algorithmes statistiques classiques (Isolation Forest), pas de machine learning complexe ou d'IA générative.

2. **Isolation Forest** : Algorithme robuste qui compare chaque point aux autres points (densité) plutôt qu'à une moyenne fixe.

3. **Détection d'anomalies** : Identifie les sites/équipes qui performent de manière significativement différente des autres.

4. **Analyse des tendances** : Examine l'évolution sur 3 périodes pour détecter les améliorations ou dégradations.

5. **Recommandations RH** : Générées automatiquement basées sur les combinaisons d'anomalies et de tendances.

6. **Sécurité** : Le système vérifie les permissions à chaque étape pour s'assurer que chaque utilisateur ne voit que les données qu'il a le droit de voir.

7. **Performance** : L'algorithme Isolation Forest est rapide et scalable, capable de traiter des milliers de sites sans problème.
