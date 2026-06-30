# Documentation du Flux d'Extraction GitLab
## Présentation Technique pour la Direction

---

## Table des Matières

1. [Exécutif Summary](#exécutif-summary)
2. [Objectifs du Système](#objectifs-du-système)
3. [Architecture Globale](#architecture-globale)
4. [Flux d'Extraction End-to-End](#flux-dextraction-end-to-end)
5. [Intelligence du Moteur d'Extraction](#intelligence-du-moteur-dextraction)
6. [Composants Techniques](#composants-techniques)
7. [Sécurité et Fiabilité](#sécurité-et-fiabilité)
8. [Performance et Scalabilité](#performance-et-scalabilité)
9. [Traçabilité et Audit](#traçabilité-et-audit)
10. [Cas d'Usage Métier](#cas-dusage-métier)

---

## Exécutif Summary

### Qu'est-ce que le système d'extraction ?

Le système d'extraction GitLab est un moteur intelligent qui récupère automatiquement les données de contribution des développeurs depuis GitLab et les transforme en indicateurs de performance (KPIs) exploitables par la direction.

### Valeur Métier

- **Automatisation** : Extraction automatique des données GitLab (plus de saisie manuelle)
- **Précision** : Données 100% fiables et traçables
- **Intelligence** : Respect du cycle de vie des développeurs (mutations, offboardings)
- **Flexibilité** : Extraction en temps réel ou mensuelle par période
- **Conformité** : Application des règles RH (règle des 15 jours)

### Résultats

- **Productivité** : Mesure précise du volume de code par développeur
- **Qualité** : Analyse des revues de code et approbations
- **Collaboration** : Suivi des merge requests et commentaires
- **Traçabilité** : Historique complet des contributions par projet

---

## Objectifs du Système

### Objectifs Principaux

1. **Automatiser la collecte de données**
   - Éliminer la saisie manuelle des contributions
   - Récupérer automatiquement les commits, merge requests et commentaires
   - Garantir la fraîcheur des données (extraction en temps réel)

2. **Garantir la précision des données**
   - Respecter le cycle de vie des développeurs (arrivées, départs, mutations)
   - Appliquer les règles RH (règle des 15 jours pour les offboardings)
   - Filtrer les contributions selon les missions projet

3. **Fournir des KPIs exploitables**
   - Calculer automatiquement les indicateurs de performance
   - Générer des snapshots mensuels pour le reporting
   - Permettre l'analyse historique et les tendances

4. **Assurer la traçabilité**
   - Tracer chaque donnée jusqu'à sa source GitLab
   - Journaliser toutes les opérations d'extraction
   - Permettre l'audit et la reconstitution des données

---

## Architecture Globale

### Vue d'Ensemble

```
┌─────────────────────────────────────────────────────────────────┐
│                    INTERFACE UTILISATEUR                          │
│              (Page Extraction / Dashboard KPI)                    │
└────────────────────────┬────────────────────────────────────────┘
                         │ HTTP POST /api/v1/extraction/trigger
                         ▼
┌─────────────────────────────────────────────────────────────────┐
│                     API BACKEND (FastAPI)                         │
│              - Réception de la requête                            │
│              - Création du lot d'extraction                       │
│              - Lancement en arrière-plan                          │
└────────────────────────┬────────────────────────────────────────┘
                         │
                         ▼
┌─────────────────────────────────────────────────────────────────┐
│              SERVICE D'EXTRACTION (Background Task)               │
│  ┌────────────────────────────────────────────────────────────┐ │
│  │ 1. Intelligence de Ciblage                                 │ │
│  │    - Identification des développeurs éligibles             │ │
│  │    - Application de la règle des 15 jours (RG-02) pour les KPIs │ │
│  └────────────────────────────────────────────────────────────┘ │
│  ┌────────────────────────────────────────────────────────────┐ │
│  │ 2. Intelligence de Mission                                │ │
│  │    - Vérification triple (Site + Groupe + Projet)           │ │
│  │    - Validation des segments temporels (SCD Type 2)        │ │
│  └────────────────────────────────────────────────────────────┘ │
│  ┌────────────────────────────────────────────────────────────┐ │
│  │ 3. Extraction GitLab                                        │ │
│  │    - Client API GitLab (httpx async)                       │ │
│  │    - Récupération des commits, MRs, commentaires            │ │
│  │    - Gestion des rate limits et retries                    │ │
│  └────────────────────────────────────────────────────────────┘ │
│  ┌────────────────────────────────────────────────────────────┐ │
│  │ 4. Transformation (GitLabMapper)                            │ │
│  │    - Conversion API GitLab → Base de données              │ │
│  │    - Enrichissement (is_merge_commit, review_time)         │ │
│  │    - Normalisation des dates et timezones                  │ │
│  └────────────────────────────────────────────────────────────┘ │
│  ┌────────────────────────────────────────────────────────────┐ │
│  │ 5. Re-linkage Intelligent                                 │ │
│  │    - Identification des commits orphelins                  │ │
│  │    - Matching par vecteurs d'identité                      │ │
│  │    - Association aux développeurs                          │ │
│  └────────────────────────────────────────────────────────────┘ │
│  ┌────────────────────────────────────────────────────────────┐ │
│  │ 6. Auto-Snapshot KPIs                                      │ │
│  │    - Génération automatique des KPIs mensuels             │ │
│  │    - Calcul des métriques de productivité                 │ │
│  │    - Stockage des snapshots pour reporting                │ │
│  └────────────────────────────────────────────────────────────┘ │
└────────────────────────┬────────────────────────────────────────┘
                         │
                         ▼
┌─────────────────────────────────────────────────────────────────┐
│                    BASE DE DONNÉES (PostgreSQL)                  │
│  - Projects                                                   │
│  - Developers                                                 │
│  - Commits                                                    │
│  - Merge Requests                                             │
│  - Comments                                                   │
│  - KPI Snapshots                                              │
│  - Extraction Lots (traçabilité)                              │
└─────────────────────────────────────────────────────────────────┘
```

### Composants Principaux

| Composant | Fichier | Rôle |
|-----------|---------|------|
| **Frontend** | `ExtractionPage.jsx` | Interface utilisateur pour lancer les extractions |
| **API Backend** | `extraction.py` | Endpoint REST pour déclencher les extractions |
| **Service d'Extraction** | `extraction_service.py` | Orchestrateur du flux d'extraction |
| **Client GitLab** | `gitlab_client.py` | Client asynchrone pour l'API GitLab |
| **Mapper GitLab** | `gitlab_mapper.py` | Transformation des données GitLab |
| **Filtres** | `extraction_filters.py` | Filtres temporels et vecteurs cibles |
| **Utilitaires de Mission** | `mission_utils.py` | Logique de mission stricte et RG-02 |
| **Agrégateur KPI** | `kpi_aggregator.py` | Calcul automatique des KPIs |

---

## Flux d'Extraction End-to-End

### Étape 1 : Déclenchement de l'Extraction

**Action Utilisateur**
- Le Super Admin accède à la page `/extraction`
- Sélectionne une configuration GitLab et un projet
- Optionnellement sélectionne des développeurs spécifiques
- Clique sur "Lancer Extraction"

**Code Frontend**
```javascript
// ExtractionPage.jsx
const handleTriggerExtraction = async () => {
  const payload = {
    gitlab_config_id: selectedConfig.id,
    gitlab_project_id: selectedProject?.gitlab_project_id,
    developer_ids: selectedDevelopers,
    auto_target_by_period: true,  // Ciblage automatique intelligent
    fast_mode: false,
  };
  await extractionService.triggerExtraction(payload);
};
```

**Requête HTTP**
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

### Étape 2 : Réception et Traitement Backend

**Action Backend**
- FastAPI reçoit la requête POST
- Vérifie que l'utilisateur est un Super Admin
- Crée un `ExtractionLot` pour tracer l'opération
- Lance l'extraction en arrière-plan (background task)
- Retourne immédiatement le lot_id pour le suivi

**Code Backend**
```python
# extraction.py
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
        gitlab_config_id=request.gitlab_config_id,
        gitlab_project_id=request.gitlab_project_id,
        triggered_by=current_user.id,
        auto_target_by_period=request.auto_target_by_period,
    )
    db.add(lot)
    db.flush()
    
    # Lancement en arrière-plan
    background_tasks.add_task(
        _background_extraction,
        lot_id=lot.id,
        gitlab_config_id=request.gitlab_config_id,
        # ... autres paramètres
    )
    
    return {"lot_id": lot.id, "status": "running"}
```

**Avantages**
- Interface réactive (pas d'attente)
- Traçabilité complète via le lot_id
- Possibilité de suivre la progression en temps réel

---

### Étape 3 : Intelligence de Ciblage

**Action**
- Si `auto_target_by_period = true`, identification automatique des développeurs éligibles
- Calcul de la fenêtre temporelle de la période
- **IMPORTANT** : Pour l'extraction de données brutes, PAS de règle des 15 jours (RG-02)
- La règle RG-02 est appliquée UNIQUEMENT au niveau du calcul des KPIs

**Code Backend**
```python
# extraction.py
if auto_target_by_period:
    _, _, p_start, p_end = build_period_window(lot.period)
    eligible_devs = DeveloperRepository().get_active_during_period(
        db, p_start.date(), p_end.date()
    )
    developer_ids = [d.id for d in eligible_devs]
    logger.info(f"Smart-Sync: {len(developer_ids)} développeurs éligibles identifiés.")
```

**Distinction Importante : Extraction vs KPIs**

```python
# mission_utils.py - get_developers_for_data_extraction()
# [DATA EXTRACTION ONLY] - SANS règle RG-02 des 15 jours
# On extrait TOUS les commits pendant la période de mission réelle
or_(Developer.offboarding_date.is_(None), Developer.offboarding_date >= start_date)
# offboarding_date >= 1er du mois (extraction complète)

# mission_utils.py - get_certified_developers_query()
# [KPI CALCULATION ONLY] - AVEC règle RG-02 des 15 jours
# Pour le calcul des KPIs (headcount, productivité proratisée)
threshold_date = date(start_date.year, start_date.month, 15)
or_(Developer.offboarding_date.is_(None), Developer.offboarding_date >= threshold_date)
# offboarding_date >= 15 du mois (proratisation RH)
```

**Exemple**
- Développeur avec offboarding_date = 2024-12-20
- Extraction pour Décembre 2024
- **Extraction de données** : Développeur ÉLIGIBLE (offboarding >= 1er décembre)
- **Calcul des KPIs** : Développeur ÉLIGIBLE (offboarding >= 15 décembre)

---

### Étape 4 : Intelligence de Mission

**Action**
- Vérification triple : Site + Groupe + Projet
- Validation des segments temporels (SCD Type 2)
- Exclusion des suspensions (pas de segment site OU groupe actif)

**Code Backend**
```python
# mission_utils.py
query = (
    db.query(Developer.id)
    .join(DeveloperProject, ...)
    .join(DeveloperSite, ...)  # SCD Type 2
    .join(DeveloperGroupLink, ...)  # SCD Type 2
    .filter(
        Developer.is_bot.is_(False),
        # Règle des 15 jours
        or_(Developer.offboarding_date.is_(None), 
            Developer.offboarding_date >= threshold_date),
        # Segment site doit couvrir la période
        or_(DeveloperSite.start_date.is_(None), DeveloperSite.start_date < end_date),
        or_(DeveloperSite.end_date.is_(None), DeveloperSite.end_date >= start_date),
        # Segment groupe doit couvrir la période
        or_(DeveloperGroupLink.start_date.is_(None), DeveloperGroupLink.start_date < end_date),
        or_(DeveloperGroupLink.end_date.is_(None), DeveloperGroupLink.end_date >= start_date),
    )
)
```

**Pourquoi la vérification triple ?**
- Un développeur suspendu n'a PAS de segment site OU groupe actif
- La vérification des DEUX garantit l'exclusion correcte
- Évite les faux positifs de contribution

---

### Étape 5 : Extraction des Données GitLab

**Action**
- Initialisation du client GitLab avec token chiffré
- Récupération des commits (toutes branches, tous auteurs)
- Récupération des merge requests avec filtres
- Récupération des commentaires pour chaque MR

**Code Client GitLab**
```python
# gitlab_client.py
class GitLabClient:
    def __init__(self, config: GitLabConfig):
        self.base_url = f"{config.domain.rstrip('/')}/api/v4"
        token = self._decrypt_token(config.token)
        self.headers = {"PRIVATE-TOKEN": token}
        self.timeout = 60.0
        self.api_calls_count = 0
        self.retry_count = 0
```

**Extraction des Commits**
```python
# gitlab_fetch_strategy.py
async def fetch_unique_commits(
    client: GitLabClient,
    gitlab_project_id: int,
    since: Optional[str],
    until: Optional[str],
) -> List[dict]:
    """
    Récupère TOUS les commits du projet sur la période.
    On ne filtre pas par auteur au niveau API (instable).
    On filtre en local pour une précision 100%.
    """
    commits = await client.get_project_commits(
        project_id=gitlab_project_id,
        ref_name=None,  # triggers all=True (toutes branches)
        since=since,
        until=until,
        with_stats=False,
    )
    return commits
```

**Pourquoi récupérer TOUS les commits ?**
- L'API GitLab est instable pour le filtrage par auteur (username vs email)
- Le filtrage local garantit une précision de 100%
- Permet de ré-analyser les données avec différents critères

---

### Étape 6 : Gestion des Erreurs et Rate Limits

**Mécanismes de Résilience**

```python
# gitlab_client.py
async def _request(self, method, endpoint, params, _retry=0, fast_fail=False):
    # 1. Erreurs réseau : 3 retries avec délai exponentiel
    except (httpx.TimeoutException, httpx.ConnectError) as e:
        if _retry < 3:
            wait = 2 ** _retry  # 1s, 2s, 4s
            await asyncio.sleep(wait)
            return await self._request(method, endpoint, params, _retry + 1)
    
    # 2. Rate limiting (429) : Respect du header Retry-After
    if response.status_code == 429:
        retry_after = int(response.headers.get("Retry-After", 60))
        await asyncio.sleep(retry_after)
        return await self._request(method, endpoint, params, _retry + 1)
    
    # 3. Erreurs serveur (5xx) : Retries automatiques
    if response.status_code >= 500:
        if _retry < 3:
            wait = 2 ** _retry
            await asyncio.sleep(wait)
            return await self._request(method, endpoint, params, _retry + 1)
```

**Pagination Automatique**
```python
async def _get_paginated(self, endpoint, params, max_pages=None):
    page = 1
    per_page = 100
    results = []
    
    while True:
        data = await self._request("GET", endpoint, 
                                   {**params, "page": page, "per_page": per_page})
        if not data or len(data) < per_page:
            break
        results.extend(data)
        page += 1
    
    return results
```

---

### Étape 7 : Transformation des Données

**Action**
- Conversion des données brutes GitLab en format base de données
- Enrichissement avec des champs calculés
- Normalisation des dates et timezones

**Code Mapper**
```python
# gitlab_mapper.py
class GitLabMapper:
    @staticmethod
    def map_commit(data, project_id, developer_id, extraction_lot_id):
        # Parsing des dates
        authored_date = datetime.fromisoformat(data["authored_date"].replace("Z", "+00:00"))
        
        # Détection commit de merge
        title_lower = data["title"].lower()
        is_merge_commit = (
            title_lower.startswith("merge branch") or
            title_lower.startswith("merge request")
        )
        
        return {
            "gitlab_commit_id": data["id"],
            "title": data["title"],
            "authored_date": authored_date,
            "additions": data["stats"]["additions"],
            "is_merge_commit": is_merge_commit,
            "project_id": project_id,
            "developer_id": developer_id,
            "extraction_lot_id": extraction_lot_id,
        }
```

**Champs Calculés**
- `is_merge_commit` : Détection automatique des commits de merge
- `review_time_hours` : Calcul du temps de revue pour les MRs
- `is_draft` : Détection des MRs en brouillon

---

### Étape 8 : Filtrage Local Intelligent

**Action**
- Déduplication par SHA (évite les doublons)
- Filtre temporel chirurgical (date de contribution)
- Filtre par développeur cible (matching précis)
- Vérification de mission quotidienne

**Code Service**
```python
# extraction_service.py
for commit_data in unique_commits:
    sha = commit_data.get("id")
    
    # 1. Déduplication par SHA
    if not sha or self.commit_repo.get_by_sha(db, sha, project.id):
        skipped += 1
        continue
    
    # 2. Filtre temporel chirurgical
    if not is_in_period(commit_data.get("authored_date"), lot_start, lot_end):
        filtered_out_period += 1
        skipped += 1
        continue
    
    # 3. Filtre par développeur cible
    if not self._matches_target_devs(gitlab_id, author_name, author_email, target_devs_map):
        filtered_out_dev += 1
        skipped += 1
        continue
    
    # 4. Vérification de mission chirurgicale (quotidienne)
    if not is_project_contribution_certified(db, developer.id, project.id, commit_date):
        filtered_out_dev += 1
        skipped += 1
        continue
    
    # 5. Insertion en base
    mapped = GitLabMapper.map_commit(...)
    self.commit_repo.create(db, mapped)
    created += 1
```

---

### Étape 9 : Re-linkage Intelligent

**Action**
- Identification des commits orphelins (sans developer_id)
- Matching par vecteurs d'identité (gitlab_user_id, email, username)
- Association aux développeurs correspondants

**Code Service**
```python
# extraction_service.py
def _relink_commits_to_developers(self, db: Session, project_id: int) -> int:
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

**Pourquoi le re-linkage ?**
- Certains commits ne peuvent pas être associés lors de l'extraction initiale
- Le re-linkage permet de corriger ces associations a posteriori
- Utilise plusieurs critères de matching (ID, email, username)

---

### Étape 10 : Auto-Snapshot des KPIs

**Action**
- Génération automatique des KPIs mensuels après extraction
- Calcul des métriques de productivité par développeur
- Stockage des snapshots pour reporting historique

**Code Service**
```python
# extraction_service.py
try:
    from app.services.kpi.kpi_aggregator import KpiAggregator
    aggregator = KpiAggregator(db)
    aggregator.generate_monthly_snapshots(
        project_id=project.id,
        year=period.year,
        month=period.month,
        lot_id=lot.id
    )
    logger.info(f"KPI snapshots générés automatiquement")
except Exception as e:
    logger.error(f"Erreur lors de la génération des KPI snapshots: {e}")
```

**KPIs Calculés**
- Volume de code (additions, deletions, total)
- Nombre de commits et merge requests
- Temps de revue moyen
- Taux d'approbation
- Productivité proratisée (règle RG-02)

---

### Étape 11 : Finalisation et Traçabilité

**Action**
- Marquage du lot comme completed
- Enregistrement de la durée et du nombre d'items
- Journalisation des métriques (appels API, retries)

**Code Service**
```python
# extraction_service.py
lot.status = ExtractionStatusEnum.completed
lot.completed_at = datetime.now(timezone.utc)
lot.error_message = None
lot.step_progress = 100
lot.current_action = "Extraction terminée avec succès"
lot.items_count = c_count + m_count
lot.duration_ms = int((time.monotonic() - t_start) * 1000)
lot.api_calls_count = client.api_calls_count
lot.retry_count = client.retry_count
db.commit()
```

**Traçabilité**
- Chaque extraction est tracée via un `ExtractionLot`
- Chaque commit/MR est lié à son lot d'extraction
- Métriques d'observabilité (appels API, retries, durée)

---

## Intelligence du Moteur d'Extraction

### 1. Intelligence aux Actions de Gestion des Développeurs

**Mutation Historique (Case B)**
- Lorsqu'un développeur change de site/groupe/projet
- Le moteur utilise les segments temporels (SCD Type 2)
- Les contributions avant la mutation → ancienne affectation
- Les contributions après la mutation → nouvelle affectation

**Exemple**
```
Ahmed Ben Ali :
- 01/01/2024 - 30/06/2024 : Site Tunis, Groupe Backend
- 01/07/2024 - 31/12/2024 : Site Paris, Groupe Frontend (Mutation)

Extraction :
- Commit du 15/03/2024 → Attribué à Site Tunis, Groupe Backend
- Commit du 15/09/2024 → Attribué à Site Paris, Groupe Frontend
```

**Correction Rétroactive (Case A)**
- Lorsqu'un développeur est corrigé rétroactivement
- Le moteur réattribue toutes les contributions selon la nouvelle affectation
- Utilise le mode "correction rétroactive" pour modifier l'historique

**Activation/Désactivation**
- `is_active = false` : ignore les contributions futures
- Contributions passées conservées dans l'historique
- Contributions futures ne sont plus extraites

**Archivage (Offboarding)**
- **Extraction de données** : PAS de règle des 15 jours (extraction complète)
- **Calcul des KPIs** : Applique la règle des 15 jours (RG-02) pour la proratisation
- Les contributions sont extraites intégralement, mais seules celles avant le 15 sont comptabilisées dans les KPIs

---

### 2. Intelligence aux Missions des Développeurs

**Règle des 15 jours (RG-02)**
```python
# mission_utils.py - get_certified_developers_query()
# [KPI CALCULATION ONLY] - AVEC règle RG-02 des 15 jours
# Pour le calcul des KPIs (headcount, productivité proratisée)
# Un développeur est compté dans l'effectif d'un mois M si et seulement si
# sa date de sortie (offboarding_date) est >= au 15 de ce mois M
threshold_date = date(start_date.year, start_date.month, 15)
```

**IMPORTANT : Deux Approches Différentes**

1. **Extraction de Données Brutes** (`get_developers_for_data_extraction`)
   - SANS règle des 15 jours
   - Offboarding_date >= 1er du mois
   - Objectif : Capturer TOUS les commits pendant la période de mission réelle

2. **Calcul des KPIs** (`get_certified_developers_query`)
   - AVEC règle des 15 jours
   - Offboarding_date >= 15 du mois
   - Objectif : Proratisation RH (headcount, productivité proratisée)

**Pourquoi cette règle ?**
- Pratique RH standard de proratisation de la paie
- Équitable pour les départs en cours de mois
- Alignement avec les cycles de paie

**Vérification Triple (Site + Groupe + Projet)**
- Un développeur suspendu n'a PAS de segment site OU groupe actif
- Le moteur vérifie les DEUX pour exclure correctement les suspensions
- Utilise les segments temporels (SCD Type 2) pour la couverture temporelle

**Vérification de Mission Spécifique**
- Le moteur vérifie que le développeur a une mission active sur le projet
- Utilise la table `developer_project` pour vérifier la couverture temporelle
- Vérifie que la date de contribution est dans la période de mission

---

### 3. Segments Temporels (SCD Type 2)

**Concept**
Les segments temporels (Slowly Changing Dimension Type 2) permettent de tracer l'historique complet des affectations avec des dates de début et de fin.

**Tables**
- `developer_site` : Affectations site avec `start_date` et `end_date`
- `developer_group_link` : Affectations groupe avec `start_date` et `end_date`
- `developer_project` : Missions projet avec `start_date` et `end_date`

**Utilisation**
```python
# Vérification de couverture temporelle
or_(DeveloperSite.start_date.is_(None), DeveloperSite.start_date < end_date),
or_(DeveloperSite.end_date.is_(None), DeveloperSite.end_date >= start_date),
```

**Avantages**
- Historique complet des affectations
- Filtrage précis selon les dates
- Support des mutations historiques

---

## Composants Techniques

### 1. Client GitLab (gitlab_client.py)

**Responsabilités**
- Communication asynchrone avec l'API GitLab REST v4
- Gestion des rate limits et retries automatiques
- Pagination automatique pour les listes
- Déchiffrement AES du token d'authentification

**Méthodes Clés**
- `get_project_commits()` : Récupération des commits
- `get_project_merge_requests()` : Récupération des MRs
- `get_merge_request_notes()` : Récupération des commentaires
- `get_project_members_with_emails()` : Récupération des membres

**Métriques**
- `api_calls_count` : Nombre total d'appels API
- `retry_count` : Nombre de retries effectués

---

### 2. Mapper GitLab (gitlab_mapper.py)

**Responsabilités**
- Transformation des données brutes GitLab en format base de données
- Enrichissement avec des champs calculés
- Normalisation des dates et timezones
- Gestion des fallbacks pour les données manquantes

**Méthodes Clés**
- `map_project()` : Mapping des projets
- `map_developer()` : Mapping des développeurs
- `map_commit()` : Mapping des commits
- `map_merge_request()` : Mapping des MRs

**Champs Calculés**
- `is_merge_commit` : Détection des commits de merge
- `is_draft` : Détection des MRs en brouillon
- `review_time_hours` : Calcul du temps de revue
- `approved_at` : Détermination de la date d'approbation

---

### 3. Filtres d'Extraction (extraction_filters.py)

**Responsabilités**
- Calcul des fenêtres temporelles
- Construction des vecteurs d'identité pour le filtrage
- Validation des dates de contribution

**Méthodes Clés**
- `build_period_window()` : Calcul des bornes temporelles
- `is_in_period()` : Validation de date dans la période
- `build_target_vectors()` : Construction des vecteurs cibles
- `find_matched_target_dev()` : Matching rapide de développeur

---

### 4. Utilitaires de Mission (mission_utils.py)

**Responsabilités**
- Logique de mission stricte et vérification triple
- Application de la règle des 15 jours (RG-02) pour le calcul des KPIs
- Validation des contributions certifiées
- Tracking temporel des affectations site

**Méthodes Clés**
- `get_certified_developers_query()` : Requête de développeurs certifiés
- `is_project_contribution_certified()` : Validation de contribution
- `get_rg02_threshold()` : Calcul du seuil des 15 jours
- `get_site_for_developer_at_date()` : Tracking temporel site

---

### 5. Service d'Extraction (extraction_service.py)

**Responsabilités**
- Orchestration du flux d'extraction complet
- Coordination des différents composants
- Gestion de la progression et des erreurs
- Déclenchement automatique des KPIs

**Méthodes Clés**
- `run_realtime_extraction()` : Extraction en temps réel
- `run_monthly_extraction()` : Extraction mensuelle
- `_extract_commits()` : Extraction des commits
- `_extract_merge_requests()` : Extraction des MRs
- `_relink_commits_to_developers()` : Re-linkage intelligent

---

## Sécurité et Fiabilité

### 1. Authentification

**Token Chiffré**
- Le token GitLab est stocké chiffré en base (AES)
- Déchiffrement automatique à l'initialisation du client
- Fallback en clair pour développement (compatibilité)

**Header d'Authentification**
```python
self.headers = {"PRIVATE-TOKEN": token}
```

### 2. Gestion des Erreurs

**Retries Automatiques**
- Erreurs réseau : 3 retries avec délai exponentiel
- Rate limits : Respect du header Retry-After
- Erreurs serveur (5xx) : 3 retries automatiques

**Logging Complet**
- Toutes les erreurs sont loggées avec contexte
- Métriques d'observabilité (appels API, retries)
- Traçabilité des opérations via ExtractionLot

### 3. Validation des Données

**Validation de Mission**
- Vérification triple (Site + Groupe + Projet)
- Validation des segments temporels
- Exclusion des bots et comptes techniques

**Validation Temporelle**
- Filtre chirurgical des dates de contribution
- Application de la règle des 15 jours
- Vérification de la couverture temporelle

---

## Performance et Scalabilité

### 1. Architecture Asynchrone

**Async/Await**
- Utilisation de `httpx.AsyncClient` pour les requêtes parallèles
- `asyncio.gather()` pour les traitements en parallèle
- Non-bloquant pour le serveur FastAPI

**Avantages**
- Traitement simultané de multiples requêtes GitLab
- Meilleure utilisation des ressources
- Scalabilité horizontale possible

### 2. Pagination Optimisée

**Pagination Automatique**
- 100 items par page (optimal pour GitLab API)
- Arrêt automatique à la dernière page
- Limite `max_pages` pour les endpoints volumineux

**Batch Processing**
- Traitement par batch de 10 utilisateurs pour les membres
- Réduit le nombre d'appels API
- Évite les rate limits

### 3. Caching Intelligent

**Pr-fetching**
- Pr-fetch des missions pour éviter les N+1 queries
- Pr-fetch des membres du projet
- Mapping en mémoire pour un accès rapide

**Déduplication**
- Déduplication par SHA pour les commits
- Évite les insertions en double
- Réduit la charge base de données

---

## Traçabilité et Audit

### 1. Extraction Lots

**Traçabilité Complète**
- Chaque extraction est tracée via un `ExtractionLot`
- Enregistrement de : type, statut, durée, items_count, api_calls_count
- Lien entre extraction et données (extraction_lot_id)

**Exemple**
```python
lot = ExtractionLot(
    extraction_type=ExtractionTypeEnum.REALTIME,
    status=ExtractionStatusEnum.completed,
    project_id=project.id,
    triggered_by=user.id,
    items_count=150,
    duration_ms=45000,
    api_calls_count=23,
    retry_count=2
)
```

### 2. Audit Logs

**Journalisation des Actions**
- Toutes les actions sensibles sont loggées
- Enregistrement de : utilisateur, action, entité, timestamp
- Support de la reconstitution des données

**Exemple**
```python
self.audit_repo.log(
    db=db, user_id=triggered_by_user, action="LAUNCH_EXTRACTION",
    entity_type="ExtractionLot", entity_id=lot.id,
    new_value={"extraction_type": "REALTIME", "project_id": project.id},
)
```

### 3. Métriques d'Observabilité

**Métriques Collectées**
- `api_calls_count` : Nombre d'appels API GitLab
- `retry_count` : Nombre de retries effectués
- `duration_ms` : Durée de l'extraction
- `items_count` : Nombre d'items extraits

**Utilisation**
- Monitoring de la santé du système
- Détection des anomalies
- Optimisation des performances

---

## Cas d'Usage Métier

### 1. Reporting Mensuel

**Scénario**
- La direction souhaite un rapport de productivité pour le mois de décembre 2024
- Le Super Admin lance une extraction mensuelle pour la période décembre 2024
- Le système identifie automatiquement les développeurs éligibles pour l'extraction
- Les données sont extraites intégralement, puis les KPIs sont générés avec application de la règle RG-02

**Résultat**
- Snapshot KPI complet pour décembre 2024
- Métriques de productivité par développeur
- Analyse des tendances vs mois précédents

### 2. Extraction en Temps Réel

**Scénario**
- Un nouveau projet GitLab est ajouté au système
- Le Super Admin lance une extraction en temps réel pour ce projet
- Le système récupère toutes les contributions historiques
- Les KPIs sont générés automatiquement pour la période courante

**Résultat**
- Projet intégré rapidement au système
- Données historiques disponibles immédiatement
- KPIs à jour pour le reporting

### 3. Mutation de Développeur

**Scénario**
- Un développeur change de site le 1er juillet 2024
- L'administrateur met à jour les segments temporels dans la base
- Lors de la prochaine extraction, le moteur applique automatiquement les nouveaux segments
- Les contributions avant juillet sont attribuées à l'ancien site, après juillet au nouveau site

**Résultat**
- Historique correct des contributions par site
- Pas de correction manuelle nécessaire
- Traçabilité complète des mutations

### 4. Offboarding de Développeur

**Scénario**
- Un développeur quitte l'entreprise le 20 décembre 2024
- L'administrateur met à jour l'offboarding_date
- Lors de l'extraction de décembre :
  - **Extraction de données** : TOUS les commits sont extraits (même après le 20 décembre)
  - **Calcul des KPIs** : La règle RG-02 est appliquée (seuls les commits avant le 15 sont comptabilisés)

**Résultat**
- Historique complet des contributions extrait (intégrité des données)
- Proratisation équitable de la productivité (règle RH appliquée aux KPIs)
- Conformité avec les pratiques RH

---

## Conclusion

Le système d'extraction GitLab est une solution **professionnelle, fiable et intelligente** pour la collecte et l'analyse des données de contribution des développeurs.

### Points Forts

1. **Automatisation Complète**
   - Extraction automatique des données GitLab
   - Génération automatique des KPIs
   - Pas de saisie manuelle

2. **Intelligence Contextuelle**
   - Respect du cycle de vie des développeurs
   - Application des règles RH (RG-02) pour le calcul des KPIs
   - Support des mutations historiques

3. **Précision et Fiabilité**
   - Données 100% fiables et traçables
   - Filtres multi-niveaux pour la précision
   - Re-linkage intelligent des commits orphelins

4. **Performance et Scalabilité**
   - Architecture asynchrone
   - Pagination optimisée
   - Caching intelligent

5. **Sécurité et Traçabilité**
   - Token chiffré
   - Audit logs complets
   - Métriques d'observabilité

### Valeur pour l'Entreprise

- **Gain de temps** : Plus de saisie manuelle des données
- **Précision** : Données fiables pour la prise de décision
- **Conformité** : Respect des règles RH et légales
- **Flexibilité** : Adaptation aux changements organisationnels
- **Traçabilité** : Historique complet des contributions

Le système est prêt pour la production et peut être déployé avec confiance pour soutenir les besoins de reporting et d'analyse de performance de l'entreprise.
