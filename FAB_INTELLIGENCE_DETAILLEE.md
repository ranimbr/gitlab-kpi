# Fab Intelligence - Système d'Intelligence Statistique

## 📋 Résumé Exécutif (Pour les Responsables)

### 🎯 Pourquoi Fab Intelligence est important

**Problème**: Comment détecter automatiquement les anomalies et tendances dans les KPIs des développeurs pour identifier les problèmes de performance et recommander des actions?

**Solution**: Fab Intelligence utilise des algorithmes de machine learning (IsolationForest) et d'analyse statistique pour détecter les outliers et les tendances dans les données KPIs.

**Bénéfices**:
- ✅ **Détection automatique**: Identifie les sites/équipes avec des KPIs anormaux
- ✅ **Analyse de tendances**: Détecte les déclins ou améliorations sur plusieurs mois
- ✅ **Recommandations RH**: Suggère des actions basées sur les analyses
- ✅ **Seuils dynamiques**: Les seuils d'alerte sont calculés automatiquement selon les données historiques

### 🔍 Analogie Simple

Imaginez un système de surveillance automatique:
- **Sans Fab Intelligence**: On regarde manuellement les KPIs de chaque site/équipe
- **Avec Fab Intelligence**: Le système détecte automatiquement les anomalies et tendances, et recommande des actions

**Exemple**: Le site Lyon a un taux de MRs de 0.5 (faible) depuis 3 mois → Fab Intelligence détecte cette anomalie et recommande une investigation.

---

## 🔄 Architecture Fab Intelligence

```
┌─────────────────────────────────────────────────────────────────┐
│              BASE DE DONNÉES (KPIs Historisés)                       │
│  - KpiSnapshot: KPIs par période/site/groupe/dev                     │
│  - Données: mr_rate_per_site, commit_rate_per_site, etc.              │
└──────────────────────┬──────────────────────────────────────────────┘
                       │ Lecture des snapshots
                       ↓
┌─────────────────────────────────────────────────────────────────┐
│              INTELLIGENCE SERVICE (Orchestrateur)                       │
│  - IntelligenceService: Coordonne l'analyse                          │
│  - Récupère les snapshots KPIs par site/groupe                       │
│  - Lance anomaly_detector et trend_analyzer                         │
│  - Génère les recommandations                                      │
└──────────────────────┬──────────────────────────────────────────────┘
                       │ Appel des analyseurs
                       ↓
┌─────────────────────────────────────────────────────────────────┐
│              ANOMALY DETECTOR (Machine Learning)                       │
│  - IsolationForest: Algorithme de détection d'outliers             │
│  - Détection: velocity_anomalies, review_time_anomalies, quality_anomalies
└──────────────────────┬──────────────────────────────────────────────┘
                       │ Appel de l'analyseur de tendances
                       ↓
┌─────────────────────────────────────────────────────────────────┐
│              TREND ANALYZER (Analyse Statistique)                     │
│  - Analyse multi-périodes: Évolution sur plusieurs mois             │
│  - PercentileCalculator: Seuils dynamiques basés sur l'historique  │
│  - Détection: déclins, améliorations, alertes de tendance             │
└──────────────────────┬──────────────────────────────────────────────┘
                       │ Résultats agrégés
                       ↓
┌─────────────────────────────────────────────────────────────────┐
│              FRONTEND API (Intelligence Router)                        │
│  - Endpoint GET /intelligence/admin/{project_id}                    │
│  - Endpoint GET /intelligence/team/{project_id}                     │
│  - Retourne: anomalies, tendances, recommandations                  │
└─────────────────────────────────────────────────────────────────┘
```

---

## 🎯 ÉTAPE 1: API Router - Endpoint Intelligence

### Fichier: `src/backend/app/api/routers/intelligence.py`

**Objectif**: Exposer les endpoints d'intelligence pour le frontend

#### 1.1 Endpoint Admin Intelligence (lignes 36-100)
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
    
    Inclut :
    - Détection d'anomalies inter-sites
    - Analyse des corrélations entre métriques
    - Recommandations d'action
    """
    service = IntelligenceService(db)
    
    # Parser site_ids depuis la chaîne de caractères
    effective_site_ids = None
    if site_ids:
        try:
            site_ids_str = site_ids.strip("[]")
            effective_site_ids = [int(x.strip()) for x in site_ids_str.split(",") if x.strip()]
        except Exception as e:
            logger.warning(f"[Intelligence Router] Failed to parse site_ids '{site_ids}': {e}")
            effective_site_ids = None
    
    # Fallback pour site_manager - utiliser le même pattern que analytics router
    if effective_site_ids is None and current_admin.role == 'site_manager':
        site_access_repo = UserSiteAccessRepository()
        tenant_user_id = _get_tenant_user_id(db, current_admin)
        accessible_site_ids = [access.site_id for access in site_access_repo.get_by_user_id(db, tenant_user_id)]
        
        if current_admin.site_id:
            accessible_site_ids.append(current_admin.site_id)
        
        effective_site_ids = accessible_site_ids if accessible_site_ids else None
    
    # Pour project_manager: ne pas filtrer par site (voir tous les sites de ses projets)
    if effective_site_ids is None and current_admin.role == 'project_manager':
        effective_site_ids = None  # Tous les sites du projet
    
    # Pour viewer: charger les assignations de sites depuis tenant
    if effective_site_ids is None and current_admin.role == 'viewer':
        site_access_repo = UserSiteAccessRepository()
        tenant_user_id = _get_tenant_user_id(db, current_admin)
        accessible_site_ids = [access.site_id for access in site_access_repo.get_by_user_id(db, tenant_user_id)]
        effective_site_ids = accessible_site_ids if accessible_site_ids else None
    
    # Appel du service d'intelligence
    result = service.get_admin_intelligence(
        project_id=project_id,
        period_id=period_id,
        site_id=site_id,
        site_ids=effective_site_ids
    )
    
    return result
```

**Logique**:
- **Parsing site_ids**: Convertit la chaîne "13,14,15" en liste d'entiers
- **Contrôle d'accès**: Filtre les sites selon le rôle (site_manager, project_manager, viewer)
- **Délégation**: Appelle `IntelligenceService.get_admin_intelligence()`

---

## 🎯 ÉTAPE 2: Intelligence Service - Orchestrateur

### Fichier: `src/backend/app/services/intelligence/intelligence_service.py`

**Objectif**: Coordonner l'analyse d'intelligence en utilisant anomaly_detector et trend_analyzer

#### 2.1 get_admin_intelligence (lignes 22-85)
```python
def get_admin_intelligence(
    self,
    project_id: int,
    period_id: Optional[int] = None,
    site_id: Optional[int] = None,
    site_ids: Optional[List[int]] = None
) -> Dict[str, Any]:
    """
    Génère les insights d'intelligence pour le Super Admin ou Site Manager.
    
    Args:
        project_id: ID du projet
        period_id: ID de la période (None = dernière période)
        site_id: ID du site (optionnel, pour filtrer les données d'un site_manager)
        site_ids: IDs des sites multiples (optionnel, pour multi-sites)
        
    Returns:
        Dictionnaire avec anomalies, corrélations, tendances et recommandations
    """
    # Analyse ponctuelle (existante)
    snapshots = self._get_site_snapshots(project_id, period_id)
    
    # Filtrer par site_ids si fourni (pour multi-sites)
    if site_ids:
        snapshots = [s for s in snapshots if s.site_id in site_ids]
    elif site_id:
        # Fallback vers l'ancien système single site
        snapshots = [s for s in snapshots if s.site_id == site_id]
    
    if not snapshots:
        return {
            "error": "Aucune donnée disponible pour l'analyse",
            "anomalies": [],
            "recommendations": [],
            "trend_analysis": None,
        }
    
    # Détection d'anomalies (existante)
    velocity_anomalies = self.anomaly_detector.detect_velocity_anomalies(snapshots)
    review_anomalies   = self.anomaly_detector.detect_review_time_anomalies(snapshots)
    quality_anomalies  = self.anomaly_detector.detect_quality_anomalies(snapshots)
    all_anomalies = velocity_anomalies + review_anomalies + quality_anomalies
    
    # Analyse multi-périodes (NOUVEAU)
    trend_analysis = self._run_trend_analysis(project_id, None, site_ids)
    
    # Recommandations enrichies
    recommendations = self._generate_recommendations(
        all_anomalies,
        [],
        trend_analysis,
        site_id=site_id,
        site_ids=site_ids
    )
    
    return {
        "project_id":     project_id,
        "period_id":      period_id,
        "period_label":   self._get_period_label(period_id),
        "anomalies":      all_anomalies,
        "recommendations": recommendations,
        "summary":        self._generate_summary(all_anomalies, None, trend_analysis),
        "trend_analysis": trend_analysis,
    }
```

**Logique**:
- **Récupération snapshots**: Récupère les KPIs par site pour la période
- **Filtrage**: Filtre par site_ids si fourni (multi-sites)
- **Détection anomalies**: Utilise AnomalyDetector pour détecter les outliers
- **Analyse tendances**: Utilise TrendAnalyzer pour l'analyse multi-périodes
- **Recommandations**: Génère des recommandations basées sur les analyses

#### 2.2 _get_site_snapshots (lignes 154-160)
```python
def _get_site_snapshots(self, project_id: int, period_id: Optional[int]) -> List[KpiSnapshot]:
    """Récupère les snapshots par site pour une période."""
    if period_id:
        return self.snapshot_repo.get_site_comparison(
            self.db, project_id, period_id, kpi_field="mr_rate_per_site"
        )
    return self.snapshot_repo.get_latest_per_site(self.db, project_id)
```

**Logique**:
- **Si period_id fourni**: Récupère les snapshots pour cette période spécifique
- **Sinon**: Récupère les snapshots de la dernière période

---

## 🎯 ÉTAPE 3: Anomaly Detector - Machine Learning

### Fichier: `src/backend/app/services/intelligence/anomaly_detector.py`

**Objectif**: Détecter les outliers dans les KPIs en utilisant l'algorithme IsolationForest

#### 3.1 Isolation Forest (lignes 1-16)
```python
from sklearn.ensemble import IsolationForest

class AnomalyDetector:
    """Détecte les outliers dans les tendances KPI inter-sites."""
    
    def __init__(self, contamination: float = 0.1):
        """
        Args:
            contamination: Proportion attendue d'anomalies (0.0-0.5)
        """
        self.contamination = contamination
```

**Logique**:
- **IsolationForest**: Algorithme de machine learning pour la détection d'outliers
- **Contamination**: Proportion attendue d'anomalies (0.1 = 10% des données sont des anomalies)

#### 3.2 detect_velocity_anomalies (lignes 17-57)
```python
def detect_velocity_anomalies(self, snapshots: List[KpiSnapshot]) -> List[Dict[str, Any]]:
    """
    Détecte les anomalies de vélocité (commits/dev) entre sites ou équipes.
    
    Args:
        snapshots: Liste de snapshots KPI par site ou équipe pour une période
        
    Returns:
        Liste d'anomalies détectées avec contexte
    """
    if len(snapshots) < 3:
        return []  # Pas assez de données pour détecter des anomalies
    
    # Extraire les vélocités
    velocities = np.array([s.mr_rate_per_site for s in snapshots]).reshape(-1, 1)
    
    # Isolation Forest pour détecter les outliers
    clf = IsolationForest(contamination=self.contamination, random_state=42)
    predictions = clf.fit_predict(velocities)
    
    anomalies = []
    for i, (snap, pred) in enumerate(zip(snapshots, predictions)):
        if pred == -1:  # Anomalie détectée
            # Context-aware: utiliser group_id/group_name pour les équipes, site_id/site_name pour les sites
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

**Logique**:
- **Vélocités**: Extrait les MRs/dev de chaque snapshot
- **IsolationForest**: Entraîne le modèle et prédit les outliers (-1 = anomalie)
- **Context-aware**: Détecte si c'est une équipe ou un site
- **Sévérité**: "high" si < 2.0 MRs/dev, "medium" sinon
- **Type**: "outlier" (en dessous de la moyenne) ou "overperformer" (au-dessus de la moyenne)

#### 3.3 detect_review_time_anomalies (lignes 59-89)
```python
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
            # Context-aware: utiliser group_id/group_name pour les équipes, site_id/site_name pour les sites
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

**Logique**:
- **Review times**: Extrait les temps de review de chaque snapshot
- **IsolationForest**: Entraîne le modèle et prédit les outliers
- **Sévérité**: "high" si > 72 heures, "medium" sinon
- **Type**: "bottleneck" (goulot de review)

#### 3.4 detect_quality_anomalies (lignes 91-121)
```python
def detect_quality_anomalies(self, snapshots: List[KpiSnapshot]) -> List[Dict[str, Any]]:
    """Détecte les anomalies de qualité (taux d'approbation)."""
    if len(ssnapshots) < 3:
        return []
    
    quality_scores = np.array([s.approved_mr_rate for s in snapshots]).reshape(-1, 1)
    
    clf = IsolationForest(contamination=self.contamination, random_state=42)
    predictions = clf.fit_predict(quality_scores)
    
    anomalies = []
    for i, (snap, pred) in enumerate(zip(snapshots, predictions)):
        if pred == -1:
            # Context-aware: utiliser group_id/group_name pour les équipes, site_id/site_name pour les sites
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

**Logique**:
- **Quality scores**: Extrait les taux d'approbation de chaque snapshot
- **IsolationForest**: Entraîne le modèle et prédit les outliers
- **Sévérité**: "high" si < 60%, "medium" sinon
- **Type**: "quality_issue" (problème de qualité)

---

## 🎯 ÉTAPE 4: Trend Analyzer - Analyse Multi-Périodes

### Fichier: `src/backend/app/services/intelligence/trend_analyzer.py`

**Objectif**: Analyser l'évolution des KPIs sur plusieurs mois pour détecter les tendances

#### 4.1 Seuils Dynamiques (lignes 14-70)
```python
# Seuils métier (fallbacks si pas assez de données)
FALLBACK_VELOCITY_LOW_THRESHOLD    = 1.0   # MRs/dev considéré faible
FALLBACK_REVIEW_TIME_HIGH_THRESHOLD = 48.0  # heures — au-dessus : goulot
FALLBACK_QUALITY_LOW_THRESHOLD     = 0.5   # taux d'approbation — en dessous : risque qualité
DECLINING_MIN_PERIODS     = 2     # nb de périodes consécutives en déclin pour alerter

class TrendAnalyzer:
    def __init__(self, db: Optional[Session] = None, project_id: Optional[int] = None, site_ids: Optional[List[int]] = None, group_ids: Optional[List[int]] = None):
        """
        Initialise le TrendAnalyzer avec des seuils dynamiques ou fallbacks.
        """
        self.db = db
        self.project_id = project_id
        self.site_ids = site_ids
        self.group_ids = group_ids
        self.thresholds = self._get_dynamic_thresholds() if db and project_id else self._get_fallback_thresholds()
    
    def _get_dynamic_thresholds(self) -> Dict[str, float]:
        """Calcule les seuils dynamiques via PercentileCalculator."""
        calculator = PercentileCalculator(self.db)
        thresholds = calculator.calculate_dynamic_thresholds(self.project_id, min_periods=1)
        return {
            "velocity_low": thresholds["velocity_low"],
            "review_time_high": thresholds["review_time_high"],
            "quality_low": thresholds["quality_low"],
            "using_fallback": thresholds["using_fallback"],
        }
    
    def _get_fallback_thresholds(self) -> Dict[str, float]:
        """Retourne les seuils de fallback hardcodés."""
        return {
            "velocity_low": FALLBACK_VELOCITY_LOW_THRESHOLD,
            "review_time_high": FALLBACK_REVIEW_TIME_HIGH_THRESHOLD,
            "quality_low": FALLBACK_QUALITY_LOW_THRESHOLD,
            "using_fallback": True,
        }
```

**Logique**:
- **Seuils dynamiques**: Calculés via PercentileCalculator basé sur l'historique du projet
- **Fallbacks**: Seuils hardcodés si pas assez de données
- **PercentileCalculator**: Calcule les percentiles (P25, P75) pour définir les seuils

#### 4.2 analyze (lignes 72-199)
```python
def analyze(self, site_histories: Dict[int, List[KpiSnapshot]]) -> Dict[str, Any]:
    """
    Analyse complète multi-périodes pour tous les sites ou équipes.
    Context-aware: détecte automatiquement si les données sont par site ou par équipe.
    
    Returns:
        {
            "site_trends": {entity_id: {...}},  # ou "team_trends" pour les équipes
            "alerts":      [...],
            "health_scores": {entity_id: int},
            "rh_recommendations": [...],
            "summary": str
        }
    """
    site_trends:     Dict[int, Dict] = {}
    all_alerts:      List[Dict]      = []
    health_scores:   Dict[int, int]  = {}
    rh_recommendations: List[Dict] = []
    
    # Détecter si c'est une analyse d'équipes ou de sites
    is_team_analysis = False
    for entity_id, history in site_histories.items():
        if history and bool(history[-1].group_id is not None):
            is_team_analysis = True
            break
    
    for entity_id, history in site_histories.items():
        if not history:
            continue
        
        # Context-aware: détecte si c'est une équipe (group) ou un site
        is_group = bool(history[-1].group_id is not None)
        if is_group:
            entity_name = getattr(history[-1].group, "name", f"Équipe {entity_id}") if history[-1].group else f"Équipe {entity_id}"
        else:
            entity_name = getattr(history[-1].site, "name", f"Site {entity_id}") if history[-1].site else f"Site {entity_id}"
        
        n = len(history)
        
        # Filtrer les snapshots sans données réelles
        def has_data(snap) -> bool:
            """Retourne True si le snapshot contient au moins une métrique KPI renseignée et non-nulle."""
            mr_rate = snap.mr_rate_per_site
            app_rate = snap.approved_mr_rate
            comm_rate = snap.commit_rate_per_site
            
            if mr_rate is None and app_rate is None and comm_rate is None:
                return False
            
            mr_val = mr_rate or 0.0
            app_val = app_rate or 0.0
            comm_val = comm_rate or 0.0
            
            if mr_val == 0.0 and app_val == 0.0 and comm_val == 0.0:
                return False
            
            return True
        
        history_with_data = [s for s in history if has_data(s)]
        latest_missing = bool(not has_data(history[-1]))  # Dernier mois sans données?
        
        # Si aucun snapshot n'a de données, passer ce site
        if not history_with_data:
            continue
        
        # Pour les tendances, utiliser uniquement les mois avec données
        vel_trend     = self._compute_trend([s.mr_rate_per_site        or 0.0 for s in history_with_data])
        rev_trend     = self._compute_trend([s.avg_review_time_hours   or 0.0 for s in history_with_data])
        qual_trend    = self._compute_trend([s.approved_mr_rate        or 0.0 for s in history_with_data])
        commit_trend  = self._compute_trend([s.commit_rate_per_site    or 0.0 for s in history_with_data])
        
        # Valeur actuelle (dernier mois AVEC données)
        latest = history_with_data[-1]
        current_velocity    = latest.mr_rate_per_site      or 0.0
        current_review_time = latest.avg_review_time_hours or 0.0
        current_quality     = latest.approved_mr_rate      or 0.0
        
        # Alertes de tendance
        alerts = self._detect_trend_alerts(
            entity_id, entity_name, history_with_data,
            vel_trend, rev_trend, qual_trend,
            latest_missing=latest_missing
        )
        all_alerts.extend(alerts)
        
        # Score de santé (0-100)
        score = self._compute_health_score(
            current_velocity, current_review_time, current_quality,
            vel_trend, rev_trend, qual_trend
        )
        health_scores[entity_id] = score
        
        # Recommandations RH
        rh_recs = self._generate_rh_recommendations(
            entity_id, entity_name, score,
            latest, vel_trend, rev_trend, qual_trend, n,
            entity_type="group" if self.group_ids else "site"
        )
        rh_recommendations.extend(rh_recs)
        
        site_trends[entity_id] = {
            "site_name":      entity_name,
            "n_periods":      len(history_with_data),
            "latest_missing": latest_missing,
            "velocity_trend": vel_trend,
            "review_trend":   rev_trend,
            "quality_trend": qual_trend,
            "commit_trend":   commit_trend,
            "health_score":   score,
            "alerts":         alerts,
        }
    
    # Recommandations inter-sites (best-practice sharing)
    bp_recs = self._detect_best_practice_sharing(site_trends, health_scores)
    rh_recommendations.extend(bp_recs)
    
    # Retourner "team_trends" si c'est une analyse d'équipes, sinon "site_trends"
    trends_key = "team_trends" if is_team_analysis else "site_trends"
    
    return {
        trends_key:           site_trends,
        "alerts":              all_alerts,
        "health_scores":       health_scores,
        "rh_recommendations":  rh_recommendations,
        "summary":             self._generate_summary(site_trends, all_alerts, health_scores),
    }
```

**Logique**:
- **Context-aware**: Détecte automatiquement si c'est une analyse de sites ou d'équipes
- **Filtrage données**: Exclut les snapshots sans données réelles (NULL ou 0.0)
- **Calcul tendances**: Calcule la tendance pour chaque KPI (velocity, review, quality, commit)
- **Alertes**: Détecte les alertes de tendance (déclin, amélioration)
- **Score de santé**: Calcule un score de santé (0-100) pour chaque site/équipe
- **Recommandations RH**: Génère des recommandations basées sur les analyses

#### 4.3 _compute_trend (méthode interne)
```python
def _compute_trend(self, values: List[float]) -> str:
    """
    Calcule la tendance d'une série de valeurs.
    
    Returns:
        "increasing", "decreasing", "stable", "insufficient_data"
    """
    if len(values) < 2:
        return "insufficient_data"
    
    # Calcul de la pente (régression linéaire simple)
    x = np.arange(len(values))
    slope, _ = np.polyfit(x, values, 1)
    
    if slope > 0.01:
        return "increasing"
    elif slope < -0.01:
        return "decreasing"
    else:
        return "stable"
```

**Logique**:
- **Régression linéaire**: Calcule la pente de la série temporelle
- **Tendance**: "increasing" (croissante), "decreasing" (décroissante), "stable" (stable)

#### 4.4 _compute_health_score (méthode interne)
```python
def _compute_health_score(self, velocity: float, review_time: float, quality: float, vel_trend: str, rev_trend: str, qual_trend: str) -> int:
    """
    Calcule un score de santé (0-100) basé sur les KPIs et tendances.
    
    Formule:
    - Velocity: 30% (normalisé sur 5 MRs/dev)
    - Review Time: 25% (inverse, normalisé sur 24h)
    - Quality: 30% (normalisé sur 1.0)
    - Velocity Trend: 5% (bonus si croissant)
    - Review Trend: 5% (bonus si décroissant)
    - Quality Trend: 5% (bonus si croissant)
    """
    # Normalisation des KPIs
    velocity_score = min(velocity / 5.0, 1.0) * 30
    review_score = (1.0 / (1.0 + review_time / 24.0)) * 25
    quality_score = quality * 30
    
    # Bonus de tendance
    trend_bonus = 0
    if vel_trend == "increasing":
        trend_bonus += 5
    if rev_trend == "decreasing":
        trend_bonus += 5
    if qual_trend == "increasing":
        trend_bonus += 5
    
    score = int(velocity_score + review_score + quality_score + trend_bonus)
    return max(0, min(100, score))
```

**Logique**:
- **Normalisation**: Chaque KPI est normalisé (0.0-1.0)
- **Pondération**: Velocity (30%), Review Time (25%), Quality (30%), Trends (15%)
- **Score final**: Entier entre 0 et 100

---

## 🎯 ÉTAPE 5: Relation avec Gestion Développeurs et KPIs

### Intégration avec SCD Type 2

Fab Intelligence utilise les données KPIs qui sont calculés dynamiquement selon la gestion des développeurs:

#### 5.1 Impact des Mutations sur Fab Intelligence

**Exemple**: Mutation Paris → Lyon en juin 2026

```
Janvier 2026:
- Paris: 5 développeurs, mr_rate = 4.2
- Lyon: 3 développeurs, mr_rate = 3.8

Juin 2026 (après mutation):
- Paris: 2 développeurs, mr_rate = 3.5 (déclin)
- Lyon: 6 développeurs, mr_rate = 4.5 (amélioration)

Fab Intelligence détecte:
- Paris: velocity_anomaly (mr_rate < 2.0), severity: "high"
- Lyon: overperformer (mr_rate > moyenne), type: "overperformer"
```

#### 5.2 Impact des Suspensions sur Fab Intelligence

**Exemple**: Suspension dev_id=1 en mars 2026

```
Février 2026:
- Paris: 5 développeurs, mr_rate = 4.2

Mars 2026 (après suspension):
- Paris: 4 développeurs, mr_rate = 3.8 (déclin)

Fab Intelligence détecte:
- Paris: velocity_anomaly (mr_rate < 2.0), severity: "high"
- Trend analysis: "decreasing" sur 2 périodes (février → mars)
```

#### 5.3 Impact des Offboardings sur Fab Intelligence

**Exemple**: Offboarding dev_id=1 le 10 janvier 2026

```
Décembre 2025:
- Paris: 5 développeurs, mr_rate = 4.2

Janvier 2026 (après offboarding):
- Paris: 4 développeurs, mr_rate = 3.8 (déclin)

Fab Intelligence détecte:
- Paris: velocity_anomaly (mr_rate < 2.0), severity: "high"
- Trend analysis: "decreasing" sur 2 périodes (décembre → janvier)
```

---

## 🎯 ÉTAPE 6: Recommandations Générées

### Fichier: `src/backend/app/services/intelligence/intelligence_service.py`

**Objectif**: Générer des recommandations basées sur les anomalies et tendances détectées

#### 6.1 _generate_recommendations (méthode interne)
```python
def _generate_recommendations(
    self,
    anomalies: List[Dict[str, Any]],
    correlations: List[Dict[str, Any]],
    trend_analysis: Optional[Dict[str, Any]],
    site_id: Optional[int] = None,
    site_ids: Optional[List[int]] = None
) -> List[Dict[str, Any]]:
    """
    Génère des recommandations basées sur les anomalies et tendances.
    """
    recommendations = []
    
    # Recommandations basées sur les anomalies
    for anomaly in anomalies:
        if anomaly["metric"] == "velocity" and anomaly["severity"] == "high":
            recommendations.append({
                "type": "investigation",
                "priority": "high",
                "message": f"{anomaly['site_name']}: Vélocité anormale ({anomaly['value']:.2f} MRs/dev). Investigatez les causes possibles.",
                "entity_id": anomaly["site_id"],
            })
        elif anomaly["metric"] == "review_time" and anomaly["severity"] == "high":
            recommendations.append({
                "type": "action",
                "priority": "high",
                "message": f"{anomaly['site_name']}: Temps de review excessif ({anomaly['value']:.1f}h). Envisagez un programme de formation Code Review.",
                "entity_id": anomaly["site_id"],
            })
        elif anomaly["metric"] == "quality" and anomaly["severity"] == "high":
            recommendations.append({
                "type": "action",
                "priority": "medium",
                "message": f"{anomaly['site_name']}: Taux d'approbation faible ({anomaly['value']:.0%}). Renforcez les processus de review.",
                "entity_id": anomaly["site_id"],
            })
    
    # Recommandations basées sur les tendances
    if trend_analysis:
        for entity_id, trend in trend_analysis.get("site_trends", {}).items():
            if trend["velocity_trend"] == "decreasing" and trend["n_periods"] >= DECLINING_MIN_PERIODS:
                recommendations.append({
                    "type": "alert",
                    "priority": "high",
                    "message": f"{trend['site_name']}: Déclin de vélocité sur {trend['n_periods']} périodes consécutives. Planifiez une intervention.",
                    "entity_id": entity_id,
                })
            elif trend["review_trend"] == "increasing" and trend["n_periods"] >= DECLINING_MIN_PERIODS:
                recommendations.append({
                    "type": "alert",
                    "priority": "medium",
                    "message": f"{trend['site_name']}: Augmentation du temps de review sur {trend['n_periods']} périodes consécutives. Risque de goulot.",
                    "entity_id": entity_id,
                })
    
    return recommendations
```

**Logique**:
- **Anomalies**: Génère des recommandations pour chaque anomalie détectée
- **Tendances**: Génère des alertes si déclin/amélioration sur plusieurs périodes
- **Priorité**: "high" pour les problèmes critiques, "medium" pour les problèmes modérés

---

## 🎯 ÉTAPE 7: Exemple Concret Complet

### Scénario: Détection Anomalie Site Lyon

**Contexte**:
- Projet: Dashboard KPI
- Période: Juin 2026
- Sites: Paris (5 devs), Lyon (3 devs), Marseille (4 devs)

**Données KPIs Juin 2026**:
```
Paris: mr_rate = 4.2, review_time = 12h, approved_mr_rate = 0.85
Lyon: mr_rate = 1.8, review_time = 48h, approved_mr_rate = 0.65
Marseille: mr_rate = 3.9, review_time = 15h, approved_mr_rate = 0.82
```

**Processus Fab Intelligence**:

#### 1. Récupération Snapshots
```python
# IntelligenceService.get_admin_intelligence(project_id=1, period_id=6)
snapshots = snapshot_repo.get_site_comparison(db, project_id=1, period_id=6, kpi_field="mr_rate_per_site")
# Résultat: 3 snapshots (Paris, Lyon, Marseille)
```

#### 2. Anomaly Detection
```python
# AnomalyDetector.detect_velocity_anomalies(snapshots)
velocities = [4.2, 1.8, 3.9]
clf = IsolationForest(contamination=0.1, random_state=42)
predictions = clf.fit_predict(velocities)
# Résultat: [-1, -1, 1] → Lyon est une anomalie

anomalies = [{
    "site_id": 6,
    "site_name": "Lyon",
    "metric": "velocity",
    "value": 1.8,
    "severity": "high",
    "type": "outlier"
}]
```

#### 3. Review Time Anomalies
```python
# AnomalyDetector.detect_review_time_anomalies(snapshots)
review_times = [12, 48, 15]
clf = IsolationForest(contamination=0.1, random_state=42)
predictions = clf.fit_predict(review_times)
# Résultat: [-1, -1, 1] → Lyon est une anomalie

anomalies.append({
    "site_id": 6,
    "site_name": "Lyon",
    "metric": "review_time",
    "value": 48.0,
    "severity": "medium",
    "type": "bottleneck"
})
```

#### 4. Quality Anomalies
```python
# AnomalyDetector.detect_quality_anomalies(snapshots)
quality_scores = [0.85, 0.65, 0.82]
clf = IsolationForest(contamination=0.1, random_state=42)
predictions = clf.fit_predict(quality_scores)
# Résultat: [-1, -1, 1] → Lyon est une anomalie

anomalies.append({
    "site_id": 6,
    "site_name": "Lyon",
    "metric": "quality",
    "value": 0.65 * 100,
    "severity": "medium",
    "type": "quality_issue"
})
```

#### 5. Trend Analysis (3 derniers mois)
```python
# TrendAnalyzer.analyze(site_histories)
# Historique Lyon:
# Avril: mr_rate = 3.5
# Mai: mr_rate = 2.5
# Juin: mr_rate = 1.8

vel_trend = _compute_trend([3.5, 2.5, 1.8])
# Résultat: "decreasing" (pente négative)

alerts = [{
    "entity_id": 6,
    "entity_name": "Lyon",
    "type": "trend_alert",
    "message": "Lyon: Déclin de vélocité sur 3 périodes consécutives. Planifiez une intervention.",
    "priority": "high"
}]
```

#### 6. Health Score
```python
# _compute_health_score(velocity=1.8, review_time=48, quality=0.65, vel_trend="decreasing", rev_trend="increasing", qual_trend="decreasing")
velocity_score = min(1.8 / 5.0, 1.0) * 30 = 10.8
review_score = (1.0 / (1.0 + 48 / 24.0)) * 25 = 9.4
quality_score = 0.65 * 30 = 19.5
trend_bonus = 5 (qual_trend = "decreasing" → pas de bonus)

score = int(10.8 + 9.4 + 19.5 + 0) = 40
```

#### 7. Recommandations Générées
```python
recommendations = [
    {
        "type": "investigation",
        "priority": "high",
        "message": "Lyon: Vélocité anormale (1.80 MRs/dev). Investigatez les causes possibles.",
        "entity_id": 6,
    },
    {
        "type": "action",
        "priority": "medium",
        "message": "Lyon: Temps de review excessif (48.0h). Envisagez un programme de formation Code Review.",
        "entity_id": 6,
    },
    {
        "type": "action",
        "priority": "medium",
        "message": "Lyon: Taux d'approbation faible (65%). Renforcez les processus de review.",
        "entity_id": 6,
    },
    {
        "type": "alert",
        "priority": "high",
        "message": "Lyon: Déclin de vélocité sur 3 périodes consécutives. Planifiez une intervention.",
        "entity_id": 6,
    }
]
```

#### 8. Résultat Final
```python
{
    "project_id": 1,
    "period_id": 6,
    "period_label": "Juin 2026",
    "anomalies": [
        {"site_id": 6, "site_name": "Lyon", "metric": "velocity", "value": 1.8, "severity": "high", "type": "outlier"},
        {"site_id": 6, "site_name": "Lyon", "metric": "review_time", "value": 48.0, "severity": "medium", "type": "bottleneck"},
        {"site_id": 6, "site_name": "Lyon", "metric": "quality", "value": 65.0, "severity": "medium", "type": "quality_issue"}
    ],
    "recommendations": [
        {"type": "investigation", "priority": "high", "message": "Lyon: Vélocité anormale (1.80 MRs/dev)...", "entity_id": 6},
        {"type": "action", "priority": "medium", "message": "Lyon: Temps de review excessif (48.0h)...", "entity_id": 6},
        {"type": "action", "priority": "medium", "message": "Lyon: Taux d'approbation faible (65%)...", "entity_id": 6},
        {"type": "alert", "priority": "high", "message": "Lyon: Déclin de vélocité sur 3 périodes consécutives...", "entity_id": 6}
    ],
    "summary": "3 anomalies détectées. Site Lyon en difficulté (score=40/100). Recommandations: investigation, formation, renforcement processus.",
    "trend_analysis": {
        "site_trends": {
            6: {
                "site_name": "Lyon",
                "n_periods": 3,
                "velocity_trend": "decreasing",
                "review_trend": "increasing",
                "quality_trend": "decreasing",
                "commit_trend": "decreasing",
                "health_score": 40,
                "alerts": [
                    {"entity_id": 6, "entity_name": "Lyon", "type": "trend_alert", "message": "Lyon: Déclin de vélocité sur 3 périodes consécutives...", "priority": "high"}
                ]
            }
        }
    }
}
```

---

## 🎓 Points Clés pour la Soutenance

### 1. Isolation Forest (Machine Learning)
- **Algorithme**: IsolationForest de sklearn pour la détection d'outliers
- **Contamination**: 0.1 (10% des données sont des anomalies)
- **Métriques analysées**: velocity (MRs/dev), review_time (heures), quality (taux d'approbation)

### 2. Trend Analysis (Analyse Multi-Périodes)
- **Historique**: Analyse sur 3 derniers mois minimum
- **Tendances**: "increasing", "decreasing", "stable"
- **Seuils dynamiques**: Calculés via PercentileCalculator basé sur l'historique
- **Score de santé**: 0-100 basé sur les KPIs et tendances

### 3. Context-Aware
- **Sites vs Équipes**: Détecte automatiquement si les données sont par site ou par équipe
- **Noms**: Utilise les noms de sites/groupes pour un contexte clair
- **Filtrage**: Exclut les snapshots sans données réelles (NULL ou 0.0)

### 4. Recommandations Intelligentes
- **Anomalies**: Recommandations basées sur les anomalies détectées
- **Tendances**: Alertes si déclin/amélioration sur plusieurs périodes
- **Priorité**: "high" pour les problèmes critiques, "medium" pour les modérés

### 5. Relation avec Gestion Développeurs
- **SCD Type 2**: Les KPIs sont calculés dynamiquement selon les affectations
- **Impact**: Les mutations/suspensions/offboardings impactent automatiquement Fab Intelligence
- **Dynamique**: Fab Intelligence s'adapte automatiquement aux changements d'affectation

---

## 🚀 Conclusion

Fab Intelligence est un système d'intelligence statistique qui:

1. **Détecte les anomalies**: Utilise IsolationForest pour identifier les outliers dans les KPIs
2. **Analyse les tendances**: Utilise TrendAnalyzer pour détecter les évolutions sur plusieurs mois
3. **Génère des recommandations**: Propose des actions basées sur les analyses
4. **Est dynamique**: S'adapte automatiquement aux changements de gestion des développeurs (mutations, suspensions, offboardings)

Le système utilise les KPIs calculés dynamiquement selon la gestion SCD Type 2 des développeurs, permettant une intelligence statistique précise et contextuelle.
