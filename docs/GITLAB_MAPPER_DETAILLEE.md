# Guide Détaillé du GitLab Mapper

## Table des Matières

1. [Vue d'Ensemble](#vue-densemble)
2. [Architecture du GitLabMapper](#architecture-du-gitlabmapper)
3. [Mapping des Projets](#mapping-des-projets)
4. [Mapping des Développeurs](#mapping-des-développeurs)
5. [Mapping des Commits](#mapping-des-commits)
6. [Mapping des Merge Requests](#mapping-des-merge-requests)
7. [Stratégies de Mapping](#stratégies-de-mapping)
8. [Gestion des Dates et Timezones](#gestion-des-dates-et-timezones)
9. [Fallbacks et Valeurs par Défaut](#fallbacks-et-valeurs-par-défaut)
10. [Intégration avec le Service d'Extraction](#intégration-avec-le-service-dextraction)

---

## Vue d'Ensemble

Le **GitLabMapper** est une classe utilitaire statique qui transforme les données brutes de l'API GitLab en format compatible avec les modèles de base de données de l'application. Il agit comme une couche d'adaptation entre :

- **API GitLab** : Format JSON brut de l'API REST v4
- **Base de données** : Modèles SQLAlchemy (Project, Developer, Commit, MergeRequest)

### Fichier Principal
**`dataCollection/src/backend/app/services/gitlab/gitlab_mapper.py`**

### Classe Principale

```python
class GitLabMapper:
    """Classe statique de mapping GitLab → Base de données"""
```

---

## Architecture du GitLabMapper

### Principe de Conception

Le mapper suit ces principes :

1. **Transformation Unidirectionnelle** : GitLab API → Base de données
2. **Méthodes Statiques** : Pas d'état, pas besoin d'instanciation
3. **Validation Minimale** : Fait confiance à l'API GitLab
4. **Fallbacks Robustes** : Gère les champs manquants avec des valeurs par défaut
5. **Enrichissement** : Ajoute des champs calculés (ex: is_merge_commit, review_time_hours)

### Structure des Méthodes

Chaque méthode de mapping suit ce pattern :

```python
@staticmethod
def map_<entity>(
    data: Dict[str, Any],
    # Paramètres contextuels
    project_id: int,
    developer_id: Optional[int] = None,
    extraction_lot_id: Optional[int] = None,
) -> Dict[str, Any]:
    """
    Transforme les données GitLab en format base de données.
    """
    # 1. Parsing des dates
    # 2. Calcul des champs dérivés
    # 3. Construction du dictionnaire de mapping
    return mapped_dict
```

---

## Mapping des Projets

### Méthode `map_project`

```python
@staticmethod
def map_project(data: Dict[str, Any]) -> Dict[str, Any]:
    return {
        "gitlab_project_id": data["id"],
        "name":              data["name"],
        "path":              data["path"],
        "namespace":         data.get("namespace", {}).get("name"),
        "description":       data.get("description"),
        "visibility":        data.get("visibility"),
        "default_branch":    data.get("default_branch"),
        "archived":          data.get("archived", False),
    }
```

### Données d'Entrée (API GitLab)

```json
{
  "id": 12345,
  "name": "mon-projet",
  "path": "mon-projet",
  "namespace": {
    "name": "mon-organisation"
  },
  "description": "Description du projet",
  "visibility": "private",
  "default_branch": "main",
  "archived": false
}
```

### Données de Sortie (Base de données)

```python
{
    "gitlab_project_id": 12345,
    "name": "mon-projet",
    "path": "mon-projet",
    "namespace": "mon-organisation",
    "description": "Description du projet",
    "visibility": "private",
    "default_branch": "main",
    "archived": False
}
```

### Mapping des Champs

| Champ API | Champ DB | Type | Notes |
|-----------|----------|------|-------|
| `id` | `gitlab_project_id` | int | ID unique du projet GitLab |
| `name` | `name` | str | Nom complet du projet |
| `path` | `path` | str | Slug URL du projet |
| `namespace.name` | `namespace` | str | Nom de l'organisation/namespace |
| `description` | `description` | str | Description du projet |
| `visibility` | `visibility` | str | private/public/internal |
| `default_branch` | `default_branch` | str | Branche par défaut (main/master) |
| `archived` | `archived` | bool | Projet archivé ou non |

---

## Mapping des Développeurs

### Méthode `map_developer`

```python
@staticmethod
def map_developer(
    data: Dict[str, Any],
) -> Dict[str, Any]:
    """
    Mappe les données GitLab vers le modèle Developer.

    ✅ FIX : plus de project_id ni site_id dans le dict.
    L'association Developer ↔ Project est créée séparément via
    DeveloperProjectRepository.add() dans ExtractionService.

    ✅ AJOUT : gitlab_username (nouveau champ Developer).
    """
    gitlab_user_id = data.get("id")
    if gitlab_user_id is None:
        logger.warning(
            f"map_developer: id=None — username='{data.get('username')}'"
        )
    return {
        "gitlab_user_id":  gitlab_user_id,
        # ✅ AJOUT : gitlab_username (@handle) pour le matching commits/MRs
        "gitlab_username": data.get("username") or None,
        "name":            data.get("name")     or None,
        "email":           data.get("email")    or None,
        "is_active":       True,
    }
```

### Données d'Entrée (API GitLab)

```json
{
  "id": 42,
  "username": "jdupont",
  "name": "Jean Dupont",
  "email": "jean.dupont@example.com"
}
```

### Données de Sortie (Base de données)

```python
{
    "gitlab_user_id": 42,
    "gitlab_username": "jdupont",
    "name": "Jean Dupont",
    "email": "jean.dupont@example.com",
    "is_active": True
}
```

### Points Clés

**1. Séparation des Responsabilités**
- Le mapper NE crée PAS les associations Developer ↔ Project
- Ces associations sont créées séparément via `DeveloperProjectRepository.add()`
- Cela permet une gestion flexible des missions temporelles

**2. Champ gitlab_username**
- Ajouté pour le matching commits/MRs
- Permet d'identifier les développeurs par leur @handle
- Essentiel pour le re-linkage des commits orphelins

**3. Gestion des IDs manquants**
- Loggue un warning si `id` est None
- Permet de détecter les problèmes de synchronisation

### Mapping des Champs

| Champ API | Champ DB | Type | Notes |
|-----------|----------|------|-------|
| `id` | `gitlab_user_id` | int | ID unique de l'utilisateur GitLab |
| `username` | `gitlab_username` | str | @handle pour le matching |
| `name` | `name` | str | Nom complet de l'utilisateur |
| `email` | `email` | str | Email principal |
| - | `is_active` | bool | Toujours True à la création |

---

## Mapping des Commits

### Méthode `map_commit`

```python
@staticmethod
def map_commit(
    data:              Dict[str, Any],
    project_id:        int,
    developer_id:      Optional[int] = None,
    extraction_lot_id: Optional[int] = None,
) -> Dict[str, Any]:
    """
    Mappe les données GitLab vers le modèle Commit.

    ✅ AJOUT :
        is_merge_commit : détecté via le message (pattern "Merge branch/request")
        branch_name     : depuis les metadata du commit si disponible
        author_name     : nom brut de l'auteur (fallback quand developer_id=NULL)
        author_email    : email brut de l'auteur (fallback)
    """
    def parse_dt(val: str) -> datetime:
        return datetime.fromisoformat(val.replace("Z", "+00:00"))

    authored_date  = parse_dt(data["authored_date"])
    committed_date = parse_dt(data["committed_date"])
    full_message   = data.get("message", "")
    title          = full_message.split("\n", 1)[0]
    stats          = data.get("stats") or {}

    # ✅ AJOUT : détection commit de merge automatique
    title_lower = title.lower()
    is_merge_commit = (
        title_lower.startswith("merge branch") or
        title_lower.startswith("merge request") or
        title_lower.startswith("merged branch") or
        "merge remote-tracking branch" in title_lower
    )

    return {
        "gitlab_commit_id":  data["id"],
        "title":             title,
        "message":           full_message,
        "authored_date":     authored_date,
        "committed_date":    committed_date,
        "additions":         stats.get("additions", 0),
        "deletions":         stats.get("deletions", 0),
        "total_changes":     stats.get("total",     0),
        # ✅ AJOUT
        "is_merge_commit":   is_merge_commit,
        "branch_name":       data.get("branch_name") or data.get("ref"),
        "author_name":       data.get("author_name")  or None,
        "author_email":      data.get("author_email") or None,
        "project_id":        project_id,
        "developer_id":      developer_id,
        "extraction_lot_id": extraction_lot_id,
    }
```

### Données d'Entrée (API GitLab)

```json
{
  "id": "abc123def456",
  "title": "Fix bug login",
  "message": "Fix bug login\n\n- Fixed authentication\n- Updated tests",
  "author_name": "Jean Dupont",
  "author_email": "jean.dupont@example.com",
  "authored_date": "2024-01-15T10:30:00Z",
  "committed_date": "2024-01-15T10:35:00Z",
  "branch_name": "feature/login-fix",
  "stats": {
    "additions": 15,
    "deletions": 3,
    "total": 18
  }
}
```

### Données de Sortie (Base de données)

```python
{
    "gitlab_commit_id": "abc123def456",
    "title": "Fix bug login",
    "message": "Fix bug login\n\n- Fixed authentication\n- Updated tests",
    "authored_date": datetime(2024, 1, 15, 10, 30, 0, tzinfo=timezone.utc),
    "committed_date": datetime(2024, 1, 15, 10, 35, 0, tzinfo=timezone.utc),
    "additions": 15,
    "deletions": 3,
    "total_changes": 18,
    "is_merge_commit": False,
    "branch_name": "feature/login-fix",
    "author_name": "Jean Dupont",
    "author_email": "jean.dupont@example.com",
    "project_id": 123,
    "developer_id": 42,
    "extraction_lot_id": 789
}
```

### Détection des Commits de Merge

```python
title_lower = title.lower()
is_merge_commit = (
    title_lower.startswith("merge branch") or
    title_lower.startswith("merge request") or
    title_lower.startswith("merged branch") or
    "merge remote-tracking branch" in title_lower
)
```

**Patterns détectés :**
- "Merge branch feature/x into main"
- "Merge request #123"
- "Merged branch feature/x"
- "Merge remote-tracking branch origin/feature/x"

**Pourquoi cette détection ?**
- Les commits de merge sont souvent automatiques
- Ils peuvent fausser les métriques de productivité
- Permet de les exclure des calculs KPI

### Parsing des Dates

```python
def parse_dt(val: str) -> datetime:
    return datetime.fromisoformat(val.replace("Z", "+00:00"))
```

**Conversion :**
- GitLab API : `"2024-01-15T10:30:00Z"` (format ISO 8601 avec Z)
- Python : `datetime(2024, 1, 15, 10, 30, 0, tzinfo=timezone.utc)`
- Le "Z" est remplacé par "+00:00" pour la compatibilité Python

### Mapping des Champs

| Champ API | Champ DB | Type | Notes |
|-----------|----------|------|-------|
| `id` | `gitlab_commit_id` | str | SHA du commit |
| `title` (extrait) | `title` | str | Première ligne du message |
| `message` | `message` | str | Message complet |
| `authored_date` | `authored_date` | datetime | Date de création par l'auteur |
| `committed_date` | `committed_date` | datetime | Date de commit par Git |
| `stats.additions` | `additions` | int | Lignes ajoutées |
| `stats.deletions` | `deletions` | int | Lignes supprimées |
| `stats.total` | `total_changes` | int | Total des changements |
| (calculé) | `is_merge_commit` | bool | Commit de merge auto |
| `branch_name`/`ref` | `branch_name` | str | Nom de la branche |
| `author_name` | `author_name` | str | Nom brut (fallback) |
| `author_email` | `author_email` | str | Email brut (fallback) |
| (paramètre) | `project_id` | int | ID du projet |
| (paramètre) | `developer_id` | int | ID du développeur |
| (paramètre) | `extraction_lot_id` | int | ID du lot d'extraction |

---

## Mapping des Merge Requests

### Méthode `map_merge_request`

```python
@staticmethod
def map_merge_request(
    data:              Dict[str, Any],
    project_id:        int,
    developer_id:      Optional[int] = None,
    extraction_lot_id: Optional[int] = None,
    approvals_data:    Optional[Dict[str, Any]] = None,
    # ✅ AJOUT : relecteur assigné
    reviewer_id:       Optional[int] = None,
) -> Dict[str, Any]:
    """
    Mappe les données GitLab vers le modèle MergeRequest.

    ✅ AJOUT :
        source_branch, target_branch : branches GitLab
        author_name : nom brut de l'auteur (fallback)
        reviewer_id : développeur relecteur assigné
    """
    def parse_dt(val: Optional[str]) -> Optional[datetime]:
        if not val:
            return None
        try:
            return datetime.fromisoformat(val.replace("Z", "+00:00"))
        except Exception:
            logger.warning(f"map_merge_request — invalid datetime: '{val}'")
            return None

    created_at = parse_dt(data.get("created_at"))
    merged_at  = parse_dt(data.get("merged_at"))
    closed_at  = parse_dt(data.get("closed_at"))
    title      = data.get("title") or ""

    is_draft = (
        data.get("work_in_progress", False) or data.get("draft", False) or
        title.upper().startswith("DRAFT:") or title.upper().startswith("WIP:")
    )

    approved = False
    approved_at = None

    if approvals_data:
        approved_by = approvals_data.get("approved_by") or []
        if approved_by:
            approved    = True
            timestamps  = []
            for approval in approved_by:
                ts = approval.get("approved_at") or approvals_data.get("approved_at")
                if ts:
                    parsed = parse_dt(ts)
                    if parsed:
                        timestamps.append(parsed)
            if timestamps:
                approved_at = max(timestamps)
        if not approved_at and approvals_data.get("approved_at"):
            approved_at = parse_dt(approvals_data["approved_at"])
            approved    = approved_at is not None

    # Fallback for JSON imports where approvals_data is None but MR is merged
    if not approved and merged_at:
        approved = True
        approved_at = merged_at
    elif not approved and data.get("state") == "merged":
        approved = True
        # Use updated_at as fallback if merged_at is missing but state is merged
        approved_at = parse_dt(data.get("updated_at"))

    review_time_hours = None
    if approved_at and created_at:
        delta             = approved_at - created_at
        #  FIX : On ne peut pas avoir un temps de revue négatif (timezone/bot drift)
        review_time_hours = max(0.0, round(delta.total_seconds() / 3600, 2))

    #  AJOUT : auteur brut (fallback)
    author = data.get("author") or {}

    return {
        "gitlab_mr_id":      data["iid"],
        "title":             title,
        "description":       data.get("description"),
        "state":             data.get("state", "opened"),
        "is_draft":          is_draft,
        "created_at_gitlab": created_at,
        "updated_at_gitlab": parse_dt(data.get("updated_at")),
        "merged_at":         merged_at,
        "closed_at":         closed_at,
        "approved_at":       approved_at,
        "approved":          approved,
        "review_time_hours": review_time_hours,
        "cycle_time_hours":  data.get("cycle_time_hours"),
        "additions":         data.get("additions",     0),
        "deletions":         data.get("deletions",     0),
        "total_changes":     data.get("total_changes", 0),
        # ✅ AJOUT [SENIOR] : Métriques de profondeur et complexité
        "user_notes_count":  data.get("user_notes_count", 0),
        "commits_count":     data.get("commits_count") or 0,
        # ✅ AJOUT : branches
        "source_branch":     data.get("source_branch") or None,
        "target_branch":     data.get("target_branch") or None,
        # ✅ AJOUT : auteur brut
        "author_name":       author.get("name")     or data.get("author_name") or None,
        "project_id":        project_id,
        "developer_id":      developer_id,
        "reviewer_id":       reviewer_id,
        "extraction_lot_id": extraction_lot_id,
    }
```

### Données d'Entrée (API GitLab)

```json
{
  "iid": 123,
  "title": "Feature: Add login page",
  "description": "Implements the new login page with OAuth",
  "state": "merged",
  "work_in_progress": false,
  "created_at": "2024-01-10T09:00:00Z",
  "updated_at": "2024-01-12T14:30:00Z",
  "merged_at": "2024-01-12T14:30:00Z",
  "closed_at": null,
  "author": {
    "id": 42,
    "name": "Jean Dupont",
    "username": "jdupont"
  },
  "source_branch": "feature/login",
  "target_branch": "main",
  "additions": 150,
  "deletions": 20,
  "total_changes": 170,
  "user_notes_count": 5,
  "commits_count": 3
}
```

### Données d'Entrée (Approvals)

```json
{
  "approved_by": [
    {
      "user": {
        "id": 43,
        "name": "Marie Martin"
      },
      "approved_at": "2024-01-12T10:00:00Z"
    },
    {
      "user": {
        "id": 44,
        "name": "Pierre Durand"
      },
      "approved_at": "2024-01-12T11:30:00Z"
    }
  ]
}
```

### Données de Sortie (Base de données)

```python
{
    "gitlab_mr_id": 123,
    "title": "Feature: Add login page",
    "description": "Implements the new login page with OAuth",
    "state": "merged",
    "is_draft": False,
    "created_at_gitlab": datetime(2024, 1, 10, 9, 0, 0, tzinfo=timezone.utc),
    "updated_at_gitlab": datetime(2024, 1, 12, 14, 30, 0, tzinfo=timezone.utc),
    "merged_at": datetime(2024, 1, 12, 14, 30, 0, tzinfo=timezone.utc),
    "closed_at": None,
    "approved_at": datetime(2024, 1, 12, 11, 30, 0, tzinfo=timezone.utc),
    "approved": True,
    "review_time_hours": 51.5,
    "cycle_time_hours": None,
    "additions": 150,
    "deletions": 20,
    "total_changes": 170,
    "user_notes_count": 5,
    "commits_count": 3,
    "source_branch": "feature/login",
    "target_branch": "main",
    "author_name": "Jean Dupont",
    "project_id": 123,
    "developer_id": 42,
    "reviewer_id": None,
    "extraction_lot_id": 789
}
```

### Détection des Drafts

```python
is_draft = (
    data.get("work_in_progress", False) or data.get("draft", False) or
    title.upper().startswith("DRAFT:") or title.upper().startswith("WIP:")
)
```

**Critères de détection :**
- Champ `work_in_progress` = true
- Champ `draft` = true
- Titre commence par "DRAFT:"
- Titre commence par "WIP:"

### Calcul du Temps de Revue

```python
review_time_hours = None
if approved_at and created_at:
    delta = approved_at - created_at
    # FIX : On ne peut pas avoir un temps de revue négatif (timezone/bot drift)
    review_time_hours = max(0.0, round(delta.total_seconds() / 3600, 2))
```

**Calcul :**
- `delta = approved_at - created_at`
- Conversion en heures : `delta.total_seconds() / 3600`
- Arrondi à 2 décimales
- Protection contre les valeurs négatives (timezone drift)

### Détermination de l'Approbation

```python
if approvals_data:
    approved_by = approvals_data.get("approved_by") or []
    if approved_by:
        approved = True
        timestamps = []
        for approval in approved_by:
            ts = approval.get("approved_at") or approvals_data.get("approved_at")
            if ts:
                parsed = parse_dt(ts)
                if parsed:
                    timestamps.append(parsed)
        if timestamps:
            approved_at = max(timestamps)  # Dernière approbation
```

**Stratégie :**
- Si `approvals_data` est fourni, utilise les timestamps d'approbation
- `approved_at` = timestamp de la DERNIÈRE approbation
- Fallback si `approvals_data` est None mais MR est mergé

### Fallbacks pour l'Approbation

```python
# Fallback for JSON imports where approvals_data is None but MR is merged
if not approved and merged_at:
    approved = True
    approved_at = merged_at
elif not approved and data.get("state") == "merged":
    approved = True
    # Use updated_at as fallback if merged_at is missing but state is merged
    approved_at = parse_dt(data.get("updated_at"))
```

**Cas de fallback :**
1. MR mergé sans `approvals_data` → `approved_at = merged_at`
2. MR state = "merged" sans `merged_at` → `approved_at = updated_at`

### Mapping des Champs

| Champ API | Champ DB | Type | Notes |
|-----------|----------|------|-------|
| `iid` | `gitlab_mr_id` | int | ID interne du MR (pas le ID global) |
| `title` | `title` | str | Titre du MR |
| `description` | `description` | str | Description complète |
| `state` | `state` | str | opened/closed/merged |
| (calculé) | `is_draft` | bool | MR en brouillon |
| `created_at` | `created_at_gitlab` | datetime | Date de création |
| `updated_at` | `updated_at_gitlab` | datetime | Date de dernière modification |
| `merged_at` | `merged_at` | datetime | Date de merge |
| `closed_at` | `closed_at` | datetime | Date de fermeture |
| (calculé) | `approved_at` | datetime | Date de dernière approbation |
| (calculé) | `approved` | bool | MR approuvé ou non |
| (calculé) | `review_time_hours` | float | Temps de revue en heures |
| `cycle_time_hours` | `cycle_time_hours` | float | Temps de cycle (si fourni) |
| `additions` | `additions` | int | Lignes ajoutées |
| `deletions` | `deletions` | int | Lignes supprimées |
| `total_changes` | `total_changes` | int | Total des changements |
| `user_notes_count` | `user_notes_count` | int | Nombre de commentaires |
| `commits_count` | `commits_count` | int | Nombre de commits |
| `source_branch` | `source_branch` | str | Branche source |
| `target_branch` | `target_branch` | str | Branche cible |
| `author.name` | `author_name` | str | Nom de l'auteur (fallback) |
| (paramètre) | `project_id` | int | ID du projet |
| (paramètre) | `developer_id` | int | ID du développeur |
| (paramètre) | `reviewer_id` | int | ID du relecteur |
| (paramètre) | `extraction_lot_id` | int | ID du lot d'extraction |

---

## Stratégies de Mapping

### 1. Parsing des Dates

```python
def parse_dt(val: str) -> datetime:
    return datetime.fromisoformat(val.replace("Z", "+00:00"))
```

**Conversion standard :**
- Entrée : `"2024-01-15T10:30:00Z"` (ISO 8601 avec Z)
- Sortie : `datetime(2024, 1, 15, 10, 30, 0, tzinfo=timezone.utc)`

**Parsing robuste :**
```python
def parse_dt(val: Optional[str]) -> Optional[datetime]:
    if not val:
        return None
    try:
        return datetime.fromisoformat(val.replace("Z", "+00:00"))
    except Exception:
        logger.warning(f"map_merge_request — invalid datetime: '{val}'")
        return None
```

**Gestion des erreurs :**
- Retourne `None` si la valeur est manquante
- Loggue un warning si le parsing échoue
- Ne lève pas d'exception (fail-safe)

### 2. Extraction du Titre

```python
full_message = data.get("message", "")
title = full_message.split("\n", 1)[0]
```

**Logique :**
- Prend la première ligne du message comme titre
- Le reste du message est conservé dans `message`
- Séparateur : première occurrence de `\n`

**Exemple :**
```
Message complet : "Fix bug login\n\n- Fixed authentication\n- Updated tests"
Titre : "Fix bug login"
Message : "Fix bug login\n\n- Fixed authentication\n- Updated tests"
```

### 3. Calculs Dérivés

**is_merge_commit (Commits)**
```python
title_lower = title.lower()
is_merge_commit = (
    title_lower.startswith("merge branch") or
    title_lower.startswith("merge request") or
    title_lower.startswith("merged branch") or
    "merge remote-tracking branch" in title_lower
)
```

**is_draft (MRs)**
```python
is_draft = (
    data.get("work_in_progress", False) or data.get("draft", False) or
    title.upper().startswith("DRAFT:") or title.upper().startswith("WIP:")
)
```

**review_time_hours (MRs)**
```python
if approved_at and created_at:
    delta = approved_at - created_at
    review_time_hours = max(0.0, round(delta.total_seconds() / 3600, 2))
```

### 4. Fallbacks de Valeurs

**Utilisation de `.get()` avec valeurs par défaut**
```python
"description": data.get("description"),
"visibility": data.get("visibility"),
"archived": data.get("archived", False),
```

**Opérateur OR pour les valeurs manquantes**
```python
"name": data.get("name") or None,
"email": data.get("email") or None,
"branch_name": data.get("branch_name") or data.get("ref"),
```

**Fallbacks imbriqués**
```python
"author_name": author.get("name") or data.get("author_name") or None,
```

---

## Gestion des Dates et Timezones

### Format GitLab API

Les dates de l'API GitLab sont au format ISO 8601 :
```
2024-01-15T10:30:00Z
```

- `Z` = UTC (Zulu time)
- Format standard : `YYYY-MM-DDTHH:MM:SSZ`

### Conversion Python

```python
def parse_dt(val: str) -> datetime:
    return datetime.fromisoformat(val.replace("Z", "+00:00"))
```

**Transformation :**
- `"Z"` → `"+00:00"` (offset UTC)
- `datetime.fromisoformat()` → objet datetime Python
- Résultat : `datetime(2024, 1, 15, 10, 30, 0, tzinfo=timezone.utc)`

### Pourquoi cette conversion ?

1. **Compatibilité Python** : `fromisoformat()` ne supporte pas "Z" nativement
2. **Précision Timezone** : "+00:00" est plus explicite que "Z"
3. **Consistance** : Toutes les dates sont en UTC dans la base de données

### Gestion des Dates Optionnelles

```python
def parse_dt(val: Optional[str]) -> Optional[datetime]:
    if not val:
        return None
    try:
        return datetime.fromisoformat(val.replace("Z", "+00:00"))
    except Exception:
        logger.warning(f"map_merge_request — invalid datetime: '{val}'")
        return None
```

**Stratégie :**
- Retourne `None` si la valeur est manquante
- Gère les erreurs de parsing avec try/except
- Loggue les erreurs pour le debugging

---

## Fallbacks et Valeurs par Défaut

### 1. Champs Optionnels

```python
"namespace": data.get("namespace", {}).get("name"),
"description": data.get("description"),
"visibility": data.get("visibility"),
```

**Comportement :**
- Si le champ existe → utilise la valeur
- Si le champ est manquant → `None`
- Pour les objets imbriqués → navigation sécurisée avec `.get()`

### 2. Valeurs par Défaut Explicites

```python
"archived": data.get("archived", False),
"is_active": True,
"additions": stats.get("additions", 0),
"deletions": stats.get("deletions", 0),
```

**Comportement :**
- Si le champ existe → utilise la valeur
- Si le champ est manquant → valeur par défaut spécifiée
- Évite les `None` pour les champs numériques/booléens

### 3. Fallbacks en Cascade

```python
"branch_name": data.get("branch_name") or data.get("ref"),
"author_name": author.get("name") or data.get("author_name") or None,
```

**Comportement :**
- Essaie la première source
- Si `None` ou `False` → essaie la deuxième source
- Si toutes les sources échouent → `None`

### 4. Fallbacks Logiques

```python
# Fallback for JSON imports where approvals_data is None but MR is merged
if not approved and merged_at:
    approved = True
    approved_at = merged_at
elif not approved and data.get("state") == "merged":
    approved = True
    approved_at = parse_dt(data.get("updated_at"))
```

**Cas d'utilisation :**
- Import JSON sans données d'approbation
- MR mergé mais `approvals_data` manquant
- Utilise `merged_at` ou `updated_at` comme fallback

---

## Intégration avec le Service d'Extraction

### Flux de Mapping Complet

```python
# Dans extraction_service.py - _extract_commits()

# 1. Récupération des données brutes depuis GitLab
commit_data = await client.get_commit_detail(project.gitlab_project_id, sha)

# 2. Mapping via GitLabMapper
mapped = GitLabMapper.map_commit(
    data=commit_data,
    project_id=project.id,
    developer_id=developer.id,
    extraction_lot_id=lot.id,
)

# 3. Insertion en base de données
self.commit_repo.create(db, mapped)
```

### Exemple Complet : Commit

```python
# Données brutes GitLab
commit_data = {
    "id": "abc123def456",
    "title": "Fix bug login",
    "message": "Fix bug login\n\n- Fixed authentication",
    "author_name": "Jean Dupont",
    "author_email": "jean.dupont@example.com",
    "authored_date": "2024-01-15T10:30:00Z",
    "committed_date": "2024-01-15T10:35:00Z",
    "stats": {
        "additions": 15,
        "deletions": 3,
        "total": 18
    }
}

# Mapping
mapped = GitLabMapper.map_commit(
    data=commit_data,
    project_id=123,
    developer_id=42,
    extraction_lot_id=789,
)

# Résultat
# {
#     "gitlab_commit_id": "abc123def456",
#     "title": "Fix bug login",
#     "message": "Fix bug login\n\n- Fixed authentication",
#     "authored_date": datetime(2024, 1, 15, 10, 30, 0, tzinfo=timezone.utc),
#     "committed_date": datetime(2024, 1, 15, 10, 35, 0, tzinfo=timezone.utc),
#     "additions": 15,
#     "deletions": 3,
#     "total_changes": 18,
#     "is_merge_commit": False,
#     "branch_name": None,
#     "author_name": "Jean Dupont",
#     "author_email": "jean.dupont@example.com",
#     "project_id": 123,
#     "developer_id": 42,
#     "extraction_lot_id": 789
# }

# Insertion
self.commit_repo.create(db, mapped)
```

### Exemple Complet : Merge Request

```python
# Données brutes GitLab
mr_data = {
    "iid": 123,
    "title": "Feature: Add login page",
    "state": "merged",
    "created_at": "2024-01-10T09:00:00Z",
    "updated_at": "2024-01-12T14:30:00Z",
    "merged_at": "2024-01-12T14:30:00Z",
    "author": {"name": "Jean Dupont"},
    "source_branch": "feature/login",
    "target_branch": "main",
    "additions": 150,
    "deletions": 20,
    "total_changes": 170,
    "user_notes_count": 5,
    "commits_count": 3
}

approvals_data = {
    "approved_by": [
        {"approved_at": "2024-01-12T10:00:00Z"},
        {"approved_at": "2024-01-12T11:30:00Z"}
    ]
}

# Mapping
mapped = GitLabMapper.map_merge_request(
    data=mr_data,
    project_id=123,
    developer_id=42,
    extraction_lot_id=789,
    approvals_data=approvals_data,
)

# Résultat
# {
#     "gitlab_mr_id": 123,
#     "title": "Feature: Add login page",
#     "state": "merged",
#     "is_draft": False,
#     "created_at_gitlab": datetime(2024, 1, 10, 9, 0, 0, tzinfo=timezone.utc),
#     "updated_at_gitlab": datetime(2024, 1, 12, 14, 30, 0, tzinfo=timezone.utc),
#     "merged_at": datetime(2024, 1, 12, 14, 30, 0, tzinfo=timezone.utc),
#     "approved_at": datetime(2024, 1, 12, 11, 30, 0, tzinfo=timezone.utc),
#     "approved": True,
#     "review_time_hours": 51.5,
#     "additions": 150,
#     "deletions": 20,
#     "total_changes": 170,
#     "user_notes_count": 5,
#     "commits_count": 3,
#     "source_branch": "feature/login",
#     "target_branch": "main",
#     "author_name": "Jean Dupont",
#     "project_id": 123,
#     "developer_id": 42,
#     "reviewer_id": None,
#     "extraction_lot_id": 789
# }

# Insertion
self.mr_repo.create(db, mapped)
```

---

## Résumé des Méthodes de Mapping

| Méthode | Entité | Paramètres Contextuels | Champs Calculés |
|---------|--------|------------------------|-----------------|
| `map_project` | Project | Aucun | Aucun |
| `map_developer` | Developer | Aucun | Aucun |
| `map_commit` | Commit | project_id, developer_id, extraction_lot_id | is_merge_commit |
| `map_merge_request` | MergeRequest | project_id, developer_id, extraction_lot_id, approvals_data, reviewer_id | is_draft, approved, approved_at, review_time_hours |

---

## Bonnes Pratiques de Mapping

### 1. Toujours Utiliser `.get()` pour les Champs Optionnels

```python
# ❌ MAUVAIS - Peut lever KeyError
"name": data["name"]

# ✅ BON - Gère les champs manquants
"name": data.get("name")
```

### 2. Spécifier des Valeurs par Défaut pour les Champs Numériques

```python
# ❌ MAUVAIS - Peut être None
"additions": data.get("additions")

# ✅ BON - Valeur par défaut explicite
"additions": data.get("additions", 0)
```

### 3. Utiliser des Fallbacks en Cascade

```python
# ❌ MAUVAIS - Une seule source
"branch_name": data.get("branch_name")

# ✅ BON - Plusieurs sources
"branch_name": data.get("branch_name") or data.get("ref")
```

### 4. Logger les Avertissements pour les Données Invalides

```python
if gitlab_user_id is None:
    logger.warning(
        f"map_developer: id=None — username='{data.get('username')}'"
    )
```

### 5. Calculer les Champs Dérivés dans le Mapper

```python
# ✅ BON - Calcul dans le mapper
is_merge_commit = (
    title_lower.startswith("merge branch") or
    title_lower.startswith("merge request")
)

# ❌ MAUVAIS - Calcul dans la base de données ou le service
```

### 6. Gérer les Timezones Explicitement

```python
# ✅ BON - Conversion explicite UTC
datetime.fromisoformat(val.replace("Z", "+00:00"))

# ❌ MAUVAIS - Conversion implicite ou ignorée
datetime.fromisoformat(val)
```

---

## Conclusion

Le **GitLabMapper** est une couche critique de transformation qui :

1. **Normalise** les données de l'API GitLab en format base de données
2. **Enrichit** les données avec des champs calculés (is_merge_commit, review_time_hours)
3. **Protège** contre les données manquantes avec des fallbacks robustes
4. **Gère** les timezones explicitement pour éviter les erreurs
5. **Sépare** les responsabilités (mapping vs création d'associations)

Le mapper est conçu pour être :
- **Déterministe** : Mêmes données → même résultat
- **Résilient** : Gère les données manquantes ou invalides
- **Maintenable** : Logique de transformation centralisée
- **Testable** : Méthodes statiques faciles à tester

Cette architecture garantit une transformation fiable et cohérente des données GitLab vers la base de données de l'application.
