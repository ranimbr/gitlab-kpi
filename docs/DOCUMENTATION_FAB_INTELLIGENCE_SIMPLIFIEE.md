# Documentation Simplifiée : Comment Fonctionne Fab Intelligence

## Table des Matières
1. [Vue d'ensemble](#vue-densemble)
2. [Architecture du système](#architecture)
3. [Flux de données détaillé](#flux-donnees)
4. [Explication du code Frontend](#code-frontend)
5. [Explication du code Backend](#code-backend)
6. [Exemple concret](#exemple-concret)

---

## 1. Vue d'ensemble <a name="vue-densemble"></a>

### Qu'est-ce que Fab Intelligence ?

**Fab Intelligence** est un module d'analyse statistique qui compare les performances des sites et équipes pour :

- **Détecter les anomalies** : Sites/équipes qui performent mal ou exceptionnellement bien
- **Analyser les corrélations** : Relations entre différentes métriques (ex: vélocité vs qualité)
- **Générer des recommandations** : Actions suggérées pour améliorer les performances
- **Analyser les tendances** : Évolution sur plusieurs mois

**Important** : C'est de la logique statistique pure, PAS de l'intelligence artificielle. Tout est calculé avec des règles mathématiques précises.

---

## 2. Architecture du système <a name="architecture"></a>

### Schéma simplifié

```
┌─────────────────────────────────────────────────────────────────┐
│                    FRONTEND (React)                              │
│  ComparativeAnalyticsPage.jsx (Page principale)                   │
│  IntelligenceCard.jsx (Affichage des cartes)                      │
│  insightsEngine.js (Moteur d'analyse JS)                          │
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

### Rôles des composants

#### Frontend
- **ComparativeAnalyticsPage.jsx** : Page qui affiche l'analyse comparative
- **IntelligenceCard.jsx** : Composant qui affiche chaque site/équipe avec son score, alertes et recommandations
- **insightsEngine.js** : Moteur JavaScript qui calcule les scores et génère des insights
- **analyticsService.js** : Service qui fait les appels API au backend

#### Backend
- **intelligence.py (router)** : Gère les requêtes API et vérifie les permissions
- **intelligence_service.py** : Service principal qui coordonne l'analyse
- **AnomalyDetector** : Détecte les valeurs anormales (outliers)
- **CorrelationAnalyzer** : Analyse les relations entre métriques
- **TrendAnalyzer** : Analyse l'évolution sur plusieurs mois

---

## 3. Flux de données détaillé <a name="flux-donnees"></a>

### Étape 1 : Utilisateur clique sur "Fab Intelligence"

**Fichier** : `ComparativeAnalyticsPage.jsx` (Lignes 1514-1552)

```javascript
useEffect(() => {
  if (projectId && (user?.role === 'super_admin' || user?.role === 'site_manager' || ...)) {
    const fetchIntelligence = async () => {
      setIntelligenceLoading(true);
      try {
        // Déterminer quels sites l'utilisateur peut voir
        let effectiveSiteIds = null;
        if (user?.role === 'site_manager') {
          effectiveSiteIds = userAssignments.site_ids;
        }
        
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
      } finally {
        setIntelligenceLoading(false);
      }
    };
    fetchIntelligence();
  }
}, [projectId, user]);
```

**Ce qui se passe** :
1. L'utilisateur clique sur "Fab Intelligence"
2. Le frontend vérifie le rôle de l'utilisateur
3. Il détermine quels sites/équipes l'utilisateur peut voir
4. Il appelle l'API backend avec ces filtres

### Étape 2 : Appel API Backend

**Fichier** : `analyticsService.js` (Lignes 389-404)

```javascript
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

**Ce qui se passe** :
1. Le frontend construit les paramètres de la requête
2. Il fait un appel GET à `/intelligence/admin/{project_id}`
3. Le backend retourne les données d'intelligence

### Étape 3 : Router Backend vérifie les permissions

**Fichier** : `intelligence.py` (Lignes 36-104)

```python
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

### Étape 4 : Service d'Intelligence récupère les données

**Fichier** : `intelligence_service.py` (Lignes 24-96)

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
    """
    # 1. Récupérer les snapshots KPI par site
    snapshots = self._get_site_snapshots(project_id, period_id)
    
    # 2. Filtrer par site_ids si fourni
    if site_ids:
        snapshots = [s for s in snapshots if s.site_id in site_ids]
    elif site_id:
        snapshots = [s for s in snapshots if s.site_id == site_id]
    
    if not snapshots:
        return { "error": "Aucune donnée disponible", ... }
    
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

**Ce qui se passe** :
1. Le service récupère les snapshots KPI de la base de données
2. Il filtre selon les sites que l'utilisateur peut voir
3. Il détecte les anomalies (valeurs anormales)
4. Il analyse les corrélations entre métriques
5. Il analyse les tendances sur plusieurs mois
6. Il génère des recommandations basées sur tout ça
7. Il retourne tout au frontend

### Étape 5 : Détection des anomalies

**Fichier** : `intelligence_service.py` (Lignes 62-66)

```python
# Détection d'anomalies
velocity_anomalies = self.anomaly_detector.detect_velocity_anomalies(snapshots)
review_anomalies   = self.anomaly_detector.detect_review_time_anomalies(snapshots)
quality_anomalies  = self.anomaly_detector.detect_quality_anomalies(snapshots)
all_anomalies = velocity_anomalies + review_anomalies + quality_anomalies
```

**Comment ça marche** :
- **AnomalyDetector** utilise des algorithmes statistiques (ex: Isolation Forest)
- Il compare chaque site/équipe à la moyenne du groupe
- Si un site est significativement différent → c'est une anomalie
- Exemple : Si la moyenne de vélocité est 5 commits/dev et un site a 1 commit/dev → anomalie

### Étape 6 : Analyse des corrélations

\**Fichier** : `intelligence_service.py` (Lignes 68-73)

```python
# Analyse des corrélations
correlation_analysis = self.correlation_analyzer.analyze_site_correlations(snapshots)

# Filtrer le message "Aucune corrélation significative détectée"
if correlation_analysis.get("insights"):
    correlation_analysis["insights"] = [ins for ins in correlation_analysis["insights"] 
                                         if ins != "Aucune corrélation significative détectée"]
```

**Comment ça marche** :
- **CorrelationAnalyzer** calcule les coefficients de corrélation entre métriques
- Exemple : Corrélation entre vélocité et temps de revue
- Si corrélation forte → génère un insight
- Exemple : "Sites avec vélocité élevée ont tendance à avoir des temps de revue plus longs"

### Étape 7 : Analyse des tendances

**Fichier** : `intelligence_service.py` (Lignes 75-76)

```python
# Analyse multi-périodes (NOUVEAU)
trend_analysis = self._run_trend_analysis(project_id, None, site_ids)
```

**Comment ça marche** :
- **TrendAnalyzer** récupère les données sur 3 mois
- Il analyse l'évolution de chaque métrique
- Il détecte les tendances (amélioration, dégradation, stable)
- Il génère des recommandations RH basées sur les tendances

### Étape 8 : Génération des recommandations

**Fichier** : `intelligence_service.py` (Lignes 298-378)

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
    recommendations.extend(correlation_insights_filtered)
    
    # Recommandations RH multi-périodes
    if trend_analysis and trend_analysis.get("rh_recommendations"):
        for rh_rec in trend_analysis["rh_recommendations"]:
            recommendations.append(f"[{rh_rec['category']}] {rh_rec['message']}")
    
    return recommendations
```

**Comment ça marche** :
1. Il regarde les anomalies détectées
2. Il génère des recommandations basées sur le type d'anomalie
3. Il ajoute les insights de corrélation
4. Il ajoute les recommandations RH basées sur les tendances
5. Il retourne une liste de recommandations

### Étape 9 : Affichage dans le Frontend

**Fichier** : `IntelligenceCard.jsx` (Lignes 290-360)

```javascript
{/* Expanded Details - Alertes */}
{alerts && alerts.length > 0 && (
  <div className="mb-3">
    <h6 className="fw-bold mb-2">
      <i className="ri-alert-line me-1"></i>
      Alertes
    </h6>
    <div className="d-flex flex-column gap-2">
      {alerts.map((alert, idx) => (
        <div key={idx} className="p-2 rounded-2">
          <span className="badge">{alert.severity === 'high' ? 'critique' : 'alerte'}</span>
          <span>{alert.detail}</span>
        </div>
      ))}
    </div>
  </div>
)}

{/* Expanded Details - Recommandations */}
{recommendations && recommendations.length > 0 && (
  <div>
    <h6 className="fw-bold mb-2">
      <i className="ri-lightbulb-line me-1"></i>
      Recommandations
    </h6>
    <div className="d-flex flex-column gap-2">
      {recommendations.slice(0, 3).map((rec, idx) => (
        <div key={idx} className="p-2 rounded-2">
          <span>{rec}</span>
        </div>
      ))}
    </div>
  </div>
)}
```

**Ce qui se passe** :
1. Le frontend reçoit les données d'intelligence
2. Il affiche le score de santé (cercle de progression)
3. Il affiche les alertes (anomalies détectées)
4. Il affiche les recommandations (actions suggérées)
5. L'utilisateur peut cliquer sur "Voir détails" pour voir plus

---

## 4. Explication du code Frontend <a name="code-frontend"></a>

### IntelligenceCard.jsx - Composant principal

```javascript
const IntelligenceCard = ({ 
  entityName,      // Nom du site ou équipe (ex: "Site Tunis")
  entityType,      // 'site' ou 'team'
  healthScore,     // Score de santé (0-100)
  nPeriods,        // Nombre de périodes analysées
  metrics,         // Métriques (vélocité, temps de revue, qualité)
  alerts,          // Alertes détectées
  recommendations, // Recommandations générées
  isExpanded,     // Si la carte est étendue
  onToggle        // Fonction pour étendre/réduire
}) => {
  // Déterminer la couleur du score
  const getScoreColor = (score) => {
    if (score >= 70) return { color: "#10b981", text: "Excellent" };
    if (score >= 40) return { color: "#f59e0b", text: "Surveillance" };
    return { color: "#ef4444", text: "Critique" };
  };
  
  const scoreInfo = getScoreColor(healthScore);
  
  return (
    <div className="intelligence-card" onClick={onToggle}>
      {/* Affichage compact */}
      <div>
        {/* Cercle de progression */}
        <svg>
          <circle stroke={scoreInfo.color} strokeDasharray={`${healthScore}, 100`} />
        </svg>
        
        {/* Nom et score */}
        <div>{entityName}</div>
        <div>{healthScore}/100</div>
      </div>
      
      {/* Détails étendus */}
      {isExpanded && (
        <div>
          {/* Alertes */}
          {alerts.map(alert => <div>{alert.detail}</div>)}
          
          {/* Recommandations */}
          {recommendations.map(rec => <div>{rec}</div>)}
        </div>
      )}
    </div>
  );
}
```

**Explication** :
- Ce composant affiche une carte pour chaque site/équipe
- Il montre le score de santé avec un cercle de progression
- Il affiche les métriques clés (vélocité, temps de revue, qualité)
- Quand on clique, il s'étend pour montrer les alertes et recommandations

### insightsEngine.js - Moteur d'analyse JavaScript

```javascript
/**
 * generateInsights
 *
 * @param {object}   current        - Snapshot KPI de l'entité sélectionnée
 * @param {object[]} allSnapshots   - Tous les snapshots du même projet
 * @param {object}   previous       - Snapshot du mois précédent
 * @param {string}   entityLabel    - Nom de l'entité
 * @param {object}   thresholds     - Seuils configurés
 */
export function generateInsights(current, allSnapshots, previous, entityLabel, thresholds) {
  const insights = [];
  const others = allSnapshots.filter(s => s !== current);
  
  // RÈGLE 1 : Taux d'approbation critique
  const approvedRate = Number(current.approved_mr_rate);
  if (approvedRate < thresholds.approvedMrRate.critical) {
    insights.push({
      type: "danger",
      title: `Taux d'approbation critique — ${(approvedRate * 100).toFixed(1)}%`,
      description: `${entityLabel} est en dessous du seuil critique. Action immédiate recommandée.`,
    });
  }
  
  // RÈGLE 2 : Temps de revue élevé
  const reviewTime = Number(current.avg_review_time_hours);
  if (reviewTime > thresholds.avgReviewTimeHours.critical) {
    insights.push({
      type: "danger",
      title: `Temps de revue critique — ${reviewTime.toFixed(1)}h`,
      description: `Le temps de revue dépasse le seuil critique. Des MRs risquent de rester bloquées.`,
    });
  }
  
  // RÈGLE 3 : Comparaison avec la moyenne
  const avgOthers = avg(others, "approved_mr_rate");
  if (approvedRate > avgOthers + 0.15) {
    insights.push({
      type: "success",
      title: `Excellent taux d'approbation — ${(approvedRate * 100).toFixed(1)}%`,
      description: `${entityLabel} surpasse la moyenne. Pratique à partager.`,
    });
  }
  
  return insights;
}
```

**Explication** :
- Ce moteur compare l'entité sélectionnée aux autres
- Il applique des règles prédéfinies (seuils critique/warning)
- Il génère des insights basés sur ces comparaisons
- C'est 100% logique mathématique, PAS d'IA

### calculateScore - Calcul du score global

```javascript
export function calculateScore(snapshot) {
  const components = [
    { val: Number(snapshot.approved_mr_rate),        weight: 25, max: 1,    higherIsBetter: true  },
    { val: Number(snapshot.merged_mr_rate),          weight: 20, max: 1,    higherIsBetter: true  },
    { val: Number(snapshot.avg_review_time_hours),   weight: 15, max: 48,   higherIsBetter: false },
    { val: Number(snapshot.mr_rate_per_site),        weight: 15, max: 5,    higherIsBetter: true  },
    { val: Number(snapshot.commit_rate_per_site),    weight: 15, max: 10,   higherIsBetter: true  },
    { val: Number(snapshot.nb_commits_per_project),  weight: 8,  max: 1000, higherIsBetter: true },
  ];
  
  let totalScore = 0;
  let totalWeight = 0;
  
  for (const { val, weight, max, higherIsBetter } of components) {
    if (isNaN(val) || val == null) continue;
    const clamped = Math.min(Math.max(val, 0), max);
    const pct = higherIsBetter ? clamped / max : 1 - clamped / max;
    totalScore += pct * weight;
    totalWeight += weight;
  }
  
  return Math.round((totalScore / totalWeight) * 100);
}
```

**Explication** :
- Cette fonction calcule un score global sur 100
- Elle pondère 6 KPIs avec des poids différents
- Pour chaque KPI :
  - Elle normalise la valeur (entre 0 et 1)
  - Si higherIsBetter = true : plus c'est haut, mieux c'est
  - Si higherIsBetter = false : plus c'est bas, mieux c'est (ex: temps de revue)
- Elle retourne le score final

---

## 5. Explication du code Backend <a name="code-backend"></a>

### AnomalyDetector - Détection des anomalies

Le détecteur d'anomalies utilise des algorithmes statistiques pour identifier les valeurs aberrantes.

**Principe** :
- Il compare chaque site/équipe à la distribution globale
- Il utilise des algorithmes comme Isolation Forest ou Z-Score
- Si une valeur est significativement différente → anomalie

**Exemple de détection** :
```python
def detect_velocity_anomalies(self, snapshots):
    """
    Détecte les anomalies de vélocité (commits par développeur).
    """
    velocities = [s.commit_rate_per_site for s in snapshots]
    mean = np.mean(velocities)
    std = np.std(velocities)
    
    anomalies = []
    for snapshot in snapshots:
        z_score = (snapshot.commit_rate_per_site - mean) / std
        if abs(z_score) > 2:  # Plus de 2 écarts-types = anomalie
            anomalies.append({
                "site_id": snapshot.site_id,
                "site_name": snapshot.site_name,
                "metric": "velocity",
                "value": snapshot.commit_rate_per_site,
                "severity": "high" if abs(z_score) > 3 else "medium",
                "type": "outlier"
            })
    
    return anomalies
```

### CorrelationAnalyzer - Analyse des corrélations

L'analyseur de corrélations calcule les relations entre métriques.

**Principe** :
- Il calcule le coefficient de corrélation de Pearson entre métriques
- Si |corrélation| > 0.7 → corrélation forte
- Il génère des insights basés sur ces corrélations

**Exemple d'analyse** :
```python
def analyze_site_correlations(self, snapshots):
    """
    Analyse les corrélations entre métriques pour les sites.
    """
    insights = []
    
    # Corrélation entre vélocité et temps de revue
    velocities = [s.commit_rate_per_site for s in snapshots]
    review_times = [s.avg_review_time_hours for s in snapshots]
    corr = np.corrcoef(velocities, review_times)[0, 1]
    
    if corr > 0.7:
        insights.append(
            "Sites avec vélocité élevée ont tendance à avoir des temps de revue plus longs. "
            "Considérer d'équilibrer la charge de revue."
        )
    elif corr < -0.7:
        insights.append(
            "Sites avec vélocité élevée ont des temps de revue plus courts. "
            "Bonne pratique à reproduire."
        )
    
    return { "insights": insights, "correlations": {...} }
```

### TrendAnalyzer - Analyse des tendances

L'analyseur de tendances examine l'évolution sur plusieurs mois.

**Principe** :
- Il récupère les données sur 3 mois
- Il calcule la tendance (croissance, décroissance, stable)
- Il génère des recommandations RH basées sur les tendances

**Exemple d'analyse** :
```python
def analyze(self, site_histories):
    """
    Analyse les tendances sur plusieurs mois.
    """
    insights = []
    rh_recommendations = []
    
    for site_id, history in site_histories.items():
        if len(history) < 2:
            continue
        
        # Calculer la tendance de vélocité
        velocities = [h.commit_rate_per_site for h in history]
        if len(velocities) >= 2:
            trend = (velocities[-1] - velocities[0]) / velocities[0]
            
            if trend < -0.3:  # Baisse de plus de 30%
                rh_recommendations.append({
                    "site_id": site_id,
                    "category": "RH",
                    "message": f"Site {site_id} : vélocité en baisse de {abs(trend)*100:.0f}% sur 3 mois. "
                              "Considérer audit de charge ou formation."
                })
    
    return {
        "insights": insights,
        "rh_recommendations": rh_recommendations,
        "summary": self._generate_summary(site_histories)
    }
```

---

## 6. Exemple concret <a name="exemple-concret"></a>

### Scénario : Analyse du site Tunis

#### Données d'entrée
- Projet : ID = 1
- Période : Avril 2024
- Site : Tunis (ID = 2)
- Utilisateur : Site Manager

#### Étape 1 : Frontend appelle l'API

```javascript
// ComparativeAnalyticsPage.jsx
const data = await analyticsService.getAdminIntelligence(
  projectId = 1,
  periodId = null,  // Dernière période
  siteId = null,
  siteIds = [2]  // Site Manager ne voit que le site Tunis
);
```

#### Étape 2 : Backend routeur vérifie les permissions

```python
# intelligence.py
# L'utilisateur est site_manager
# On charge ses assignations depuis la base tenant
accessible_site_ids = [2]  # Il a accès au site Tunis
effective_site_ids = [2]

return service.get_admin_intelligence(project_id=1, period_id=null, site_ids=[2])
```

#### Étape 3 : Service récupère les snapshots

```python
# intelligence_service.py
snapshots = self._get_site_snapshots(project_id=1, period_id=null)
# Récupère tous les snapshots du projet pour la dernière période

# Filtrer par site_ids
snapshots = [s for s in snapshots if s.site_id in [2]]
# Garde seulement le site Tunis
```

#### Étape 4 : Détection des anomalies

```python
# AnomalyDetector
velocity_anomalies = self.anomaly_detector.detect_velocity_anomalies(snapshots)
# Compare la vélocité du site Tunis à la moyenne du projet

# Résultat exemple :
# - Moyenne projet : 5.0 commits/dev
# - Site Tunis : 2.5 commits/dev
# - Z-score : -2.5 (anomalie détectée)

velocity_anomalies = [
  {
    "site_id": 2,
    "site_name": "Tunis",
    "metric": "velocity",
    "value": 2.5,
    "severity": "high",
    "type": "outlier"
  }
]
```

#### Étape 5 : Analyse des corrélations

```python
# CorrelationAnalyzer
correlation_analysis = self.correlation_analyzer.analyze_site_correlations(snapshots)

# Résultat exemple :
# - Corrélation vélocité vs temps de revue : 0.8 (forte corrélation positive)
# - Insight : "Sites avec vélocité élevée ont des temps de revue plus longs"

correlation_analysis = {
  "insights": [
    "Sites avec vélocité élevée ont tendance à avoir des temps de revue plus longs. "
    "Considérer d'équilibrer la charge de revue."
  ],
  "correlations": {
    "velocity_review_time": 0.8
  }
}
```

#### Étape 6 : Analyse des tendances

```python
# TrendAnalyzer
trend_analysis = self._run_trend_analysis(project_id=1, site_ids=[2])

# Résultat exemple :
# - Vélocité sur 3 mois : [4.0, 3.2, 2.5] (en baisse)
# - Tendance : -37.5% sur 3 mois
# - Recommandation RH : "Site Tunis : vélocité en baisse de 38% sur 3 mois. 
#                       Considérer audit de charge ou formation."

trend_analysis = {
  "rh_recommendations": [
    {
      "site_id": 2,
      "category": "RH",
      "message": "Site Tunis : vélocité en baisse de 38% sur 3 mois. "
                 "Considérer audit de charge ou formation."
    }
  ],
  "summary": "Le site Tunis montre une tendance à la baisse sur les 3 derniers mois."
}
```

#### Étape 7 : Génération des recommandations

```python
# intelligence_service.py
recommendations = self._generate_recommendations(
  anomalies=velocity_anomalies,
  correlation_insights=correlation_analysis["insights"],
  trend_analysis=trend_analysis,
  site_ids=[2]
)

# Résultat :
recommendations = [
  "📉 Vélocité faible détectée sur : Tunis. "
  "Considérer : redistribution de ressources, formation, ou révision de la charge.",
  "Sites avec vélocité élevée ont tendance à avoir des temps de revue plus longs. "
  "Considérer d'équilibrer la charge de revue.",
  "[RH] Site Tunis : vélocité en baisse de 38% sur 3 mois. "
  "Considérer audit de charge ou formation."
]
```

#### Étape 8 : Calcul du score

```javascript
// insightsEngine.js
const score = calculateScore(snapshot);

// Snapshot du site Tunis :
// - approved_mr_rate: 0.65 (65%)
// - merged_mr_rate: 0.55 (55%)
// - avg_review_time_hours: 18h
// - mr_rate_per_site: 2.5
// - commit_rate_per_site: 8.0
// - nb_commits_per_project: 120

// Calcul :
// approved_mr_rate: 0.65 / 1.0 * 25 = 16.25
// merged_mr_rate: 0.55 / 1.0 * 20 = 11.00
// avg_review_time_hours: 1 - (18 / 48) * 15 = 9.38
// mr_rate_per_site: 2.5 / 5.0 * 15 = 7.50
// commit_rate_per_site: 8.0 / 10.0 * 15 = 12.00
// nb_commits_per_project: 120 / 1000 * 8 = 0.96

// Total : 57.09 / 98 * 100 = 58/100
```

#### Étape 9 : Affichage dans le Frontend

```javascript
// IntelligenceCard.jsx
<IntelligenceCard
  entityName="Tunis"
  entityType="site"
  healthScore={58}
  nPeriods={3}
  metrics={{
    velocity_trend: { values: [4.0, 3.2, 2.5], direction: "declining" },
    review_trend: { values: [15, 16, 18], direction: "improving" },
    quality_trend: { values: [0.70, 0.68, 0.65], direction: "declining" }
  }}
  alerts={[
    { severity: "high", detail: "Vélocité faible : 2.5 commits/dev (moyenne projet : 5.0)" }
  ]}
  recommendations={[
    "📉 Vélocité faible détectée sur : Tunis. Considérer redistribution de ressources.",
    "Sites avec vélocité élevée ont tendance à avoir des temps de revue plus longs.",
    "[RH] Site Tunis : vélocité en baisse de 38% sur 3 mois. Considérer audit de charge."
  ]}
  isExpanded={false}
  onToggle={() => setExpanded(!expanded)}
/>
```

#### Résultat affiché

```
┌─────────────────────────────────────────┐
│  ○ 58/100  Tunis          3 mois       │
│  ████████████░░░░░░░░░░░░░░░░░░░░░░  │
│                                         │
│  Vélocité    2.5  ↘  -38% YoY         │
│  Temps revue  18h  ↗  +20% YoY         │
│  Qualité     65%  ↘  -7% YoY          │
│                                         │
│  [Voir détails]                        │
└─────────────────────────────────────────┘

Après clic sur "Voir détails" :
┌─────────────────────────────────────────┐
│  ⚠️ Alertes                            │
│  [critique] Vélocité faible : 2.5 commits/dev │
│                                         │
│  💡 Recommandations                     │
│  📉 Vélocité faible détectée sur : Tunis. │
│     Considérer redistribution de ressources.│
│  Sites avec vélocité élevée ont tendance   │
│     à avoir des temps de revue plus longs.│
│  [RH] Site Tunis : vélocité en baisse de  │
│       38% sur 3 mois. Considérer audit.  │
└─────────────────────────────────────────┘
```

---

## Résumé

### Comment fonctionne la comparaison et recommandation ?

1. **Récupération des données** : Le système récupère les snapshots KPI de la base de données
2. **Filtrage par rôle** : Selon le rôle (super_admin, site_manager, etc.), on filtre les sites/équipes visibles
3. **Détection des anomalies** : On compare chaque entité à la moyenne du groupe pour détecter les valeurs anormales
4. **Analyse des corrélations** : On calcule les relations entre métriques (ex: vélocité vs temps de revue)
5. **Analyse des tendances** : On examine l'évolution sur plusieurs mois
6. **Génération des recommandations** : On combine anomalies, corrélations et tendances pour générer des actions suggérées
7. **Calcul du score** : On calcule un score global (0-100) basé sur 6 KPIs pondérés
8. **Affichage** : On affiche tout ça dans une carte avec score, alertes et recommandations

### Points clés

- **C'est 100% logique mathématique**, PAS d'intelligence artificielle
- **Les comparaisons sont inter-sites/inter-équipes** : on compare chaque entité aux autres
- **Les seuils sont configurables** : l'admin peut ajuster les seuils critique/warning
- **Le système est multi-périodes** : il analyse les tendances sur plusieurs mois
- **Les recommandations sont contextuelles** : basées sur les anomalies, corrélations et tendances détectées
