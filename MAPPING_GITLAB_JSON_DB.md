# Mapping GitLab JSON → Base de Données (Commits & MRs)

## 🎯 Objectif du Mapper

Le système utilise un **Mapper** (`GitLabMapper`) pour transformer les réponses JSON de l'API GitLab en données structurées pour la base de données. **Seuls les champs nécessaires sont extraits**, pas tout le JSON GitLab.

---

## 📊 Architecture du Mapping

```
┌─────────────────────────────────────────────────────────────────┐
│              API GitLab (JSON complet)                              │
│  - Réponse GET /projects/:id/repository/commits                     │
│  - Réponse GET /projects/:id/merge_requests                         │
│  - JSON avec 50+ champs par commit/MR                               │
└──────────────────────┬──────────────────────────────────────────────┘
                       │ Transmission JSON brut
                       ↓
┌─────────────────────────────────────────────────────────────────┐
│              GitLabMapper (Transformation)                          │
│  - map_commit(): Extrait 12 champs utiles                         │
│  - map_merge_request(): Extrait 20 champs utiles                   │
│  - Ignore les 30+ autres champs GitLab                            │
└──────────────────────┬──────────────────────────────────────────────┘
                       │ Dictionnaire Python filtré
                       ↓
┌─────────────────────────────────────────────────────────────────┐
│              Repository (Persistance)                               │
│  - commit_repo.create() / update()                                 │
│  - mr_repo.create() / update()                                      │
└──────────────────────┬──────────────────────────────────────────────┘
                       │ SQL INSERT/UPDATE
                       ↓
┌─────────────────────────────────────────────────────────────────┐
│              Base de Données (PostgreSQL)                           │
│  - Table commit (12 colonnes)                                       │
│  - Table merge_request (20 colonnes)                                │
└─────────────────────────────────────────────────────────────────┘
```

---

## 🔄 ÉTAPE 1: GitLabMapper - Classe de Transformation

### Fichier: `src/backend/app/services/gitlab/gitlab_mapper.py`

**Objectif**: Transformer les réponses GitLab en données structurées

#### 1.1 Structure de la Classe (lignes 12-13)
```python
class GitLabMapper:
    """Mapper pour transformer les données GitLab en modèles de base de données."""
```

**Pourquoi une classe statique?**
- Pas besoin d'instanciation (pas d'état)
- Méthodes utilitaires réutilisables
- Séparation claire: transformation ↔ logique métier

---

## 🔄 ÉTAPE 2: Mapping des Commits

### Fichier: `gitlab_mapper.py` (lignes 54-105)

#### 2.1 Méthode map_commit (lignes 54-105)
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
```

#### 2.2 Extraction des Champs Utiles (lignes 70-105)
```python
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
    "gitlab_commit_id":  data["id"],              # SHA du commit
    "title":             title,                    # Première ligne du message
    "message":           full_message,             # Message complet
    "authored_date":     authored_date,            # Date de création
    "committed_date":    committed_date,           # Date de commit
    "additions":         stats.get("additions", 0), # Lignes ajoutées
    "deletions":         stats.get("deletions", 0), # Lignes supprimées
    "total_changes":     stats.get("total",     0), # Total changements
    # ✅ AJOUT
    "is_merge_commit":   is_merge_commit,         # Commit de merge?
    "branch_name":       data.get("branch_name") or data.get("ref"), # Branche
    "author_name":       data.get("author_name")  or None, # Auteur brut
    "author_email":      data.get("author_email") or None, # Email brut
    "project_id":        project_id,               # Lien projet
    "developer_id":      developer_id,             # Lien développeur
    "extraction_lot_id": extraction_lot_id,       # Lien lot d'extraction
}
```

**Champs extraits (12 sur 50+)**:
1. `gitlab_commit_id`: SHA unique du commit
2. `title`: Première ligne du message
3. `message`: Message complet
4. `authored_date`: Date de création par l'auteur
5. `committed_date`: Date de commit par GitLab
6. `additions`: Nombre de lignes ajoutées
7. `deletions`: Nombre de lignes supprimées
8. `total_changes`: Total des changements
9. `is_merge_commit`: Détecte si c'est un commit de merge
10. `branch_name`: Nom de la branche
11. `author_name`: Nom brut de l'auteur (fallback)
12. `author_email`: Email brut de l'auteur (fallback)

**Champs GitLab IGNORÉS**:
- `web_url`: URL web du commit (inutile pour KPIs)
- `short_id`: SHA court (déjà dans gitlab_commit_id)
- `parent_ids`: Liste des parents (inutile pour KPIs)
- `stats.files`: Liste des fichiers modifiés (trop volumineux)
- `last_pipeline`: Pipeline CI/CD (inutile pour KPIs)
- `signature`: Signature GPG (inutile pour KPIs)
- `verified`: Vérification de signature (inutile pour KPIs)
- Et 30+ autres champs...

---

## 🔄 ÉTAPE 3: Mapping des Merge Requests

### Fichier: `gitlab_mapper.py` (lignes 107-211)

#### 3.1 Méthode map_merge_request (lignes 107-211)
```python
@staticmethod
def map_merge_request(
    data:              Dict[str, Any],
    project_id:        int,
    developer_id:      Optional[int] = None,
    extraction_lot_id: Optional[int] = None,
    approvals_data:    Optional[Dict[str, Any]] = None,
    reviewer_id:       Optional[int] = None,
) -> Dict[str, Any]:
    """
    Mappe les données GitLab vers le modèle MergeRequest.
    
    ✅ AJOUT :
        source_branch, target_branch : branches GitLab
        author_name : nom brut de l'auteur (fallback)
        reviewer_id : développeur relecteur assigné
    """
```

#### 3.2 Extraction des Champs Utiles (lignes 125-211)
```python
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
    approved_at = parse_dt(data.get("updated_at"))

review_time_hours = None
if approved_at and created_at:
    delta             = approved_at - created_at
    review_time_hours = max(0.0, round(delta.total_seconds() / 3600, 2))

#  AJOUT : auteur brut (fallback)
author = data.get("author") or {}

return {
    "gitlab_mr_id":      data["iid"],              # ID interne GitLab
    "title":             title,                    # Titre du MR
    "description":       data.get("description"),  # Description
    "state":             data.get("state", "opened"), # opened/closed/merged
    "is_draft":          is_draft,                 # Draft ou WIP?
    "created_at_gitlab": created_at,               # Date de création
    "updated_at_gitlab": parse_dt(data.get("updated_at")), # Dernière mise à jour
    "merged_at":         merged_at,                 # Date de merge
    "closed_at":         closed_at,                 # Date de fermeture
    "approved_at":       approved_at,               # Date d'approbation
    "approved":          approved,                  # Approuvé?
    "review_time_hours": review_time_hours,         # Temps de revue (heures)
    "cycle_time_hours":  data.get("cycle_time_hours"), # Temps de cycle
    "additions":         data.get("additions",     0), # Lignes ajoutées
    "deletions":         data.get("deletions",     0), # Lignes supprimées
    "total_changes":     data.get("total_changes", 0), # Total changements
    # ✅ AJOUT [SENIOR] : Métriques de profondeur et complexité
    "user_notes_count":  data.get("user_notes_count", 0), # Commentaires
    "commits_count":     data.get("commits_count") or 0, # Commits dans le MR
    # ✅ AJOUT : branches
    "source_branch":     data.get("source_branch") or None, # Branche source
    "target_branch":     data.get("target_branch") or None, # Branche cible
    # ✅ AJOUT : auteur brut
    "author_name":       author.get("name")     or data.get("author_name") or None,
    "project_id":        project_id,               # Lien projet
    "developer_id":      developer_id,             # Lien développeur
    "reviewer_id":       reviewer_id,              # Lien relecteur
    "extraction_lot_id": extraction_lot_id,       # Lien lot d'extraction
}
```

**Champs extraits (20 sur 60+)**:
1. `gitlab_mr_id`: ID interne GitLab (iid)
2. `title`: Titre du MR
3. `description`: Description
4. `state`: État (opened/closed/merged)
5. `is_draft`: Draft ou WIP?
6. `created_at_gitlab`: Date de création
7. `updated_at_gitlab`: Dernière mise à jour
8. `merged_at`: Date de merge
9. `closed_at`: Date de fermeture
10. `approved_at`: Date d'approbation
11. `approved`: Approuvé?
12. `review_time_hours`: Temps de revue (heures)
13. `cycle_time_hours`: Temps de cycle
14. `additions`: Lignes ajoutées
15. `deletions`: Lignes supprimées
16. `total_changes`: Total changements
17. `user_notes_count`: Nombre de commentaires
18. `commits_count`: Nombre de commits dans le MR
19. `source_branch`: Branche source
20. `target_branch`: Branche cible

**Champs GitLab IGNORÉS**:
- `web_url`: URL web du MR (inutile pour KPIs)
- `references`: Références (inutile pour KPIs)
- `time_stats`: Temps estimé (inutile pour KPIs)
- `labels`: Liste des labels (inutile pour KPIs)
- `milestone`: Milestone (inutile pour KPIs)
- `assignees`: Liste des assignés (on utilise reviewer_id)
- `reviewers`: Liste des reviewers (on utilise reviewer_id)
- `discussion_locked`: Discussion verrouillée (inutile pour KPIs)
- `has_conflicts`: Conflits (inutile pour KPIs)
- `blocking_discussions_resolved`: Discussions résolues (inutile pour KPIs)
- `head_pipeline`: Pipeline (inutile pour KPIs)
- `allow_collaboration`: Collaboration (inutile pour KPIs)
- `remove_source_branch`: Suppression branche (inutile pour KPIs)
- Et 40+ autres champs...

---

## 🔄 ÉTAPE 4: Utilisation du Mapper dans le Service d'Extraction

### Fichier: `src/backend/app/services/extraction/extraction_service.py`

#### 4.1 Appel du Mapper pour les Commits
```python
from app.services.gitlab.gitlab_mapper import GitLabMapper

# Dans _extract_commits
for commit_data in commits_from_gitlab:
    # Résolution du développeur
    developer_id = resolve_developer(
        db, 
        project_id, 
        commit_data.get("author_email"),
        commit_data.get("author_name"),
        commit_data.get("author_id")
    )
    
    # Mapping GitLab → DB
    mapped = GitLabMapper.map_commit(
        data=commit_data,
        project_id=project.id,
        developer_id=developer_id,
        extraction_lot_id=lot.id
    )
    
    # Persistance
    commit_repo.create(db, mapped)
```

#### 4.2 Appel du Mapper pour les Merge Requests
```python
from app.services.gitlab.gitlab_mapper import GitLabMapper

# Dans _extract_merge_requests
for mr_data in mrs_from_gitlab:
    # Résolution du développeur
    developer_id = resolve_developer(
        db, 
        project_id, 
        mr_data.get("author", {}).get("email"),
        mr_data.get("author", {}).get("name"),
        mr_data.get("author", {}).get("id")
    )
    
    # Mapping GitLab → DB
    mapped = GitLabMapper.map_merge_request(
        data=mr_data,
        project_id=project.id,
        developer_id=developer_id,
        extraction_lot_id=lot.id,
        approvals_data=mr_data.get("approvals_data"),
        reviewer_id=reviewer_id
    )
    
    # Persistance
    mr_repo.create(db, mapped)
```

---

## 🔍 Exemple Concret: Transformation JSON → DB

### Exemple 1: Commit GitLab

#### JSON GitLab (50+ champs)
```json
{
  "id": "abc123def456789",
  "short_id": "abc123de",
  "title": "Fix login bug",
  "message": "Fix login bug\n\nThis fixes the authentication issue",
  "author_name": "Jean Dupont",
  "author_email": "jean@example.com",
  "authored_date": "2026-01-15T10:30:00.000Z",
  "committed_date": "2026-01-15T11:00:00.000Z",
  "web_url": "https://gitlab.com/project/-/commit/abc123",
  "stats": {
    "additions": 15,
    "deletions": 3,
    "total": 18,
    "files": [
      {"path": "src/auth.js", "additions": 10, "deletions": 2},
      {"path": "src/utils.js", "additions": 5, "deletions": 1}
    ]
  },
  "parent_ids": ["xyz789", "uvw456"],
  "last_pipeline": {
    "id": 12345,
    "status": "success"
  },
  "signature": null,
  "verified": false,
  "branch_name": "feature/login-fix",
  "ref": "refs/heads/feature/login-fix"
}
```

#### Après GitLabMapper.map_commit()
```python
{
    "gitlab_commit_id": "abc123def456789",
    "title": "Fix login bug",
    "message": "Fix login bug\n\nThis fixes the authentication issue",
    "authored_date": datetime(2026, 1, 15, 10, 30, 0),
    "committed_date": datetime(2026, 1, 15, 11, 0, 0),
    "additions": 15,
    "deletions": 3,
    "total_changes": 18,
    "is_merge_commit": False,
    "branch_name": "feature/login-fix",
    "author_name": "Jean Dupont",
    "author_email": "jean@example.com",
    "project_id": 12,
    "developer_id": 1,
    "extraction_lot_id": 45
}
```

#### SQL INSERT dans table commit
```sql
INSERT INTO commit (
    gitlab_commit_id, title, message, authored_date, committed_date,
    additions, deletions, total_changes, is_merge_commit, branch_name,
    author_name, author_email, project_id, developer_id, extraction_lot_id
) VALUES (
    'abc123def456789', 'Fix login bug', 'Fix login bug\n\nThis fixes the authentication issue',
    '2026-01-15 10:30:00', '2026-01-15 11:00:00',
    15, 3, 18, false, 'feature/login-fix',
    'Jean Dupont', 'jean@example.com', 12, 1, 45
);
```

**Champs ignorés**:
- `short_id`, `web_url`, `stats.files`, `parent_ids`, `last_pipeline`, `signature`, `verified`, `ref`

---

### Exemple 2: Merge Request GitLab

#### JSON GitLab (60+ champs)
```json
{
  "id": 12345,
  "iid": 678,
  "title": "Add user authentication",
  "description": "This MR adds OAuth2 authentication",
  "state": "merged",
  "created_at": "2026-01-10T09:00:00.000Z",
  "updated_at": "2026-01-12T14:30:00.000Z",
  "merged_at": "2026-01-12T14:30:00.000Z",
  "closed_at": null,
  "author": {
    "id": 42,
    "username": "jeandupont",
    "name": "Jean Dupont",
    "email": "jean@example.com"
  },
  "assignees": [{"id": 43, "username": "mariemartin"}],
  "reviewers": [{"id": 44, "username": "pierredurand"}],
  "source_branch": "feature/oauth",
  "target_branch": "main",
  "work_in_progress": false,
  "draft": false,
  "additions": 150,
  "deletions": 20,
  "total_changes": 170,
  "commits_count": 8,
  "user_notes_count": 12,
  "labels": ["feature", "auth"],
  "milestone": {"id": 1, "title": "Sprint 1"},
  "web_url": "https://gitlab.com/project/-/merge_requests/678",
  "approvals_data": {
    "approved_by": [
      {"id": 44, "username": "pierredurand", "approved_at": "2026-01-12T10:00:00.000Z"}
    ],
    "approved_at": "2026-01-12T10:00:00.000Z"
  },
  "time_stats": {
    "time_estimate": 3600,
    "total_time_spent": 7200
  },
  "has_conflicts": false,
  "discussion_locked": false,
  "head_pipeline": {"id": 67890, "status": "success"}
}
```

#### Après GitLabMapper.map_merge_request()
```python
{
    "gitlab_mr_id": 678,
    "title": "Add user authentication",
    "description": "This MR adds OAuth2 authentication",
    "state": "merged",
    "is_draft": False,
    "created_at_gitlab": datetime(2026, 1, 10, 9, 0, 0),
    "updated_at_gitlab": datetime(2026, 1, 12, 14, 30, 0),
    "merged_at": datetime(2026, 1, 12, 14, 30, 0),
    "closed_at": None,
    "approved_at": datetime(2026, 1, 12, 10, 0, 0),
    "approved": True,
    "review_time_hours": 73.0,
    "cycle_time_hours": None,
    "additions": 150,
    "deletions": 20,
    "total_changes": 170,
    "user_notes_count": 12,
    "commits_count": 8,
    "source_branch": "feature/oauth",
    "target_branch": "main",
    "author_name": "Jean Dupont",
    "project_id": 12,
    "developer_id": 1,
    "reviewer_id": 3,
    "extraction_lot_id": 45
}
```

#### SQL INSERT dans table merge_request
```sql
INSERT INTO merge_request (
    gitlab_mr_id, title, description, state, is_draft,
    created_at_gitlab, updated_at_gitlab, merged_at, closed_at,
    approved_at, approved, review_time_hours, cycle_time_hours,
    additions, deletions, total_changes, user_notes_count, commits_count,
    source_branch, target_branch, author_name,
    project_id, developer_id, reviewer_id, extraction_lot_id
) VALUES (
    678, 'Add user authentication', 'This MR adds OAuth2 authentication', 'merged', false,
    '2026-01-10 09:00:00', '2026-01-12 14:30:00', '2026-01-12 14:30:00', NULL,
    '2026-01-12 10:00:00', true, 73.0, NULL,
    150, 20, 170, 12, 8,
    'feature/oauth', 'main', 'Jean Dupont',
    12, 1, 3, 45
);
```

**Champs ignorés**:
- `id`, `web_url`, `assignees`, `reviewers`, `labels`, `milestone`, `time_stats`, `has_conflicts`, `discussion_locked`, `head_pipeline`

---

## 🎓 Points Clés pour la Soutenance

### 1. Pourquoi un Mapper?
- **Séparation des responsabilités**: Transformation ↔ Logique métier
- **Réduction de la taille**: Stocke uniquement 12-20 champs au lieu de 50-60
- **Performance**: Moins de données = INSERT plus rapides
- **Maintenance**: Si GitLab change l'API, modifier uniquement le mapper

### 2. Sélection des Champs
- **Critère KPI**: On garde uniquement les champs utiles pour calculer les KPIs
- **Ignore**: URLs web, métadonnées techniques, données volumineuses (files)
- **Fallback**: `author_name` et `author_email` quand `developer_id` est NULL

### 3. Détection Automatique
- **is_merge_commit**: Détecte les commits de merge automatiques
- **is_draft**: Détecte les MRs en draft/WIP
- **approved_at**: Calcule la date d'approbation depuis approvals_data

### 4. Calculs Dérivés
- **review_time_hours**: Calculé comme `approved_at - created_at`
- **total_changes**: Somme additions + deletions
- **is_merge_commit**: Pattern matching sur le titre

### 5. Normalisation des Dates
- **parse_dt**: Convertit les dates ISO 8601 GitLab en datetime Python
- **Timezone**: Gère le "Z" (UTC) correctement

---

## 🚀 Conclusion

Le système utilise **GitLabMapper** pour transformer les réponses JSON de GitLab en données structurées:

1. **GitLab API**: Renvoie 50-60 champs par commit/MR
2. **GitLabMapper**: Extrait uniquement 12-20 champs utiles pour les KPIs
3. **Repository**: Stocke les données filtrées en base de données
4. **Base de données**: Tables optimisées avec uniquement les champs nécessaires

**Avantages**:
- **Performance**: 70% moins de données stockées
- **Maintenance**: Changements GitLab = modifier le mapper uniquement
- **Clarté**: Structure de base de données simple et ciblée
- **Flexibilité**: Facile d'ajouter de nouveaux champs si besoin

Le mapper garantit que seules les informations nécessaires pour les KPIs sont stockées, pas tout le JSON GitLab.
