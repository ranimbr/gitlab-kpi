# Flux Technique - Moteur d'Extraction GitLab

## Vue d'Ensemble du Moteur d'Extraction

```
Page : /extraction (ExtractionPage.jsx)
    ↓
Super Admin lance une extraction
    ↓
Frontend : extractionService.triggerExtraction()
    ↓
HTTP POST /api/v1/extraction/trigger
    ↓
Backend : api/routers/extraction.py (endpoint trigger_extraction)
    ↓
Backend : services/extraction/extraction_service.py (run_realtime_extraction)
    ↓
Backend : utils/mission_utils.py (get_certified_developers_for_mission)
    ↓
Backend : services/extraction/extraction_filters.py (build_period_window, build_target_vectors)
    ↓
Backend : services/gitlab/gitlab_client.py (fetch commits, MRs, comments)
    ↓
Backend : repositories/commit_repository.py (INSERT commits)
    ↓
Backend : repositories/merge_request_repository.py (INSERT merge_requests)
    ↓
Backend : repositories/comment_repository.py (INSERT comments)
    ↓
Backend : services/extraction/extraction_service.py (_relink_commits_to_developers)
    ↓
Backend : services/kpi/kpi_aggregator.py (generate_monthly_snapshots)
    ↓
Base de données PostgreSQL (INSERT commits, MRs, comments, kpi_snapshots)
```

---

## Intelligence du Moteur d'Extraction

### 1. Intelligence aux Actions de Gestion des Développeurs

Le moteur d'extraction est **intelligent** aux actions de gestion des développeurs dans la page Admin :

**A. Mutation Historique (Case B)**
- Lorsqu'un développeur change de site/groupe/projet via une mutation historique
- Le moteur d'extraction utilise les segments temporels (SCD Type 2)
- Il filtre les contributions selon la date d'effet de la mutation
- Les contributions avant la mutation sont attribuées à l'ancienne affectation
- Les contributions après la mutation sont attribuées à la nouvelle affectation

**B. Correction Rétroactive (Case A)**
- Lorsqu'un développeur est corrigé rétroactivement
- Le moteur d'extraction réattribue toutes les contributions selon la nouvelle affectation
- Il utilise le mode "correction rétroactive" pour modifier l'historique

**C. Activation/Désactivation**
- Lorsqu'un développeur est désactivé (`is_active = false`)
- Le moteur d'extraction ignore ses contributions futures
- Les contributions passées sont conservées dans l'historique
- Les contributions futures ne sont plus extraites

**D. Archivage (Offboarding)**
- Lorsqu'un développeur est archivé avec une date de sortie
- Le moteur d'extraction applique la **Règle des 15 jours (RG-02)**
- Les contributions avant le 15 du mois sont comptabilisées
- Les contributions après le 15 du mois sont ignorées

---

### 2. Intelligence aux Missions des Développeurs

Le moteur d'extraction utilise une logique de **mission stricte** pour filtrer les contributions :

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

## ÉTAPE 1 : Frontend - Lancement de l'Extraction

**Fichier** : `dataCollection/src/frontend/src/pages/ExtractionPage.jsx`

**Chemin complet** : `c:\Users\ranim\Downloads\gitlab-kpi-dashboard-versionaprescorrectionMAIimportant\dataCollection\src\frontend\src\pages\ExtractionPage.jsx`

### Code Frontend (Ligne 1-50)
```javascript
const handleTriggerExtraction = async () => {
  try {
    const payload = {
      gitlab_config_id: selectedConfig.id,
      gitlab_project_id: selectedProject?.gitlab_project_id,
      developer_ids: selectedDevelopers,
      auto_target_by_period: true,  // ← Intelligence : ciblage automatique par période
      fast_mode: false,
    };
    
    await extractionService.triggerExtraction(payload);
    toast.success("Extraction lancée avec succès !");
  } catch (err) {
    toast.error(err.response?.data?.detail || "Erreur lors du lancement de l'extraction");
  }
};
```

### Ce qui se passe
- Vous sélectionnez une configuration GitLab et un projet
- Vous pouvez sélectionner des développeurs spécifiques OU utiliser le ciblage automatique
- Le frontend appelle `extractionService.triggerExtraction(payload)`

---

## ÉTAPE 2 : Frontend - Appel API

**Fichier** : `dataCollection/src/frontend/src/services/extractionService.js`

### Code Frontend
```javascript
triggerExtraction: (payload) => api.post("/extraction/trigger", payload).then(r => r.data),
```

### Requête HTTP envoyée
```
POST /api/v1/extraction/trigger
Content-Type: application/json

{
  "gitlab_config_id": 1,
  "gitlab_project_id": 1234,
  "developer_ids": null,  // null = ciblage automatique
  "auto_target_by_period": true,
  "fast_mode": false
}
```

---

## ÉTAPE 3 : Backend - Réception de la Requête

**Fichier** : `dataCollection/src/backend/app/api/routers/extraction.py`

**Chemin complet** : `c:\Users\ranim\Downloads\gitlab-kpi-dashboard-versionaprescorrectionMAIimportant\dataCollection\src\backend\app\api\routers\extraction.py`

### Code Backend (Ligne 150-200)
```python
@router.post("/trigger")
def trigger_extraction(
    request: ExtractionLotCreate,
    background_tasks: BackgroundTasks,
    db: Session = Depends(get_db),
    current_user: AppUser = Depends(get_current_admin),
):
    lot = ExtractionLot(
        extraction_type=ExtractionTypeEnum.SCHEDULED,
        status=ExtractionStatusEnum.running,
        period_id=request.period_id,
        gitlab_config_id=request.gitlab_config_id,
        gitlab_project_id=request.gitlab_project_id,
        triggered_by=current_user.id,
        developer_ids=request.developer_ids,
        auto_target_by_period=request.auto_target_by_period,
        fast_mode=request.fast_mode,
    )
    db.add(lot)
    db.flush()
    
    # Lancement en arrière-plan
    background_tasks.add_task(
        _background_extraction,
        lot_id=lot.id,
        gitlab_config_id=request.gitlab_config_id,
        triggered_by_user=current_user.id,
        gitlab_project_id=request.gitlab_project_id,
        developer_ids=request.developer_ids,
        fast_mode=request.fast_mode,
        auto_target_by_period=request.auto_target_by_period,
    )
    
    return {"lot_id": lot.id, "status": "running"}
```

### Ce qui se passe
- FastAPI reçoit la requête POST
- Il crée un `ExtractionLot` pour tracer l'extraction
- Il lance l'extraction en arrière-plan via `background_tasks.add_task()`
- Il retourne immédiatement le lot_id pour le suivi

---

## ÉTAPE 4 : Backend - Background Task - Intelligence de Ciblage

**Fichier** : `dataCollection/src/backend/app/api/routers/extraction.py`

### Code Backend (Ligne 78-85)
```python
# ✅ INTELLIGENCE SYSTÈME (SENIOR) : Ciblage automatique par période (Sync RH)
if auto_target_by_period:
    _, _, p_start, p_end = build_period_window(lot.period)
    eligible_devs = DeveloperRepository().get_active_during_period(
        db, p_start.date(), p_end.date()
    )
    developer_ids = [d.id for d in eligible_devs]
    logger.info(f"[lot={lot_id}] Smart-Sync: {len(developer_ids)} développeurs éligibles identifiés.")
```

### Ce qui se passe
- Si `auto_target_by_period = true`, le moteur identifie automatiquement les développeurs éligibles
- Il utilise `build_period_window()` pour calculer la fenêtre temporelle de la période
- Il utilise `get_active_during_period()` pour trouver les développeurs actifs dans cette période
- Il applique la **Règle des 15 jours (RG-02)** pour les offboardings

---

## ÉTAPE 5 : Backend - Intelligence de Mission

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
    
    # [STRICT TEMPORAL SCOPE] La mission spécifique au projet doit couvrir la période
    query = query.filter(
        or_(DeveloperProject.start_date.is_(None), DeveloperProject.start_date < end_date),
        or_(DeveloperProject.end_date.is_(None), DeveloperProject.end_date >= start_date)
    )
    return query
```

### Ce qui se passe
- Le moteur construit une requête SQL complexe pour identifier les développeurs certifiés
- Il vérifie la **triple condition** : Site + Groupe + Projet
- Il applique la **Règle des 15 jours (RG-02)** pour les offboardings
- Il utilise les segments temporels (SCD Type 2) pour vérifier la couverture temporelle

**En base de données** :
```sql
SELECT DISTINCT developer.id
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
  AND (developer_project.end_date IS NULL OR developer_project.end_date >= '2024-12-01');
```

---

## ÉTAPE 6 : Backend - Filtres Temporels

**Fichier** : `dataCollection/src/backend/app/services/extraction/extraction_filters.py`

**Chemin complet** : `c:\Users\ranim\Downloads\gitlab-kpi-dashboard-versionaprescorrectionMAIimportant\dataCollection\src\backend\app\services\extraction\extraction_filters.py`

### Code Backend (Ligne 12-35)
```python
def build_period_window(period: Optional[Period]) -> Tuple[Optional[str], Optional[str], Optional[datetime], Optional[datetime]]:
    """Return API date bounds and strict datetime bounds for a period."""
    if not period:
        return None, None, None, None

    year, month = period.year, period.month
    since = f"{year}-{month:02d}-01T00:00:00Z"
    last_day = calendar.monthrange(year, month)[1]
    until = f"{year}-{month:02d}-{last_day:02d}T23:59:59Z"
    start = datetime(year, month, 1, tzinfo=timezone.utc)
    end = datetime(year, month, last_day, 23, 59, 59, 999999, tzinfo=timezone.utc)
    return since, until, start, end


def is_in_period(dt_str: Optional[str], start: Optional[datetime], end: Optional[datetime]) -> bool:
    """Return True when datetime string is inside strict bounds."""
    if not start or not end or not dt_str:
        return True
    try:
        dt = datetime.fromisoformat(dt_str.replace("Z", "+00:00"))
        return start <= dt <= end
    except Exception:
        return True
```

### Ce qui se passe
- Le moteur calcule la fenêtre temporelle de la période
- Il retourne les bornes pour l'API GitLab (`since`, `until`)
- Il retourne les bornes strictes pour le filtrage (`start`, `end`)
- Il filtre les contributions selon ces bornes

---

## ÉTAPE 7 : Backend - Construction des Vecteurs Cibles

**Fichier** : `dataCollection/src/backend/app/services/extraction/extraction_filters.py`

### Code Backend (Ligne 79-100)
```python
def build_target_vectors(author_data: dict, target_devs_map: Dict[int, Developer], scoped: bool) -> Tuple[List[int], List[str], List[str], List[str]]:
    """Build identity vectors used to filter MR commits and notes."""
    target_ids, target_names, target_emails, target_unames = [], [], [], []

    if scoped and target_devs_map:
        for dev in target_devs_map.values():
            if dev.gitlab_user_id:
                target_ids.append(dev.gitlab_user_id)
            if dev.name:
                target_names.append(dev.name)
            if dev.email:
                target_emails.append(dev.email)
            if dev.gitlab_username:
                target_unames.append(dev.gitlab_username)
    else:
        if author_data.get("id"):
            target_ids.append(author_data.get("id"))
        if author_data.get("name"):
            target_names.append(author_data.get("name"))
        if author_data.get("email"):
            target_emails.append(author_data.get("email"))
        if author_data.get("username"):
            target_unames.append(author_data.get("username"))
    
    return target_ids, target_names, target_emails, target_unames
```

### Ce qui se passe
- Le moteur construit des vecteurs d'identité pour filtrer les contributions
- Si `scoped = true`, il utilise les développeurs cibles de la mission
- Il extrait : gitlab_user_id, name, email, gitlab_username
- Ces vecteurs sont utilisés pour filtrer les commits et MRs

---

## ÉTAPE 8 : Backend - Extraction des Données GitLab

**Fichier** : `dataCollection/src/backend/app/services/extraction/extraction_service.py`

### Code Backend (Ligne 160-168)
```python
self._update_lot_progress(db, lot, 20, "Extraction des Commits et Merge Requests...")
counts = await self._extract_data(db, project, lot, client, developer_ids=eligible_dev_ids)
logger.info(
    f"[DIAGNOSTIC] Extraction REALTIME lancée pour projet={project.gitlab_project_id}"
)
c_count, m_count = counts if counts else (0, 0)

self._update_lot_progress(db, lot, 70, "Réconciliation des auteurs (re-linkage)...")
relinked = self._relink_commits_to_developers(db, project.id)
if relinked > 0:
    logger.info(
        self._log_context(
            project_id=project.id,
            lot_id=lot.id,
            phase="realtime_relink",
            relinked_commits=relinked,
        )
    )
```

### Ce qui se passe
- Le moteur extrait les commits et MRs depuis GitLab
- Il utilise les vecteurs cibles pour filtrer les contributions
- Il effectue un re-linkage des commits aux développeurs
- Il met à jour la progression du lot pour le suivi UI

---

## ÉTAPE 9 : Backend - Re-linkage des Commits

**Fichier** : `dataCollection/src/backend/app/services/extraction/extraction_service.py`

### Code Backend (Méthode _relink_commits_to_developers)
```python
def _relink_commits_to_developers(self, db: Session, project_id: int) -> int:
    """
    [SENIOR] Re-linkage intelligent des commits orphelins aux développeurs.
    Utilise les vecteurs d'identité pour matcher les commits sans developer_id.
    """
    from app.services.extraction.developer_identity import resolve_developer
    
    orphan_commits = db.query(Commit).filter(
        Commit.project_id == project_id,
        Commit.developer_id.is_(None)
    ).all()
    
    relinked = 0
    for commit in orphan_commits:
        author_data = {
            "id": commit.gitlab_author_id,
            "name": commit.gitlab_author_name,
            "email": commit.gitlab_author_email,
            "username": commit.gitlab_author_username,
        }
        
        developer = resolve_developer(db, author_data, project_id=project_id)
        if developer:
            commit.developer_id = developer.id
            relinked += 1
    
    db.commit()
    return relinked
```

### Ce qui se passe
- Le moteur identifie les commits orphelins (sans developer_id)
- Il utilise les vecteurs d'identité pour matcher les développeurs
- Il re-link les commits aux développeurs correspondants
- Il retourne le nombre de commits re-linkés

---

## ÉTAPE 10 : Backend - Auto-Snapshot des KPIs

**Fichier** : `dataCollection/src/backend/app/services/extraction/extraction_service.py`

### Code Backend (Ligne 191-199)
```python
# 🚀 [SENIOR AUTO-SNAPSHOT] Déclenchement automatique des KPIs
try:
    from app.services.kpi.kpi_aggregator import KpiAggregator
    aggregator = KpiAggregator(db)
    aggregator.generate_monthly_snapshots(
        project_id=project.id,
        year=period.year,
        month=period.month,
        lot_id=lot.id
    )
    logger.info(f"[lot={lot.id}] KPI snapshots générés automatiquement")
except Exception as e:
    logger.error(f"[lot={lot.id}] Erreur lors de la génération des KPI snapshots: {e}")
```

### Ce qui se passe
- Le moteur déclenche automatiquement la génération des KPIs
- Il utilise `KpiAggregator` pour générer les snapshots mensuels
- Il lie les snapshots au lot d'extraction pour traçabilité
- Il logue les erreurs si la génération échoue

---

## ÉTAPE 11 : Backend - Finalisation du Lot

**Fichier** : `dataCollection/src/backend/app/services/extraction/extraction_service.py`

### Code Backend (Ligne 182-189)
```python
lot.status        = ExtractionStatusEnum.completed
lot.completed_at  = datetime.now(timezone.utc)
lot.error_message = None
lot.step_progress = 100
lot.current_action = "Extraction terminée avec succès"
lot.items_count   = c_count + m_count
lot.duration_ms   = int((time.monotonic() - t_start) * 1000)
db.commit()
```

### Ce qui se passe
- Le moteur marque le lot comme completed
- Il enregistre la durée de l'extraction
- Il enregistre le nombre d'items extraits
- Il valide le commit en base

**En base de données** :
```sql
UPDATE extraction_lot
SET status = 'completed',
    completed_at = NOW(),
    step_progress = 100,
    current_action = 'Extraction terminée avec succès',
    items_count = 150,
    duration_ms = 45000
WHERE id = 1;
```

---

## Résumé Chronologique du Flux d'Extraction

| Étape | Couche | Fichier | Action | Résultat |
|-------|-------|--------|--------|----------|
| 1 | Frontend | `ExtractionPage.jsx` | Clic "Lancer Extraction" | Appel `triggerExtraction()` |
| 2 | Frontend | `extractionService.js` | Appel API | Envoi POST `/extraction/trigger` |
| 3 | Backend | `extraction.py` | Réception POST | Crée `ExtractionLot` + background task |
| 4 | Backend | `extraction.py` | Intelligence ciblage | `auto_target_by_period` |
| 5 | Backend | `mission_utils.py` | Intelligence mission | `get_certified_developers_query()` |
| 6 | Backend | `extraction_filters.py` | Filtres temporels | `build_period_window()` |
| 7 | Backend | `extraction_filters.py` | Vecteurs cibles | `build_target_vectors()` |
| 8 | Backend | `extraction_service.py` | Extraction GitLab | `_extract_data()` |
| 9 | Backend | `extraction_service.py` | Re-linkage commits | `_relink_commits_to_developers()` |
| 10 | Backend | `extraction_service.py` | Auto-snapshot KPIs | `generate_monthly_snapshots()` |
| 11 | Backend | `extraction_service.py` | Finalisation lot | UPDATE `extraction_lot` |
| 12 | Frontend | `ExtractionPage.jsx` | Rafraîchissement UI | Affichage progression |

---

## Points Clés de l'Intelligence du Moteur d'Extraction

### 1. Ciblage Automatique par Période (Smart-Sync)

- Le moteur identifie automatiquement les développeurs éligibles selon la période
- Il utilise `get_active_during_period()` pour trouver les développeurs actifs
- Il applique la **Règle des 15 jours (RG-02)** pour les offboardings

### 2. Vérification Triple (Site + Groupe + Projet)

- Le moteur vérifie les trois dimensions de la mission
- Un développeur suspendu n'a PAS de segment site OU groupe actif
- Il utilise les segments temporels (SCD Type 2) pour vérifier la couverture

### 3. Règle des 15 jours (RG-02)

- Un développeur est compté dans l'effectif d'un mois M si et seulement si
- Sa date de sortie (offboarding_date) est >= au 15 de ce mois M
- Cette règle s'inspire de la pratique RH standard de proratisation de la paie

### 4. Segments Temporels (SCD Type 2)

- Le moteur utilise les segments temporels pour gérer les mutations historiques
- Il vérifie la couverture temporelle des affectations
- Il permet de tracer l'historique complet des affectations

### 5. Re-linkage Intelligent des Commits

- Le moteur identifie les commits orphelins (sans developer_id)
- Il utilise les vecteurs d'identité pour matcher les développeurs
- Il re-link les commits aux développeurs correspondants

### 6. Auto-Snapshot des KPIs

- Le moteur déclenche automatiquement la génération des KPIs
- Il utilise `KpiAggregator` pour générer les snapshots mensuels
- Il lie les snapshots au lot d'extraction pour traçabilité

---

## Relation avec les Actions de Gestion des Développeurs

### Mutation Historique (Case B)

**Impact sur l'extraction** :
- Le moteur utilise les segments temporels pour filtrer les contributions
- Les contributions avant la mutation sont attribuées à l'ancienne affectation
- Les contributions après la mutation sont attribuées à la nouvelle affectation

**Exemple** :
```
Ahmed Ben Ali :
- 01/01/2024 - 30/06/2024 : Site Tunis, Groupe Backend
- 01/07/2024 - 31/12/2024 : Site Paris, Groupe Frontend (Mutation)

Extraction :
- Commit du 15/03/2024 → Attribué à Site Tunis, Groupe Backend
- Commit du 15/09/2024 → Attribué à Site Paris, Groupe Frontend
```

### Correction Rétroactive (Case A)

**Impact sur l'extraction** :
- Le moteur réattribue toutes les contributions selon la nouvelle affectation
- Il utilise le mode "correction rétroactive" pour modifier l'historique

**Exemple** :
```
Ahmed Ben Ali :
- Correction rétroactive : Site Tunis → Site Paris (pour toute la période)

Extraction :
- Tous les commits de 2024 → Réattribués à Site Paris
```

### Activation/Désactivation

**Impact sur l'extraction** :
- Le moteur ignore les contributions des développeurs désactivés
- Les contributions passées sont conservées dans l'historique
- Les contributions futures ne sont plus extraites

**Exemple** :
```
Ahmed Ben Ali :
- Désactivé le 15/09/2024

Extraction :
- Commits avant 15/09/2024 → Conservés
- Commits après 15/09/2024 → Ignorés
```

### Archivage (Offboarding)

**Impact sur l'extraction** :
- Le moteur applique la **Règle des 15 jours (RG-02)**
- Les contributions avant le 15 du mois sont comptabilisées
- Les contributions après le 15 du mois sont ignorées

**Exemple** :
```
Ahmed Ben Ali :
- Offboarding date = 2024-12-20

Extraction pour Décembre 2024 :
- Commits avant 15/12/2024 → Comptabilisés
- Commits après 15/12/2024 → Ignorés (RG-02)
```

---

## Conclusion

Le moteur d'extraction est **intelligent** et **contextuel** :

1. **Intelligence aux actions de gestion** : Il réagit aux mutations, corrections, activations/désactivations et archivages
2. **Intelligence aux missions** : Il vérifie la triple condition Site + Groupe + Projet
3. **Règle des 15 jours (RG-02)** : Il applique la règle RH standard pour les offboardings
4. **Segments temporels (SCD Type 2)** : Il utilise les segments pour gérer l'historique des affectations
5. **Re-linkage intelligent** : Il re-link les commits orphelins aux développeurs
6. **Auto-snapshot KPIs** : Il génère automatiquement les KPIs après extraction

Cette architecture permet une extraction **précise**, **traçable** et **contextuelle** des contributions GitLab.
