# Guide Détaillé de l'Extraction GitLab via l'API

## Table des Matières

1. [Vue d'Ensemble](#vue-densemble)
2. [Architecture du Client API GitLab](#architecture-du-client-api-gitlab)
3. [Processus d'Authentification](#processus-dauthentification)
4. [Mécanismes de Requête HTTP](#mécanismes-de-requête-http)
5. [Gestion des Erreurs et Retries](#gestion-des-erreurs-et-retries)
6. [Pagination Automatique](#pagination-automatique)
7. [Extraction des Commits](#extraction-des-commits)
8. [Extraction des Merge Requests](#extraction-des-merge-requests)
9. [Extraction des Commentaires](#extraction-des-commentaires)
10. [Gestion des Membres](#gestion-des-membres)
11. [Stratégie de Récupération](#stratégie-de-récupération)
12. [Intégration avec le Service d'Extraction](#intégration-avec-le-service-dextraction)

---

## Vue d'Ensemble

L'extraction des données depuis GitLab se fait à travers le **GitLab REST API v4** en utilisant un client Python asynchrone personnalisé. Le système est conçu pour être :

- **Résilient** : Gère automatiquement les erreurs réseau et les rate limits
- **Efficace** : Utilise l'async/await pour les requêtes parallèles
- **Précis** : Filtre les données localement pour éviter les instabilités de l'API
- **Observables** : Trace les métriques d'appels API et de retries

---

## Architecture du Client API GitLab

### Fichier Principal
**`dataCollection/src/backend/app/services/gitlab/gitlab_client.py`**

### Classe Principale : `GitLabClient`

```python
class GitLabClient:
    """Thin async wrapper around GitLab REST API v4."""
```

### Initialisation du Client

```python
def __init__(self, config: GitLabConfig):
    # Évite les URLs dupliquées comme .../api/v4/api/v4
    domain = config.domain.rstrip("/")
    if not domain.endswith("/api/v4"):
        self.base_url = f"{domain}/api/v4"
    else:
        self.base_url = domain
        
    token        = self._decrypt_token(config.token)
    self.headers = {"PRIVATE-TOKEN": token}
    self.timeout = 60.0
    
    # Métriques d'observabilité
    self.api_calls_count = 0
    self.retry_count     = 0
```

**Points clés :**
- L'URL de base est automatiquement normalisée pour éviter les doublons `/api/v4`
- Le token est déchiffré via AES si disponible, sinon utilisé en clair (compatibilité dev)
- Un timeout de 60 secondes est configuré pour toutes les requêtes
- Des compteurs tracking le nombre d'appels API et de retries

---

## Processus d'Authentification

### Déchiffrement du Token

```python
@staticmethod
def _decrypt_token(token: str) -> str:
    """
    Tente de déchiffrer le token (AES via security.py).
    Si decrypt_token n'est pas disponible ou échoue → utilise le token brut.
    Cela permet de faire tourner l'appli même si le chiffrement n'est pas
    encore configuré (dev local).
    """
    try:
        from app.core.security import decrypt_token
        return decrypt_token(token)
    except Exception:
        logger.warning("decrypt_token unavailable — using raw token")
        return token
```

**Fonctionnement :**
1. Tente de déchiffrer le token avec AES (via `security.py`)
2. En cas d'échec, utilise le token brut (fallback pour développement)
3. Permet de faire tourner l'application en dev sans configuration de chiffrement

### Headers d'Authentification

```python
self.headers = {"PRIVATE-TOKEN": token}
```

Le token est passé dans le header `PRIVATE-TOKEN` comme requis par l'API GitLab.

---

## Mécanismes de Requête HTTP

### Méthode `_request` - Cœur du Client

```python
async def _request(
    self,
    method:   str,
    endpoint: str,
    params:   Optional[Dict[str, Any]] = None,
    _retry:   int = 0,
    fast_fail: bool = False,
) -> Any:
    """HTTP request with retries for network, 5xx and 429 responses."""
    url = f"{self.base_url}{endpoint}"
    self.api_calls_count += 1
    
    try:
        async with httpx.AsyncClient(timeout=self.timeout) as client:
            response = await client.request(
                method=method, url=url,
                headers=self.headers, params=params,
            )
```

**Paramètres :**
- `method` : Méthode HTTP (GET, POST, etc.)
- `endpoint` : Chemin de l'endpoint GitLab (ex: `/projects/123`)
- `params` : Paramètres de query string
- `_retry` : Compteur interne de retry (usage récursif)
- `fast_fail` : Si True, ne pas attendre en cas de rate limit

**Fonctionnement :**
1. Incrémente le compteur d'appels API
2. Construit l'URL complète avec `base_url + endpoint`
3. Utilise `httpx.AsyncClient` pour la requête asynchrone
4. Applique le timeout de 60 secondes

---

## Gestion des Erreurs et Retries

### 1. Erreurs Réseau (Timeout, Connection)

```python
except (httpx.TimeoutException, httpx.ConnectError) as e:
    if _retry < 3:
        self.retry_count += 1
        wait = 2 ** _retry  # Exponentiel : 1s, 2s, 4s
        logger.warning(f"Network error on {url}, retry {_retry + 1}/3 in {wait}s: {e}")
        await asyncio.sleep(wait)
        return await self._request(method, endpoint, params, _retry + 1, fast_fail=fast_fail)
    raise GitLabAPIError(f"Network error after 3 retries on {url}: {e}") from e
```

**Stratégie :**
- Jusqu'à 3 retries avec délai exponentiel (1s, 2s, 4s)
- Loggue chaque tentative de retry
- Lève une exception après 3 échecs

### 2. Erreur 404 (Not Found)

```python
if response.status_code == 404:
    if "/projects/" in endpoint:
        raise GitLabProjectNotFoundError(f"Project or Resource not found on GitLab: {endpoint}", status_code=404)
    return None
```

**Comportement :**
- Si c'est un endpoint de projet → lève une exception spécifique
- Sinon → retourne `None` (resource optionnelle)

### 3. Rate Limiting (429)

```python
if response.status_code == 429:
    if fast_fail:
        logger.warning(f"Fast Fail triggered for {url} (Rate Limit 429). Skipping wait.")
        raise GitLabAPIError("Rate limit hit (fast fail)", status_code=429)

    retry_after = int(response.headers.get("Retry-After", 60))
    logger.warning(
        f"GitLab rate limit (429) on {url}. "
        f"Waiting {retry_after}s before retry {_retry + 1}/3..."
    )
    await asyncio.sleep(retry_after)
    if _retry < 3:
        self.retry_count += 1
        return await self._request(method, endpoint, params, _retry + 1, fast_fail=fast_fail)
    raise GitLabAPIError(f"Rate limit persistent after 3 retries on {url}")
```

**Stratégie :**
- Respecte le header `Retry-After` de GitLab (défaut 60s)
- En mode `fast_fail`, ne pas attendre (pour les résolutions d'ID)
- Jusqu'à 3 retries après attente du délai spécifié

### 4. Erreurs Serveur (5xx)

```python
if response.status_code >= 500:
    if _retry < 3:
        self.retry_count += 1
        wait = 2 ** _retry
        logger.warning(f"HTTP {response.status_code} on {url}, retry {_retry + 1}/3 in {wait}s")
        await asyncio.sleep(wait)
        return await self._request(method, endpoint, params, _retry + 1, fast_fail=fast_fail)
    raise GitLabAPIError(
        f"GitLab API error {response.status_code} on {url} after 3 retries"
    )
```

**Stratégie :**
- Retry avec délai exponentiel pour les erreurs serveur
- Jusqu'à 3 retries

### 5. Erreurs Client (4xx autres que 404, 429)

```python
if response.status_code >= 400:
    raise GitLabAPIError(
        f"GitLab API error {response.status_code} on {url}: {response.text[:200]}"
    )
```

**Comportement :**
- Lève immédiatement une exception (pas de retry)
- Inclut les 200 premiers caractères de la réponse

---

## Pagination Automatique

### Méthode `_get_paginated`

```python
async def _get_paginated(
    self,
    endpoint:  str,
    params:    Optional[Dict[str, Any]] = None,
    max_pages: Optional[int] = None,
) -> List[Dict[str, Any]]:
    """Pagination automatique — charge toutes les pages."""
    page     = 1
    per_page = 100
    results: List[Dict[str, Any]] = []

    while True:
        current_params = (params or {}).copy()
        current_params.update({"page": page, "per_page": per_page})

        data = await self._request("GET", endpoint, current_params)
        if not data:
            break

        results.extend(data)

        if len(data) < per_page:
            break  # Dernière page atteinte
        if max_pages and page >= max_pages:
            logger.warning(f"Reached max_pages={max_pages} on {endpoint} — truncating")
            break

        page += 1

    return results
```

**Fonctionnement :**
1. Commence à la page 1 avec 100 items par page
2. Ajoute `page` et `per_page` aux paramètres
3. Accumule les résultats dans `results`
4. S'arrête quand :
   - La réponse est vide
   - La page contient moins de 100 items (dernière page)
   - `max_pages` est atteint (limite de sécurité)

**Exemple d'utilisation :**
```python
# Récupère TOUTES les branches (pagination automatique)
branches = await self._get_paginated(
    f"/projects/{project_id}/repository/branches",
    params={"sort": "updated_desc"},
    max_pages=1  # Limite à 1 page pour les branches
)
```

---

## Extraction des Commits

### Méthode `get_project_commits`

```python
async def get_project_commits(
    self,
    project_id: int,
    ref_name:   Optional[str] = None,
    since:      Optional[str] = None,
    until:      Optional[str] = None,
    author:     Optional[str] = None,
    with_stats: bool = False,
) -> List[Dict[str, Any]]:
    """Fetch commits from one branch or from all branches."""
    params: Dict[str, Any] = {"with_stats": with_stats}
    
    # Si aucune branche n'est spécifiée, demande à GitLab TOUTES les branches
    if not ref_name:
        params["all"] = True
    else:
        params["ref_name"] = ref_name
    
    if author:
        params["author"] = author
    if since:
        params["since"] = since
    if until:
        params["until"] = until
        
    logger.info(f"Project {project_id} — Fetching commits with params: {params}")
    
    try:
        commits = await self._get_paginated(
            f"/projects/{project_id}/repository/commits", params=params
        )
        logger.info(f"Project {project_id} — Extracted {len(commits)} commits natively.")
        return commits
    except GitLabProjectNotFoundError:
        raise  # Propage l'erreur pour indiquer que le projet source est manquant
    except GitLabAPIError as e:
        logger.error(f"Error fetching commits for project={project_id}: {e}")
        return []
```

**Paramètres :**
- `project_id` : ID du projet GitLab
- `ref_name` : Nom de la branche (optionnel, `all=True` si absent)
- `since` : Date de début (format ISO 8601)
- `until` : Date de fin (format ISO 8601)
- `author` : Filtre par auteur (email ou username)
- `with_stats` : Inclure les statistiques de fichiers modifiés

**Stratégie Clé :**
- `ref_name=None` → `params["all"] = True` → Récupère les commits de TOUTES les branches
- Le filtrage par auteur est fait localement (pas via l'API) pour éviter les instabilités

### Méthode `get_commit_detail`

```python
async def get_commit_detail(
    self,
    project_id: int,
    sha: str
) -> Optional[Dict[str, Any]]:
    """Fetch the details of a single commit, including stats."""
    try:
        return await self._request("GET", f"/projects/{project_id}/repository/commits/{sha}")
    except Exception as e:
        logger.error(f"Error fetching commit {sha} for project={project_id}: {e}")
        return None
```

**Utilisation :**
- Récupère les détails complets d'un commit spécifique
- Inclut les statistiques (fichiers ajoutés/modifiés/supprimés)
- Utilisé après identification des commits cibles

---

## Extraction des Merge Requests

### Méthode `get_project_merge_requests`

```python
async def get_project_merge_requests(
    self, 
    project_id:       int, 
    author_username:   Optional[str] = None,
    reviewer_username: Optional[str] = None,
    assignee_username: Optional[str] = None,
    author_id:         Optional[int] = None,
    reviewer_id:       Optional[int] = None,
    assignee_id:       Optional[int] = None,
    created_after:     Optional[str] = None,
    created_before:    Optional[str] = None,
    updated_after:     Optional[str] = None,
    updated_before:    Optional[str] = None,
) -> List[Dict[str, Any]]:
    params: Dict[str, Any] = {"state": "all", "per_page": 100}
    
    # Filtres par username/ID
    if author_username:
        params["author_username"] = author_username
    if reviewer_username:
        params["reviewer_username"] = reviewer_username
    if assignee_username:
        params["assignee_username"] = assignee_username
    if author_id:
        params["author_id"] = author_id
    if reviewer_id:
        params["reviewer_id"] = reviewer_id
    if assignee_id:
        params["assignee_id"] = assignee_id
    
    # Filtres temporels
    if created_after:
        params["created_after"] = created_after
    if created_before:
        params["created_before"] = created_before
    if updated_after:
        params["updated_after"] = updated_after
    if updated_before:
        params["updated_before"] = updated_before

    return await self._get_paginated(
        f"/projects/{project_id}/merge_requests",
        params=params,
    )
```

**Paramètres :**
- Filtres par rôle : `author`, `reviewer`, `assignee` (username ou ID)
- Filtres temporels : `created_after`, `created_before`, `updated_after`, `updated_before`
- `state="all"` : Inclut les MRs ouverts, fermés et mergés

### Méthodes de Détail MR

```python
async def get_merge_request_detail(
    self, project_id: int, mr_iid: int
) -> Optional[Dict[str, Any]]:
    """Fetch full details of a single MR (includes commits_count, user_notes_count)."""
    return await self._request(
        "GET",
        f"/projects/{project_id}/merge_requests/{mr_iid}"
    )

async def get_merge_request_commits(
    self, project_id: int, mr_iid: int
) -> List[Dict[str, Any]]:
    """Fetch the list of commits for an MR (to get accurate count)."""
    return await self._get_paginated(
        f"/projects/{project_id}/merge_requests/{mr_iid}/commits",
        params={"per_page": 100}
    )
```

**Utilisation :**
- `get_merge_request_detail` : Métadonnées complètes du MR
- `get_merge_request_commits` : Liste des commits inclus dans le MR

### Approbations et Événements

```python
async def get_merge_request_approvals(
    self, project_id: int, mr_iid: int
) -> Optional[Dict[str, Any]]:
    """Récupère les approbations du MR."""
    try:
        return await self._request(
            "GET",
            f"/projects/{project_id}/merge_requests/{mr_iid}/approvals",
        )
    except GitLabAPIError as e:
        logger.warning(f"Approvals unavailable MR={mr_iid}: {e}")
        return None

async def get_merge_request_approval_state(
    self, project_id: int, mr_iid: int
) -> Optional[Dict[str, Any]]:
    """Récupère l'état d'approbation du MR."""
    try:
        return await self._request(
            "GET",
            f"/projects/{project_id}/merge_requests/{mr_iid}/approval_state",
        )
    except GitLabAPIError as e:
        logger.warning(f"approval_state unavailable MR={mr_iid}: {e}")
        return None

async def get_merge_request_resource_state_events(
    self, project_id: int, mr_iid: int
) -> List[Dict[str, Any]]:
    """
    Fetch resource state events pour obtenir les timestamps exacts d'approbation.
    Fournit la date approved_at précise pour le calcul du temps de revue.
    """
    try:
        return await self._get_paginated(
            f"/projects/{project_id}/merge_requests/{mr_iid}/resource_state_events",
            params={"per_page": 100}
        )
    except GitLabAPIError as e:
        logger.warning(f"resource_state_events unavailable MR={mr_iid}: {e}")
        return []
```

**Utilisation :**
- `approvals` : Liste des approbateurs et leur état
- `approval_state` : État global d'approbation
- `resource_state_events` : Historique des changements d'état (pour les timestamps précis)

---

## Extraction des Commentaires

### Méthode `get_merge_request_notes`

```python
async def get_merge_request_notes(
    self, project_id: int, mr_iid: int
) -> List[Dict[str, Any]]:
    """Fetch all notes (comments) for an MR, triées par date croissante."""
    return await self._get_paginated(
        f"/projects/{project_id}/merge_requests/{mr_iid}/notes",
        params={"sort": "asc", "per_page": 100}
    )
```

**Paramètres :**
- `sort="asc"` : Tri chronologique (plus ancien en premier)
- Pagination automatique pour tous les commentaires

---

## Gestion des Membres

### Méthode `get_project_members`

```python
async def get_project_members(self, project_id: int) -> List[Dict[str, Any]]:
    """Récupère tous les membres du projet."""
    return await self._get_paginated(f"/projects/{project_id}/members/all")
```

**Note :** `/members/all` inclut les membres indirects (via groupes), pas seulement les membres directs.

### Méthode `get_user`

```python
async def get_user(self, user_id: int, fast_fail: bool = False) -> Optional[Dict[str, Any]]:
    """Récupère les détails d'un utilisateur par son ID."""
    return await self._request("GET", f"/users/{user_id}", fast_fail=fast_fail)
```

**Paramètre `fast_fail` :**
- Si True, ne pas retry en cas de rate limit (pour les résolutions d'ID en masse)

### Méthode `get_user_by_username`

```python
async def get_user_by_username(self, username: str) -> Optional[Dict[str, Any]]:
    """Cherche un utilisateur par son username (login)."""
    users = await self._request("GET", "/users", params={"username": username})
    if users and isinstance(users, list) and len(users) > 0:
        return users[0]
    return None
```

**Utilisation :**
- Recherche d'utilisateur par username
- Retourne le premier résultat

### Méthode `get_project_members_with_emails`

```python
async def get_project_members_with_emails(
    self, 
    project_id: int, 
    target_user_ids: Optional[List[int]] = None
) -> Dict[int, Dict[str, Any]]:
    """Preload members and enrich them with user details."""
    # Si target_user_ids est fourni, évite de charger la liste globale
    if target_user_ids:
        logger.info(f"Project {project_id} — Direct fetch for {len(target_user_ids)} target developers (skipping global member list).")
        members_to_fetch = [{"id": uid} for uid in target_user_ids]
    else:
        members_to_fetch = await self.get_project_members(project_id)
    
    members_map: Dict[int, Dict[str, Any]] = {}

    batch_size = 10
    for i in range(0, len(members_to_fetch), batch_size):
        batch   = members_to_fetch[i:i + batch_size]
        tasks   = [self.get_user(m["id"], fast_fail=True) for m in batch if m.get("id")]
        results = await asyncio.gather(*tasks, return_exceptions=True)

        for member, user_data in zip(batch, results):
            if isinstance(user_data, dict) and user_data.get("id"):
                members_map[user_data["id"]] = user_data
            elif "id" in member:
                members_map[member["id"]] = member

    logger.info(
        f"Project {project_id} — pre-loaded {len(members_map)} members with emails"
    )
    return members_map
```

**Optimisation :**
- Si `target_user_ids` est fourni, fetch direct des utilisateurs ciblés (évite la liste globale)
- Traitement par batch de 10 utilisateurs
- `asyncio.gather` pour les requêtes parallèles
- `fast_fail=True` pour éviter les attentes en cas de rate limit
- Construit un mapping `user_id → user_data` pour un accès rapide

---

## Stratégie de Récupération

### Fichier : `gitlab_fetch_strategy.py`

### Fonction `fetch_unique_commits`

```python
async def fetch_unique_commits(
    client:            GitLabClient,
    gitlab_project_id: int,
    since:             Optional[str],
    until:             Optional[str],
) -> List[dict]:
    """
    [SENIOR] Récupère TOUS les commits du projet sur la période.
    On ne filtre pas par auteur au niveau API GitLab car c'est instable
    (pseudo vs email). On filtre en local pour une précision 100%.
    """
    logger.info(f"[DIAGNOSTIC API] Fetching ALL commits for project={gitlab_project_id} | {since} -> {until}")
    
    commits = await client.get_project_commits(
        project_id=gitlab_project_id,
        ref_name=None,          # triggers all=True
        since=since,
        until=until,
        with_stats=False,
    )
    
    logger.info(f"[DIAGNOSTIC API] Found {len(commits)} raw commits to analyze")
    return commits
```

**Stratégie Clé :**
- Récupère TOUS les commits du projet (toutes branches)
- Ne filtre PAS par auteur au niveau API (instable : pseudo vs email)
- Le filtrage par auteur est fait localement pour une précision 100%

**Pourquoi cette approche ?**
1. **Instabilité de l'API GitLab** : Le filtrage par auteur peut être imprécis (username vs email)
2. **Flexibilité** : Permet de ré-analyser les commits avec différents critères
3. **Complétude** : Garantit de ne manquer aucun commit pertinent

---

## Intégration avec le Service d'Extraction

### Flux Complet d'Extraction

```python
# Dans extraction_service.py - _extract_commits()

# 1. Construction de la fenêtre temporelle
since, until, lot_start, lot_end = build_period_window(lot.period)

# 2. Récupération des commits bruts (toutes branches, tous auteurs)
unique_commits = await fetch_unique_commits(
    client=client,
    gitlab_project_id=project.gitlab_project_id,
    since=since,
    until=until,
)

# 3. Filtrage local pour chaque commit
for commit_data in unique_commits:
    sha = commit_data.get("id")
    
    # Déduplication par SHA
    if not sha or self.commit_repo.get_by_sha(db, sha, project.id):
        skipped += 1
        continue

    # Filtre temporel chirurgical
    if not is_in_period(commit_data.get("authored_date"), lot_start, lot_end):
        filtered_out_period += 1
        skipped += 1
        continue

    # Filtre par développeur cible (local)
    if not self._matches_target_devs(gitlab_id, author_name, author_email, target_devs_map):
        filtered_out_dev += 1
        skipped += 1
        continue

    # Vérification de mission chirurgicale (quotidienne)
    if not is_project_contribution_certified(db, developer.id, project.id, commit_date, prefetched_missions):
        filtered_out_dev += 1
        skipped += 1
        continue

    # Fetch des détails du commit
    detailed_commit = await client.get_commit_detail(project.gitlab_project_id, commit_data["id"])
    if detailed_commit:
        commit_data = detailed_commit

    # Mapping et insertion en base
    mapped = GitLabMapper.map_commit(
        data=commit_data,
        project_id=project.id,
        developer_id=developer.id,
        extraction_lot_id=lot.id,
    )
    self.commit_repo.create(db, mapped)
    created += 1
```

### Points Clés de l'Intégration

1. **Fenêtre Temporelle**
   - `since` / `until` : Format ISO pour l'API GitLab
   - `lot_start` / `lot_end` : Datetime pour le filtrage local

2. **Récupération Brute**
   - `fetch_unique_commits()` : Tous les commits, toutes branches
   - Pagination automatique via `_get_paginated()`

3. **Filtrage Local**
   - Déduplication par SHA
   - Filtre temporel précis
   - Filtre par développeur cible
   - Vérification de mission quotidienne

4. **Enrichissement**
   - `get_commit_detail()` : Statistiques de fichiers
   - `GitLabMapper.map_commit()` : Transformation vers le modèle de données

5. **Persistance**
   - Insertion via `CommitRepository`
   - Traçabilité via `extraction_lot_id`

---

## Résumé des Endpoints GitLab Utilisés

### Projets
- `GET /projects/{id}` : Détails du projet
- `GET /projects/{id}/events` : Événements du projet
- `GET /projects/{id}/repository/branches` : Branches du projet

### Commits
- `GET /projects/{id}/repository/commits` : Liste des commits
- `GET /projects/{id}/repository/commits/{sha}` : Détails d'un commit

### Merge Requests
- `GET /projects/{id}/merge_requests` : Liste des MRs
- `GET /projects/{id}/merge_requests/{iid}` : Détails d'un MR
- `GET /projects/{id}/merge_requests/{iid}/commits` : Commits d'un MR
- `GET /projects/{id}/merge_requests/{iid}/approvals` : Approbations
- `GET /projects/{id}/merge_requests/{iid}/approval_state` : État d'approbation
- `GET /projects/{id}/merge_requests/{iid}/resource_state_events` : Événements d'état
- `GET /projects/{id}/merge_requests/{iid}/notes` : Commentaires

### Utilisateurs
- `GET /users` : Recherche d'utilisateurs
- `GET /users/{id}` : Détails d'un utilisateur
- `GET /projects/{id}/members/all` : Membres du projet

---

## Bonnes Pratiques

### 1. Gestion des Rate Limits
- Respecter le header `Retry-After`
- Utiliser `fast_fail=True` pour les opérations non critiques
- Limiter les requêtes parallèles via le batch size

### 2. Pagination
- Toujours utiliser `_get_paginated()` pour les listes
- Spécifier `max_pages` pour les endpoints potentiellement volumineux
- Accumuler les résultats avant de retourner

### 3. Filtrage
- Préférer le filtrage local au filtrage API (plus précis)
- Utiliser `all=True` pour les commits (toutes branches)
- Appliquer les filtres temporels en local (plus granulaire)

### 4. Observabilité
- Logger les paramètres de requête
- Tracker les métriques (`api_calls_count`, `retry_count`)
- Logger les erreurs avec contexte

### 5. Résilience
- Retries exponentiels pour les erreurs réseau
- Gestion spécifique des 404, 429, 5xx
- Fallback pour le déchiffrement de token

---

## Conclusion

Le système d'extraction GitLab est conçu pour être :

- **Robuste** : Gère automatiquement les erreurs et rate limits
- **Précis** : Filtre localement pour éviter les instabilités API
- **Efficace** : Utilise l'async/await et la pagination automatique
- **Observables** : Trace les métriques pour le monitoring
- **Flexible** : Permet de ré-analyser les données avec différents critères

L'approche de récupérer TOUTES les données brutes puis de filtrer localement garantit une précision maximale et une flexibilité pour les analyses futures.
