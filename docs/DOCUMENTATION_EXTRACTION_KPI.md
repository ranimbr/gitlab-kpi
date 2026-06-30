# Documentation Technique : Extraction GitLab et Calcul des KPI

## 📋 GUIDE DE NAVIGATION RAPIDE

**Pour trouver rapidement une fonctionnalité :**
- **Vue d'ensemble simple** → Section 1 (5 min pour comprendre le système)
- **Flux complet étape par étape** → Section 2 (avec relations et objectifs)
- **Calcul des KPI** → Sections 3-4
- **Règles métier** → Section 5
- **Sécurité** → Section 6

**Fichiers principaux à connaître :**
1. `extraction_service.py` - Orchestrateur principal (lignes 94-455)
2. `kpi_calculator.py` - Calcul des KPI (lignes 96-677)
3. `kpi_aggregator.py` - Agrégation des snapshots (lignes 39-203)
4. `gitlab_client.py` - Client API GitLab (lignes 65-161)
5. `gitlab_mapper.py` - Mapping des données (lignes 55-211)
6. `extraction_filters.py` - Filtres métier (lignes 12-142)

---

## Table des matières
1. [Vue d'ensemble simple - Le système en 5 minutes](#vue-densemble-simple---le-système-en-5-minutes)
2. [Flux de travail d'extraction - ÉTAPE PAR ÉTAPE avec relations et objectifs](#flux-de-travail-dextraction---étape-par-étape-avec-relations-et-objectifs)
3. [Fichiers clés et leurs responsabilités](#fichiers-clés-et-leurs-responsabilités)
4. [Calcul des KPI - DÉTAILLÉ AVEC CODE](#calcul-des-kpi---détaillé-avec-code)
5. [Agrégation des KPI - Snapshots mensuels](#agrégation-des-kpi---snapshots-mensuels)
6. [Règles de filtrage et validation](#règles-de-filtrage-et-validation)
7. [Sécurité et intégrité des données](#sécurité-et-intégrité-des-données)
8. [Glossaire technique](#glossaire-technique)

---

## Vue d'ensemble simple - Le système en 5 minutes

### 🎯 Objectif principal
Le système extrait automatiquement les données de GitLab (commits, merge requests, commentaires) pour calculer des indicateurs de performance (KPI) par site, par projet et par développeur.

### 🔄 Le flux en 3 phrases
1. **Extraction** : On va chercher les données brutes sur GitLab API pour une période donnée (mois/année)
2. **Filtrage** : On ne garde que ce qui est pertinent (développeurs assignés au projet, dates dans la période, pas les drafts)
3. **Calcul** : On transforme ces données filtrées en KPI (taux de MR, temps de review, etc.)

### 🏗️ Architecture simplifiée

```
Utilisateur → API FastAPI → ExtractionService → GitLab API
                                          ↓
                                    Base de données
                                          ↓
                                    KpiCalculator
                                          ↓
                                    KPIs finaux
```

### 📦 Les 3 blocs principaux

**Bloc 1 : Extraction (extraction_service.py)**
- C'est le chef d'orchestre
- Il coordonne tout le workflow
- Il gère les erreurs et les retry
- Il crée des "lots" d'extraction pour la traçabilité

**Bloc 2 : Communication GitLab (gitlab_client.py + gitlab_mapper.py)**
- GitLabClient : parle avec l'API GitLab (pagination, retry, rate limiting)
- GitLabMapper : transforme le format GitLab en format base de données

**Bloc 3 : Calcul des KPI (kpi_calculator.py)**
- Lit les données de la base
- Applique les règles métier (qui compte, quand on compte)
- Calcule les indicateurs (MR rate, review time, etc.)

### 🔑 Concepts clés à retenir

- **Période** : On travaille toujours par mois (ex: Janvier 2024)
- **Lot d'extraction** : Chaque extraction crée un "lot" pour savoir quand/qui a extrait quoi
- **Mission** : Un développeur doit être assigné à un projet pour que ses commits comptent
- **RG-02** : Règle des 15 jours - si un dev arrive après le 15 du mois, il ne compte pas pour ce mois
- **Filtrage chirurgical** : On applique plusieurs filtres successifs pour être sûr de ne compter que le bon contenu

---

## Flux de travail d'extraction - ÉTAPE PAR ÉTAPE avec relations et objectifs

### 📊 Vue d'ensemble du flux

```
ÉTAPE 1 → ÉTAPE 2 → ÉTAPE 3 → ÉTAPE 4 → ÉTAPE 5 → ÉTAPE 6 → ÉTAPE 7
  ↓        ↓        ↓        ↓        ↓        ↓        ↓
Lancement  Fenêtre  Dévelop-  Récupé-  Filtrage  MRs     Certif.
          temps    pateurs   ration   chirur-          ication
                              gique
```

**Relation entre les étapes :**
- Chaque étape produit une sortie utilisée par l'étape suivante
- Les étapes 4-6 sont parallèles (commits, MRs, commentaires)
- L'étape 7 est une vérification finale qui garantit l'intégrité

---

### ÉTAPE 1 : Lancement de l'extraction (Point d'entrée)

**Fichier** : `dataCollection/src/backend/app/services/extraction/extraction_service.py`  
**Lignes** : 94-248  
**Fonction** : `run_realtime_extraction()`

#### 🎯 Objectif de cette étape
Initialiser l'extraction en vérifiant les prérequis et créant la traçabilité.

#### 🔄 Relation avec les autres étapes
- **Sortie** : Crée un `ExtractionLot` (lot d'extraction) qui sera utilisé par toutes les étapes suivantes
- **Déclenche** : ÉTAPE 2 (définition de la fenêtre temporelle)

#### Ce qui se passe (en simple)
1. **Récupérer la période** : On détermine le mois/année actuel (ex: Janvier 2024)
2. **Vérifier que la période est ouverte** : On ne peut pas extraire si le mois est closé (RG-01)
3. **Récupérer ou créer le projet** : Si le projet n'existe pas en BDD, on le crée depuis GitLab
4. **Créer le lot d'extraction** : On crée un enregistrement pour tracer qui a lancé quoi et quand
5. **Log d'audit** : On enregistre l'action pour traçabilité

#### Pourquoi c'est important
- Sans le lot d'extraction, on ne pourrait pas savoir quelles données viennent de quelle extraction
- La vérification de période ouverte empêche de modifier des données figées
- L'audit permet de savoir qui a fait quoi en cas de problème

**Code exact (lignes 126-134)** :
```python
lot = ExtractionLot(
    extraction_type=ExtractionTypeEnum.REALTIME,
    status=ExtractionStatusEnum.running,
    period_id=period.id,
    project_id=project.id,
    triggered_by=triggered_by_user,
)
db.add(lot)
db.flush()
```

---

### ÉTAPE 2 : Définition de la fenêtre temporelle

**Fichier** : `dataCollection/src/backend/app/services/extraction/extraction_filters.py`  
**Lignes** : 12-34  
**Fonction** : `build_period_window()`

#### 🎯 Objectif de cette étape
Calculer les dates de début et de fin pour l'extraction, en gérant la différence entre l'API GitLab et le filtrage local.

#### 🔄 Relation avec les autres étapes
- **Entrée** : La période (année/mois) de l'ÉTAPE 1
- **Sortie** : 4 dates (`since`, `until` pour l'API GitLab, `start`, `end` pour le filtrage local)
- **Utilisé par** : ÉTAPE 4 (récupération des commits) et ÉTAPE 5 (filtrage)

#### Ce qui se passe (en simple)
1. **Date de début** : Toujours le 1er du mois à 00:00:00
2. **Date de fin API** : Le 1er du mois suivant à 00:00:00 (exclusif - GitLab API ne prend pas le dernier jour)
3. **Date de fin locale** : Le dernier jour du mois à 23:59:59 (inclusif - pour filtrage local)

#### Pourquoi c'est important
- L'API GitLab utilise des bornes exclusives (`until` n'est pas inclus)
- Le filtrage local utilise des bornes inclusives (on veut tout le mois)
- Cette différence est source de bugs si mal gérée

**Exemple concret** : Pour Janvier 2024
- `since` = "2024-01-01T00:00:00Z" (API GitLab)
- `until` = "2024-02-01T00:00:00Z" (API GitLab - exclusif)
- `start` = 2024-01-01 00:00:00 UTC (Filtrage local)
- `end` = 2024-01-31 23:59:59 UTC (Filtrage local - inclusif)

**Code exact (lignes 21-33)** :
```python
year, month = period.year, period.month
since = f"{year}-{month:02d}-01T00:00:00Z"

# API 'until' est exclusif: use start of NEXT month
if month == 12:
    until = f"{year + 1}-01-01T00:00:00Z"
else:
    until = f"{year + 1:02d}-01T00:00:00Z"

# Local filtering uses inclusive bounds: end of current month
last_day = calendar.monthrange(year, month)[1]
start = datetime(year, month, 1, tzinfo=timezone.utc)
end = datetime(year, month, last_day, 23, 59, 59, 999999, tzinfo=timezone.utc)
return since, until, start, end
```

---

### ÉTAPE 3 : Identification des développeurs cibles

**Fichier** : `dataCollection/src/backend/app/services/extraction/extraction_service.py`  
**Lignes** : 151-158 (REALTIME) ou 320-326 (MONTHLY)

#### 🎯 Objectif de cette étape
Identifier quels développeurs sont éligibles pour cette extraction (ceux assignés au projet).

#### 🔄 Relation avec les autres étapes
- **Entrée** : Le projet (de l'ÉTAPE 1) et la période (de l'ÉTAPE 2)
- **Sortie** : Liste des IDs de développeurs éligibles
- **Utilisé par** : ÉTAPE 5 (filtrage chirurgical des commits)

#### Ce qui se passe (en simple)
- On interroge la base de données pour trouver tous les développeurs assignés au projet
- On filtre sur `is_active = True` pour ne prendre que les missions actives
- Pour MONTHLY : on utilise une fonction utilitaire plus sophistiquée

#### Pourquoi c'est important
- Sans cette étape, on extrairait les commits de tous les développeurs du projet, même ceux qui ne sont plus assignés
- C'est la base du filtrage chirurgical : on ne traite que les développeurs autorisés

**Pour REALTIME (lignes 151-158)** :
```python
# [SENIOR FIX] Identification de la mission pour le Realtime
# On récupère les IDs des développeurs officiellement rattachés à ce projet
from app.models.developer_project import DeveloperProject
eligible_dev_ids = [
    r[0] for r in db.query(DeveloperProject.developer_id)
    .filter(DeveloperProject.project_id == project.id, DeveloperProject.is_active == True)
    .all()
]
```

**Pour MONTHLY (lignes 320-326)** :
```python
# [STRICT MISSION FILTER - ENTERPRISE GRADE]
# On utilise get_developers_for_data_extraction pour l'extraction de données brutes
# SANS la règle RG-02 des 15 jours (règle de proratisation RH)
# La règle RG-02 est appliquée uniquement au niveau du calcul des KPIs
eligible_ids = get_developers_for_data_extraction(
    db=db,
    project_id=project.id,
    period_id=period.id,
    start_date=p_start.date(),
    end_date=p_end.date()
)
```

---

### ÉTAPE 4 : Récupération des données GitLab (Commits)

**Fichier** : `dataCollection/src/backend/app/services/extraction/gitlab_fetch_strategy.py`  
**Lignes** : 37-70  
**Fonction** : `fetch_unique_commits()`

#### 🎯 Objectif de cette étape
Récupérer tous les commits du projet depuis GitLab API pour la période définie.

#### 🔄 Relation avec les autres étapes
- **Entrée** : Les dates de l'ÉTAPE 2 (`since`, `until`)
- **Sortie** : Liste brute de tous les commits (non filtrés)
- **Utilisé par** : ÉTAPE 5 (filtrage chirurgical)

#### Ce qui se passe (en simple)
1. On appelle l'API GitLab avec les dates de l'ÉTAPE 2
2. On utilise `all=True` pour récupérer TOUS les commits (pas de filtre auteur)
3. On inclut les stats (additions/deletions) via `with_stats=True`

#### Pourquoi `all=True` ?
- L'API GitLab avec le paramètre `author` ne capture que les commits où l'auteur direct est spécifié
- Les commits individuels créés par un développeur mais mergés par d'autres ne seraient pas inclus
- Notre approche garantit 100% de couverture : on récupère tout, on filtre ensuite

**Code exact (lignes 58-69)** :
```python
logger.info(f"[DIAGNOSTIC API] Fetching ALL commits for project={gitlab_project_id} | {since} -> {until}")
logger.info(f"[DIAGNOSTIC API] Local filtering will be applied via _matches_target_devs")

# Toujours utiliser all=True pour capturer tous les commits (incluant ceux mergés)
commits = await client.get_project_commits(
    project_id=gitlab_project_id,
    ref_name=None,      # Toutes les branches
    since=since,
    until=until,
    with_stats=True,    # Inclut additions/deletions
)
logger.info(f"[DIAGNOSTIC API] Found {len(commits)} raw commits to analyze locally")
return commits
```

---

### ÉTAPE 5 : Filtrage chirurgical des commits

**Fichier** : `dataCollection/src/backend/app/services/extraction/extraction_service.py`  
**Lignes** : 520-712  
**Fonction** : `_extract_commits()`

#### 🎯 Objectif de cette étape
Appliquer plusieurs couches de filtrage pour ne garder que les commits pertinents.

#### 🔄 Relation avec les autres étapes
- **Entrée** : Commits bruts de l'ÉTAPE 4, développeurs de l'ÉTAPE 3, dates de l'ÉTAPE 2
- **Sortie** : Commits filtrés et persistés en base de données
- **Utilisé par** : ÉTAPE 7 (certification de l'intégrité)

#### Ce qui se passe (en simple - 4 couches de filtrage)

**Couche 1 : Déduplication**
- On vérifie si le commit existe déjà en base (par SHA)
- Si oui, on skip pour éviter les doublons

**Couche 2 : Filtrage temporel**
- On vérifie que la date du commit est dans la période (ÉTAPE 2)
- Utilise les dates `start` et `end` (inclusives)

**Couche 3 : Filtrage auteur**
- On vérifie que l'auteur du commit est dans la liste des développeurs cibles (ÉTAPE 3)
- Matching par : GitLab ID, email, ou username

**Couche 4 : Vérification mission**
- On vérifie que le développeur était en mission sur ce projet à cette date précise
- C'est le filtrage le plus strict : validation jour par jour

#### Pourquoi c'est important
- C'est le cœur de la logique métier : on ne compte que ce qui doit être compté
- Le filtrage mission jour par jour empêche de compter des commits hors mission
- La déduplication évite de polluer la base avec des doublons

**Sous-étape 5.1 : Construction de la map des développeurs (lignes 533-560)**
```python
# 🎯 STRATÉGIE SENIOR : Extraction Robuste
target_devs = []
target_devs_map = {}

# [SENIOR HARDENING - ENTERPRISE STRICT]
# On ne se contente plus de faire confiance à developer_ids.
certified_mission_ids = set(get_developers_for_data_extraction(
    db=db, project_id=project.id, period_id=lot.period_id
))

effective_ids = []
if developer_ids:
    effective_ids = [did for did in developer_ids if did in certified_mission_ids]
else:
    effective_ids = list(certified_mission_ids)

if not effective_ids:
    return 0

target_devs = db.query(Developer).filter(Developer.id.in_(effective_ids)).all()
target_devs_map = {d.id: d for d in target_devs}
```

**Sous-étape 5.2 : Pré-fetch des missions (lignes 581-588)**
```python
# [SENIOR] Pre-fetch mission dates for this project to enable Surgical Daily Precision
from app.models.developer_project import DeveloperProject
missions = db.query(DeveloperProject).filter(
    DeveloperProject.project_id == project.id,
    DeveloperProject.developer_id.in_(effective_ids),
    DeveloperProject.is_active == True
).all()
prefetched_missions = {m.developer_id: (m.start_date, m.end_date) for m in missions}
```

**Sous-étape 5.3 : Boucle de filtrage des commits (lignes 617-702)**
```python
created = skipped = 0
for commit_data in unique_commits:
    sha = commit_data.get("id")
    
    # [SENIOR] Déduplication globale par SHA pour ce projet
    if not sha or self.commit_repo.get_by_sha(db, sha, project.id):
        skipped += 1
        continue

    # [SENIOR] Filtre chirurgical : on valide la date de l'auteur
    if not is_in_period(commit_data.get("authored_date"), lot_start, lot_end):
        logger.debug(f"Filter Out: commit {sha[:8]} falls outside target period.")
        filtered_out_period += 1
        skipped += 1
        continue

    gitlab_id    = commit_data.get("author_id")
    author_email = commit_data.get("author_email")
    author_name  = commit_data.get("author_name")
    author_username = commit_data.get("author_username")

    # [STRICT TEAM ISOLATION] - LOGIQUE DURCIE (SENIOR)
    if not self._matches_target_devs(gitlab_id, author_name, author_email, target_devs_map):
        logger.debug(f"Filter Out (Non-Target): commit {sha[:8]} by {author_name} rejected.")
        filtered_out_dev += 1
        skipped += 1
        continue

    # [SENIOR FIX] Si la logique ciblée a déjà trouvé le dev via _matches_target_devs
    matched_dev = find_matched_target_dev(
        target_devs_map=target_devs_map,
        gitlab_id=gitlab_id,
        author_email=author_email,
        author_username=author_username,
    )
    
    if matched_dev:
        developer = matched_dev
    else:
        developer = self._resolve_developer(
            db=db,
            project_id=project.id,
            period_id=lot.period_id,
            email=author_email,
            name=author_name,
            gitlab_id=gitlab_id,
            username=author_username,
            members_map=members_map,
            forbid_creation=True 
        )

    if not developer:
        skipped += 1
        continue
        
    # [SENIOR] SURGICAL MISSION CHECK (Daily Precision)
    try:
        commit_dt = datetime.fromisoformat(commit_data.get("authored_date", "").replace("Z", "+00:00"))
        commit_date = commit_dt.date()
        
        # Check absolute RH + Project Mission dates
        if not is_project_contribution_certified(db, developer.id, project.id, commit_date, prefetched_missions):
            logger.warning(
                f"[SECURITY] Surgical: Commit {sha[:8]} rejected for {developer.name} "
                f"on project {project.name} (Date {commit_date} outside mission or contract)"
            )
            filtered_out_dev += 1
            skipped += 1
            continue
    except Exception as e:
        logger.error(f"Error during Surgical Mission check: {e}")
        
    # Mapping et persistance
    mapped = GitLabMapper.map_commit(
        data=commit_data,
        project_id=project.id,
        developer_id=developer.id,
        extraction_lot_id=lot.id,
    )
    self.commit_repo.create(db, mapped)
    created += 1
```

**Couches de filtrage (Defense in Depth)** :
1. **Déduplication** (ligne 620) : Évite les doublons dans la base
2. **Temporel** (ligne 626) : Garantit que le commit est dans la période
3. **Auteur** (ligne 639) : Vérifie que l'auteur est un développeur cible
4. **Mission** (ligne 678) : Valide que le développeur était en mission à cette date

---

### ÉTAPE 6 : Extraction des Merge Requests

**Fichier** : `dataCollection/src/backend/app/services/extraction/extraction_service.py`  
**Lignes** : 800-900 (approximatif - fonction `_extract_merge_requests`)

#### 🎯 Objectif de cette étape
Récupérer et filtrer les Merge Requests (MRs) du projet, en excluant les drafts.

#### 🔄 Relation avec les autres étapes
- **Entrée** : Dates de l'ÉTAPE 2, développeurs de l'ÉTAPE 3
- **Sortie** : MRs filtrés et persistés en base
- **Parallèle à** : ÉTAPE 5 (commits) - s'exécute en même temps

#### Ce qui se passe (en simple)
1. On récupère les MRs via API GitLab avec les dates de l'ÉTAPE 2
2. On filtre les MRs draft (work in progress)
3. On vérifie que l'auteur/reviewer/assignee est un développeur cible
4. On récupère les approbations pour chaque MR
5. On mappe et persiste en base

#### Pourquoi c'est important
- Les MRs draft ne doivent pas être comptés dans les KPI
- Le filtrage auteur/reviewer/assignee garantit qu'on ne compte que les MRs de l'équipe
- Les approbations sont nécessaires pour calculer le temps de review

**Code typique de l'extraction MR** :
```python
async def _extract_merge_requests(self, db, project, lot, client, developer_ids):
    # Récupération des MRs via API GitLab
    mrs = await client.get_project_merge_requests(
        project_id=project.gitlab_project_id,
        created_after=since,      # "2024-01-01T00:00:00Z"
        created_before=until,     # "2024-02-01T00:00:00Z"
        state="all",              # Inclut opened, closed, merged
    )

    for mr_data in mrs:
        # 1. Filtre draft
        is_draft = (
            mr_data.get("work_in_progress", False) or
            mr_data.get("draft", False) or
            title.upper().startswith(("DRAFT:", "WIP:"))
        )
        if is_draft:
            continue
        
        # 2. Filtre auteur
        if not mr_matches_target_devs(mr_data, target_devs_map):
            continue
        
        # 3. Récupération des approbations
        approvals = await client.get_merge_request_approvals(
            project_id, mr_iid
        )
        
        # 4. Mapping et persistance
        mapped = GitLabMapper.map_merge_request(
            data=mr_data,
            project_id=project.id,
            developer_id=developer.id,
            extraction_lot_id=lot.id,
            approvals_data=approvals,
        )
        self.mr_repo.create(db, mapped)
```

---

### ÉTAPE 7 : Certification de l'intégrité (Integrity Guardian)

**Fichier** : `dataCollection/src/backend/app/services/extraction/extraction_service.py`  
**Lignes** : 713-760+  
**Fonction** : `_certify_lot_commits()`

#### 🎯 Objectif de cette étape
Garantir que 100% des commits éligibles sont rattachés au lot d'extraction, même si l'identification a échoué pendant l'extraction brute.

#### 🔄 Relation avec les autres étapes
- **Entrée** : Commits de l'ÉTAPE 5, développeurs de l'ÉTAPE 3, dates de l'ÉTAPE 2
- **Sortie** : Commits rattachés au lot (mise à jour du champ `extraction_lot_id`)
- **Position** : Étape finale de vérification après toutes les extractions

#### Ce qui se passe (en simple)
1. On récupère TOUS les commits du projet sur la période (même ceux non-liés au lot)
2. Pour chaque commit, on vérifie si l'auteur était en mission à cette date
3. Si oui, on rattache le commit au lot d'extraction actuel

#### Pourquoi cette étape est cruciale
- L'extraction brute peut manquer des identifications (email changé, username modifié)
- Cette certification post-extraction garantit que 100% des commits éligibles sont rattachés au bon lot
- C'est le "garde-fou" de l'intégrité des données

**Code exact (lignes 527-580)** :
```python
def _certify_lot_commits(self, db: Session, lot, project, developer_ids: Optional[List[int]], start_date: datetime, end_date: datetime):
    """
    ✅ [SENIOR++++] THE GUARDIAN OF INTEGRITY
    Certifie et ancre tous les commits du projet à ce lot si l'auteur fait partie de la mission.
    Cette méthode répare les erreurs d'identification qui surviennent pendant l'extraction brute.
    """
    from app.models.commit import Commit
    from app.models.developer import Developer
    from app.services.extraction.developer_identity import resolve_developer_id_fuzzy

    # [STRICT MISSION VALIDATION]
    certified_mission_ids = set(get_developers_for_data_extraction(
        db=db, project_id=project.id, period_id=lot.period_id
    ))
    
    effective_ids = developer_ids if developer_ids else list(certified_mission_ids)
    effective_ids = [did for did in effective_ids if did in certified_mission_ids]

    if not effective_ids:
        logger.warning(f"[lot={lot.id}] No certified developers for certification. Skipping.")
        return

    # 1. Identifier tous les développeurs valides pour cette mission (RH Source of Truth)
    mission_devs = db.query(Developer).filter(Developer.id.in_(effective_ids)).all()
    
    # 2. Scanner TOUS les commits du projet sur la période (même ceux non-liés)
    commits = db.query(Commit).filter(
        Commit.project_id == project.id,
        Commit.authored_date >= start_date,
        Commit.authored_date <  end_date,
        Commit.is_merge_commit == False
    ).all()

    from app.utils.mission_utils import is_project_contribution_certified
    
    # [SENIOR] Pre-fetch mission dates for this project
    from app.models.developer_project import DeveloperProject
    missions = db.query(DeveloperProject).filter(
        DeveloperProject.project_id == project.id,
        DeveloperProject.developer_id.in_(effective_ids),
        DeveloperProject.is_active == True
    ).all()
    prefetched_missions = {m.developer_id: (m.start_date, m.end_date) for m in missions}

    count = 0
    for c in commits:
        # Vérification de la mission pour chaque commit
        if is_project_contribution_certified(db, c.developer_id, project.id, c.authored_date.date(), prefetched_missions):
            # Ancrer le commit au lot
            c.extraction_lot_id = lot.id
            count += 1
    
    logger.info(f"[lot={lot.id}] Certified {count} commits to this lot")
```

---

## 🔄 Synthèse des relations entre les étapes

### Flux de données global

```
ÉTAPE 1 (Lancement)
    ↓ Crée: ExtractionLot
    ↓ Déclenche: ÉTAPE 2

ÉTAPE 2 (Fenêtre temporelle)
    ↓ Sortie: since, until, start, end
    ↓ Utilisé par: ÉTAPE 4, ÉTAPE 5

ÉTAPE 3 (Développeurs cibles)
    ↓ Sortie: Liste de developer_ids
    ↓ Utilisé par: ÉTAPE 5, ÉTAPE 6, ÉTAPE 7

ÉTAPE 4 (Récupération GitLab)
    ↓ Sortie: Commits bruts
    ↓ Utilisé par: ÉTAPE 5

ÉTAPE 5 (Filtrage chirurgical)
    ↓ Sortie: Commits filtrés en BDD
    ↓ Utilisé par: ÉTAPE 7

ÉTAPE 6 (MRs)
    ↓ Sortie: MRs filtrés en BDD
    ↓ Parallèle à: ÉTAPE 5

ÉTAPE 7 (Certification)
    ↓ Sortie: Commits rattachés au lot
    ↓ Final: Intégrité garantie
```

### Dépendances clés

| Étape | Dépend de | Produit pour |
|-------|-----------|--------------|
| 1 | - | 2, 3, 4, 5, 6, 7 (via ExtractionLot) |
| 2 | 1 (période) | 4, 5 (dates) |
| 3 | 1 (projet), 2 (période) | 5, 6, 7 (developer_ids) |
| 4 | 2 (dates) | 5 (commits bruts) |
| 5 | 2 (dates), 3 (devs), 4 (commits) | 7 (commits en BDD) |
| 6 | 2 (dates), 3 (devs) | - (MRs en BDD) |
| 7 | 2 (dates), 3 (devs), 5 (commits) | - (intégrité finale) |

### Points de contrôle qualité

1. **Après ÉTAPE 1** : Lot d'extraction créé, traçabilité activée
2. **Après ÉTAPE 2** : Dates calculées correctement (API vs local)
3. **Après ÉTAPE 3** : Développeurs identifiés et certifiés
4. **Après ÉTAPE 4** : Données brutes récupérées de GitLab
5. **Après ÉTAPE 5** : Commits filtrés et persistés
6. **Après ÉTAPE 6** : MRs filtrés et persistés
7. **Après ÉTAPE 7** : Intégrité certifiée, 100% des commits éligibles rattachés

---

## Fichiers clés et leurs responsabilités

### 1. `extraction_service.py` - L'orchestrateur principal

**Responsabilité** : Coordinateur du workflow d'extraction complet

**Fonctions clés** :
- `run_realtime_extraction()` : Point d'entrée pour une extraction
- `_extract_data()` : Coordination extraction commits + MRs
- `_extract_commits_for_lot()` : Extraction et filtrage des commits
- `_extract_merge_requests_for_lot()` : Extraction et filtrage des MRs
- `_certify_lot_commits()` : Certification de l'intégrité des données

**Logs de progression** :
```python
self._update_lot_progress(db, lot, 10, "Initialisation de la connexion GitLab...")
self._update_lot_progress(db, lot, 20, "Extraction des Commits et Merge Requests...")
self._update_lot_progress(db, lot, 80, "Certification des données...")
```

### 2. `gitlab_client.py` - Client API GitLab

**Responsabilité** : Communication avec l'API GitLab REST v4

**Fonctions clés** :
- `get_project_commits()` : Récupération des commits avec pagination
- `get_merge_requests()` : Récupération des MRs avec filtres
- `get_merge_request_approvals()` : Récupération des approbations
- `get_project_members_with_emails()` : Récupération des membres du projet

**Caractéristiques** :
- Pagination automatique (200 résultats par page)
- Retry automatique (3 tentatives pour erreurs réseau)
- Gestion du rate-limiting (respecte Retry-After)
- Chiffrement des tokens (AES via security.py)

### 3. `gitlab_mapper.py` - Mapping des données

**Responsabilité** : Transformation des données GitLab vers les modèles BDD

**Fonctions clés** :
- `map_project()` : Mapping des données projet
- `map_developer()` : Mapping des données développeur
- `map_commit()` : Mapping des données commit
- `map_merge_request()` : Mapping des données MR

**Exemple de mapping commit** :
```python
def map_commit(data, project_id, developer_id, extraction_lot_id):
    return {
        "gitlab_commit_id": data["id"],
        "title": data["message"].split("\n", 1)[0],
        "authored_date": parse_dt(data["authored_date"]),
        "additions": data.get("stats", {}).get("additions", 0),
        "deletions": data.get("stats", {}).get("deletions", 0),
        "is_merge_commit": detect_merge_commit(data["message"]),
        "project_id": project_id,
        "developer_id": developer_id,
        "extraction_lot_id": extraction_lot_id,
    }
```

### 4. `extraction_filters.py` - Filtres métier

**Responsabilité** : Fonctions de filtrage réutilisables

**Fonctions clés** :
- `build_period_window()` : Définition des bornes temporelles
- `is_in_period()` : Vérification d'appartenance à une période
- `find_matched_target_dev()` : Matching rapide d'auteur
- `mr_matches_target_devs()` : Vérification MR auteur/reviewer/assignee
- `build_target_vectors()` : Construction de vecteurs d'identité

### 5. `kpi_calculator.py` - Calcul des KPI

**Responsabilité** : Calcul des indicateurs de performance

**Fonctions clés** :
- `calculate_for_site()` : Calcul KPI par site
- `calculate_for_group()` : Calcul KPI par groupe
- `calculate_for_developer()` : Calcul KPI par développeur
- `calculate_developer_score()` : Score composite développeur

---

## Calcul des KPI - DÉTAILLÉ AVEC CODE

### Point d'entrée principal du calcul

**Fichier** : `dataCollection/src/backend/app/services/kpi/kpi_calculator.py`
**Fonction** : `calculate_project_kpis()` (lignes 96-183)

Cette fonction centralisée calcule tous les KPI pour un projet sur une période donnée, avec filtrage optionnel par site, groupe ou développeur.

**Code d'entrée (lignes 96-117)** :
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

    # Collaboration KPIs
    nb_comments        = self._count_comments(project_id, start_date, end_date, developer_id)
    nb_reviews         = self._count_reviews_involved(project_id, start_date, end_date, developer_id)

    # Draft merge requests (work in progress)
    nb_mrs_draft       = self._count_draft_mrs(project_id, start_date, end_date, site_id, group_id, developer_id, eligible_ids)

    # Additional engineering KPIs
    bus_factor         = self._calculate_bus_factor(project_id, start_date, end_date)
    sprint_velocity    = self._calculate_sprint_velocity(project_id, start_date, end_date, developer_id)
    code_churn_rate    = self._calculate_code_churn(project_id, start_date, end_date, developer_id)

    # DORA METRICS (Standard Google Research)
    deployment_count   = self._count_deployments(project_id, start_date, end_date, site_id, group_id, developer_id, eligible_ids)
    lead_time_hours    = self._avg_lead_time(project_id, start_date, end_date, site_id, group_id, developer_id, eligible_ids)

    # KPI #8: Commits moyen par MR (complexité des MRs)
    sum_commits_in_mrs = self._sum_commits_in_mrs(project_id, start_date, end_date, site_id, group_id, developer_id, eligible_ids)
```

### Helper central : Identification des développeurs actifs

**Fichier** : `kpi_calculator.py`
**Fonction** : `_active_dev_ids_query()` (lignes 189-269)

Cette fonction est utilisée par toutes les fonctions de comptage pour identifier les développeurs éligibles selon les filtres (projet, site, groupe, développeur).

**Code (lignes 189-241)** :
```python
def _active_dev_ids_query(self, project_id: int, start_date: datetime, end_date: datetime, site_id: Optional[int], group_id: Optional[int], developer_id: Optional[int], eligible_ids: Optional[list] = None):
    """
    [SENIOR] Retourne les IDs de développeurs ASSIGNÉS pour cette période.
    Optimisé : Utilise une sous-requête SQL au lieu d'une liste d'IDs Python.
    """
    if eligible_ids is not None:
        # Si les IDs sont déjà matérialisés, on les utilise directement
        q = self.db.query(Developer.id).filter(
            Developer.id.in_(eligible_ids)
        )
    else:
        # Mise en cache de la requête de base pour éviter de la reconstruire 7x
        cache_key = (project_id, start_date, end_date)
        if not hasattr(self, '_base_mission_query_cache'):
            self._base_mission_query_cache = {}
        
        if cache_key not in self._base_mission_query_cache:
            # Résolution de la période pour le scoping temporel strict
            period = self.db.query(Period).filter(
                Period.year == start_date.year,
                Period.month == start_date.month
            ).first()

            # Calcul du mois suivant sans dépendance externe
            next_month = start_date.month + 1
            next_year = start_date.year
            if next_month > 12:
                next_month = 1
                next_year += 1
            end_date_month = datetime(next_year, next_month, 1)

        # SQL Composition : on récupère une QUERY, pas une LISTE
            from app.utils.mission_utils import get_certified_developers_query
            period_id = period.id if period else None
            subq = get_certified_developers_query(
                db=self.db, project_id=project_id, period_id=period_id,
                start_date=start_date.date(), end_date=end_date_month.date()
            ).subquery()
            self._base_mission_query_cache[cache_key] = subq

        mission_subq = self._base_mission_query_cache[cache_key]
        # Utilisation de .c.id pour être explicite sur la colonne de la subquery
        # Ajout de .distinct() pour éviter les doublons si un dev a plusieurs missions
        # RG-02 threshold via get_rg02_threshold() — Source de Vérité Unique
        threshold_date = get_rg02_threshold(start_date.year, start_date.month)

        q = self.db.query(Developer.id).distinct().filter(
            Developer.id.in_(select(mission_subq.c.id)),
            # Respect strict des dates contractuelles RH + Règle des 15 jours
            or_(Developer.onboarding_date.is_(None), Developer.onboarding_date < end_date.date()),
            or_(Developer.offboarding_date.is_(None), Developer.offboarding_date >= threshold_date)
        )

    # Respect strict des dates d'affectation (SCD Type 2)
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
        # SCD Type 2 Robust Intersection
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

---

### KPI 1 : MR Rate par site

**Formule** : `NB MRs créés (non draft) durant le mois / Nombre de développeurs du site`

**Implémentation** : `kpi_calculator.py` (lignes 400-458)

**Fonction de comptage** : `_count_mrs()` (lignes 400-458)
```python
def _count_mrs(
    self, project_id: int, start_date: datetime, end_date: datetime,
    site_id: Optional[int], group_id: Optional[int], developer_id: Optional[int],
    eligible_ids: Optional[list] = None,
) -> int:
    """
    ✅ [SENIOR++++] MR counting bound to Extraction Lots AND Mission Active.
    
    ⚠️ [RG-02 BUG] Cette fonction N'APPLIQUE PAS la règle RG-02 aux MR individuels.
    Pour corriger ce bug, utiliser la fonction utilitaire is_mr_certified_for_period()
    pour filtrer chaque MR selon la règle des 15 jours.
    """
    valid_ids = self._active_dev_ids_query(project_id, start_date, end_date, site_id, group_id, developer_id, eligible_ids).subquery()
    
    period = self.db.query(Period).filter(Period.year == start_date.year, Period.month == start_date.month).first()
    lot_ids = [r[0] for r in self.db.query(ExtractionLot.id).filter(
        ExtractionLot.period_id == period.id, ExtractionLot.project_id == project_id
    ).all()] if period else []

    # DISTINCT sur MergeRequest.id pour éviter le doublon quand un dev a plusieurs segments developer_site
    q = self.db.query(func.count(func.distinct(MergeRequest.id))).join(
        DeveloperProject,
        (DeveloperProject.developer_id == MergeRequest.developer_id) &
        (DeveloperProject.project_id   == MergeRequest.project_id)
    ).filter(
        MergeRequest.project_id == project_id,
        MergeRequest.is_draft.is_(False),
    )

    q = q.filter(MergeRequest.created_at_gitlab >= start_date, MergeRequest.created_at_gitlab < end_date)
    if lot_ids:
        q = q.filter(MergeRequest.extraction_lot_id.in_(lot_ids))

    q = q.filter(
        MergeRequest.developer_id.in_(select(valid_ids.c.id))
    )

    if site_id:
        q = q.join(
            DeveloperSite,
            (DeveloperSite.developer_id == MergeRequest.developer_id) &
            (DeveloperSite.site_id == site_id) &
            (DeveloperSite.start_date <= func.date(MergeRequest.created_at_gitlab)) &
            (or_(DeveloperSite.end_date.is_(None), DeveloperSite.end_date >= func.date(MergeRequest.created_at_gitlab)))
        )

    if group_id:
        q = q.join(
            DeveloperGroupLink,
            (DeveloperGroupLink.developer_id == MergeRequest.developer_id) &
            (DeveloperGroupLink.group_id == group_id) &
            (DeveloperGroupLink.start_date <= func.date(MergeRequest.created_at_gitlab)) &
            (or_(DeveloperGroupLink.end_date.is_(None), DeveloperGroupLink.end_date >= func.date(MergeRequest.created_at_gitlab)))
        )

    return q.scalar() or 0
```

**Calcul du taux (ligne 139)** :
```python
mr_rate_per_site = round(nb_mrs / denom, 4)  # denom = max(nb_devs, 1)
```

**Apport métier** : La comparaison avec la vélocité donne plus de visibilité sur la complexité des tickets.

---

### KPI 2 : Approved MR Rate par site

**Formule** : `NB MRs approuvés durant le mois / NB MRs créés (non draft) durant le mois`

**Implémentation** :

```python
def calculate_project_kpis(...):
    # 1. MRs approuvés
    nb_mrs_approved = self._count_approved_mrs(
        project_id, start_date, end_date,
        site_id=site_id
    )
    
    # 2. MRs créés (non-draft)
    nb_mrs = self._count_mrs(
        project_id, start_date, end_date,
        site_id=site_id
    )
    
    # 3. Taux d'approbation
    approved_mr_rate = nb_mrs_approved / nb_mrs if nb_mrs > 0 else 0
```

**Fonction de comptage des MRs approuvés** :
```python
def _count_approved_mrs(self, project_id, start_date, end_date, site_id, ...):
    q = self.db.query(MergeRequest).filter(
        MergeRequest.project_id == project_id,
        MergeRequest.is_draft.is_(False),
        MergeRequest.approved.is_(True),              # Approuvé uniquement
        MergeRequest.created_at_gitlab >= start_date,
        MergeRequest.created_at_gitlab < end_date,
    )
    
    # Même logique de filtrage par site et RG-02
    # ...
    
    return len(certified_mr_ids)
```

**Détection de l'approbation** : `gitlab_mapper.py`
```python
def map_merge_request(data, ..., approvals_data):
    approved = False
    approved_at = None
    
    if approvals_data:
        approved_by = approvals_data.get("approved_by") or []
        if approved_by:
            approved = True
            # Prendre la date d'approbation la plus récente
            timestamps = [approval.get("approved_at") for approval in approved_by]
            approved_at = max([parse_dt(ts) for ts in timestamps if ts])
    
    # Fallback : si le MR est mergé, il était approuvé
    if not approved and merged_at:
        approved = True
        approved_at = merged_at
```

**Apport métier** : Donne une idée sur la qualité du code et aide à identifier les revues de code bloquées.

---

### KPI 3 : Merged MR Rate par site

**Formule** : `NB MRs mergés durant le mois / NB MRs approuvés durant le mois`

**Implémentation** :

```python
def calculate_project_kpis(...):
    # 1. MRs mergés
    nb_mrs_merged = self._count_merged_mrs(
        project_id, start_date, end_date,
        site_id=site_id
    )
    
    # 2. MRs approuvés
    nb_mrs_approved = self._count_approved_mrs(
        project_id, start_date, end_date,
        site_id=site_id
    )
    
    # 3. Taux de merge
    merged_mr_rate = nb_mrs_merged / nb_mrs_approved if nb_mrs_approved > 0 else 0
```

**Fonction de comptage des MRs mergés** :
```python
def _count_merged_mrs(self, project_id, start_date, end_date, site_id, ...):
    q = self.db.query(MergeRequest).filter(
        MergeRequest.project_id == project_id,
        MergeRequest.is_draft.is_(False),
        MergeRequest.merged_at.isnot(None),             # Mergé uniquement
        MergeRequest.created_at_gitlab >= start_date,
        MergeRequest.created_at_gitlab < end_date,
    )
    
    # Même logique de filtrage par site et RG-02
    # ...
    
    return len(certified_mr_ids)
```

**Apport métier** : Donne une idée sur la contribution de l'équipe dans les livraisons projets.

---

### KPI 4 : Commit Rate par site

**Formule** : `NB commits durant le mois / Nombre de développeurs du site`

**Implémentation** :

```python
def calculate_project_kpis(...):
    # 1. Commits des développeurs du site
    nb_commits_devs = self._count_commits_by_devs(
        project_id, start_date, end_date,
        site_id=site_id
    )
    
    # 2. Nombre de développeurs
    nb_devs = self._count_developers(
        project_id, start_date, end_date,
        site_id=site_id
    )
    
    # 3. Taux de commits
    commit_rate_per_site = nb_commits_devs / nb_devs if nb_devs > 0 else 0
```

**Fonction de comptage des commits** :
```python
def _count_commits_by_devs(self, project_id, start_date, end_date, site_id, ...):
    q = self.db.query(Commit).filter(
        Commit.project_id == project_id,
        Commit.is_merge_commit.is_(False),              # Exclut les merges automatiques
        Commit.authored_date >= start_date,
        Commit.authored_date < end_date,
    )
    
    # Jointure avec DeveloperSite pour le filtrage par site
    if site_id:
        q = q.join(DeveloperSite,
            (DeveloperSite.developer_id == Commit.developer_id) &
            (DeveloperSite.site_id == site_id) &
            (DeveloperSite.start_date <= func.date(Commit.authored_date)) &
            (or_(DeveloperSite.end_date.is_(None), 
                 DeveloperSite.end_date >= func.date(Commit.authored_date)))
        )
    
    return q.count()
```

**Apport métier** : Permet de repérer les MR complexes qui nécessitent parfois une division en sous-tâches.

---

### KPI 5 : NB commit par project Gitlab

**Formule** : `Somme de tous les commits créés dans un projet Gitlab durant le mois`

**Implémentation** :

```python
def calculate_project_kpis(...):
    # Commits TOTAUX du projet (tous développeurs, tous sites)
    nb_commits_project = self._count_all_project_commits(
        project_id, start_date, end_date,
        site_id=site_id  # Optionnel : si spécifié, filtre par site
    )
```

**Fonction de comptage** :
```python
def _count_all_project_commits(self, project_id, start_date, end_date, site_id=None):
    q = self.db.query(Commit).filter(
        Commit.project_id == project_id,
        Commit.is_merge_commit.is_(False),
        Commit.authored_date >= start_date,
        Commit.authored_date < end_date,
    )
    
    # Si site_id est spécifié, on filtre par site
    if site_id:
        q = q.join(DeveloperSite,
            (DeveloperSite.developer_id == Commit.developer_id) &
            (DeveloperSite.site_id == site_id) &
            (DeveloperSite.start_date <= func.date(Commit.authored_date)) &
            (or_(DeveloperSite.end_date.is_(None), 
                 DeveloperSite.end_date >= func.date(Commit.authored_date)))
    
    return q.count()
```

**Apport métier** : Identifie les composants logiciels du middleware (les projets Gitlab) qui ont le taux de bugs le plus élevé.

---

### KPI 6 : Temps moyen de relecture de code par site

**Formule** : `Somme des durées (création → approbation) des MRs durant le mois / NB MRs approuvés durant le mois`

**Implémentation** :

```python
def calculate_project_kpis(...):
    # 1. Somme des temps de revue
    sum_review_time = self._sum_review_time(
        project_id, start_date, end_date,
        site_id=site_id
    )
    
    # 2. Nombre de MRs approuvés avec temps de revue
    nb_mrs_with_time = self._count_approved_mrs(
        project_id, start_date, end_date,
        site_id=site_id,
        with_time_only=True
    )
    
    # 3. Temps moyen
    avg_review_time_hours = sum_review_time / nb_mrs_with_time if nb_mrs_with_time > 0 else 0
```

**Calcul du temps de revue** : `gitlab_mapper.py`
```python
def map_merge_request(data, ..., approvals_data):
    approved_at = parse_dt(approvals_data.get("approved_at"))
    created_at = parse_dt(data.get("created_at"))
    
    if approved_at and created_at:
        delta = approved_at - created_at
        # Conversion en heures, avec protection contre les valeurs négatives
        review_time_hours = max(0.0, round(delta.total_seconds() / 3600, 2))
    
    return {
        "review_time_hours": review_time_hours,
        ...
    }
```

**Fonction de sommation** :
```python
def _sum_review_time(self, project_id, start_date, end_date, site_id, ...):
    q = self.db.query(func.sum(MergeRequest.review_time_hours)).filter(
        MergeRequest.project_id == project_id,
        MergeRequest.is_draft.is_(False),
        MergeRequest.review_time_hours.isnot(None),  # Uniquement les MRs avec temps
        MergeRequest.created_at_gitlab >= start_date,
        MergeRequest.created_at_gitlab < end_date,
    )
    
    # Même logique de filtrage par site et RG-02
    # ...
    
    result = q.scalar()
    return result if result else 0.0
```

**Apport métier** : Calcule le temps moyen réel de revue de code.

---

## Règles de filtrage et validation

### Règle RG-02 : Certification des contributions

**Objectif** : Garantir que seules les contributions effectuées pendant la mission sont comptabilisées.

**Implémentation** : `mission_utils.py` → `is_project_contribution_certified()`

```python
def is_project_contribution_certified(
    db, developer_id, project_id, contribution_date, prefetched_missions
):
    """
    Vérifie qu'un développeur était en mission sur un projet à une date donnée.
    
    Règles :
    1. Le développeur doit avoir une mission active sur le projet
    2. La date de contribution doit être dans la plage de mission
    3. La règle des 15 jours s'applique (tolérance avant/après mission)
    """
    # Récupération de la mission du développeur sur ce projet
    mission = prefetched_missions.get(developer_id)
    
    if not mission:
        return False
    
    start_date, end_date = mission
    
    # Application de la règle des 15 jours
    threshold = get_rg02_threshold(db, developer_id, project_id)
    
    # Vérification que la contribution est dans la plage élargie
    certified_start = start_date - timedelta(days=threshold)
    certified_end = end_date + timedelta(days=threshold)
    
    return certified_start <= contribution_date <= certified_end
```

**Pourquoi la règle des 15 jours ?**
- Permet de capturer les commits effectués juste avant le début officiel de mission
- Permet de capturer les commits effectués juste après la fin officielle de mission
- Configurable par projet/développeur via la table `rg02_threshold`

### Filtre temporel strict

**Fichier** : `extraction_filters.py` → `is_in_period()`

```python
def is_in_period(dt_str, start, end):
    """
    Vérifie qu'une datetime est strictement dans les bornes.
    
    Gère les fuseaux horaires et les formats ISO.
    """
    dt = datetime.fromisoformat(dt_str.replace("Z", "+00:00"))
    
    # Assure que les deux datetimes sont timezone-aware
    if dt.tzinfo is None:
        dt = dt.replace(tzinfo=timezone.utc)
    
    # Bornes inclusives avec petit buffer pour les edge cases
    return start <= dt <= end
```

### Filtre auteur (Zero Trust)

**Fichier** : `extraction_filters.py` → `find_matched_target_dev()`

```python
def find_matched_target_dev(target_devs_map, gitlab_id, author_email, author_username):
    """
    Matching rapide d'un auteur contre les développeurs cibles.
    
    Stratégie de matching multi-critères :
    1. GitLab User ID (le plus fiable)
    2. Email normalisé
    3. Username normalisé
    """
    for target_dev in target_devs_map.values():
        if (gitlab_id and gitlab_id == target_dev.gitlab_user_id):
            return target_dev
        if normalize_email(author_email) == normalize_email(target_dev.email):
            return target_dev
        if normalize_username(author_username) == normalize_username(target_dev.gitlab_username):
            return target_dev
    return None
```

### Détection des commits de merge

**Fichier** : `gitlab_mapper.py` → `map_commit()`

```python
def map_commit(data, ...):
    title = data.get("message", "").split("\n", 1)[0]
    title_lower = title.lower()
    
    # Détection des commits de merge automatiques
    is_merge_commit = (
        title_lower.startswith("merge branch") or
        title_lower.startswith("merge request") or
        title_lower.startswith("merged branch") or
        "merge remote-tracking branch" in title_lower
    )
    
    return {"is_merge_commit": is_merge_commit, ...}
```

**Pourquoi exclure les merges ?**
Les commits de merge sont générés automatiquement par Git lors du merge de branches. Ils ne représentent pas du travail de développement et fausseraient les KPI.

---

## Sécurité et intégrité des données

### 1. Traçabilité complète

Chaque extraction est identifiée par un `ExtractionLot` :
- ID unique
- Type (REALTIME, HISTORICAL)
- Période (année/mois)
- Projet
- Utilisateur déclencheur
- Statut (running, completed, failed)
- Progression (0-100%)
- Action en cours

### 2. Audit trail

**Fichier** : `audit_log_repository.py`

```python
self.audit_repo.log(
    db=db, 
    user_id=triggered_by_user, 
    action="LAUNCH_EXTRACTION",
    entity_type="ExtractionLot", 
    entity_id=lot.id,
    new_value={"extraction_type": "REALTIME", "project_id": project.id},
)
```

Toutes les actions sensibles sont loggées avec :
- Utilisateur
- Action
- Type d'entité
- ID de l'entité
- Ancienne valeur
- Nouvelle valeur

### 3. Chiffrement des tokens

**Fichier** : `gitlab_client.py` → `_decrypt_token()`

```python
@staticmethod
def _decrypt_token(token: str) -> str:
    """
    Déchiffre le token GitLab (AES via security.py).
    Fallback sur le token brut si le chiffrement n'est pas configuré.
    """
    try:
        from app.core.security import decrypt_token
        return decrypt_token(token)
    except Exception:
        logger.warning("decrypt_token unavailable — using raw token")
        return token
```

### 4. Gestion des erreurs API

**Fichier** : `gitlab_client.py` → `_request()`

```python
async def _request(self, method, endpoint, params, _retry=0):
    """
    Requête HTTP avec retries automatiques.
    
    Stratégie de retry :
    - Erreurs réseau : 3 retries avec backoff exponentiel
    - Erreurs 5xx : 3 retries avec backoff exponentiel
    - Rate limiting (429) : Respecte Retry-After header
    - Erreurs 4xx : Échec immédiat (erreur client)
    """
    try:
        async with httpx.AsyncClient(timeout=self.timeout) as client:
            response = await client.request(...)
    except (httpx.TimeoutException, httpx.ConnectError) as e:
        if _retry < 3:
            wait = 2 ** _retry
            await asyncio.sleep(wait)
            return await self._request(method, endpoint, params, _retry + 1)
        raise GitLabAPIError(f"Network error after 3 retries")
    
    # Gestion du rate limiting
    if response.status_code == 429:
        retry_after = int(response.headers.get("Retry-After", 60))
        await asyncio.sleep(retry_after)
        if _retry < 3:
            return await self._request(method, endpoint, params, _retry + 1)
        raise GitLabAPIError("Rate limit persistent after 3 retries")
```

### 5. Validation des périodes

**Fichier** : `extraction_service.py` → `run_realtime_extraction()`

```python
period = self.period_repo.get_or_create(db, now.year, now.month)

if not self.period_repo.is_open(db, period.id):
    raise HTTPException(
        status_code=409,
        detail=f"Period {period.year}/{period.month:02d} is closed (RG-01).",
    )
```

**Règle RG-01** : Une période fermée ne peut plus recevoir d'extractions. Cela garantit l'immutabilité des données historiques.

---

## Résumé du flux de travail

```
1. Lancement extraction
   ↓
2. Création ExtractionLot (traçabilité)
   ↓
3. Définition fenêtre temporelle (build_period_window)
   ↓
4. Identification développeurs cibles (eligible_dev_ids)
   ↓
5. Récupération données GitLab (GitLabClient)
   ├─ Commits (toutes branches)
   └─ Merge Requests (MRs)
   ↓
6. Filtrage chirurgical (Defense in Depth)
   ├─ Déduplication
   ├─ Filtre temporel (is_in_period)
   ├─ Filtre auteur (Zero Trust)
   └─ Validation mission (RG-02)
   ↓
7. Mapping des données (GitLabMapper)
   ├─ map_commit
   └─ map_merge_request
   ↓
8. Persistance en BDD
   ├─ Commits
   └─ MergeRequests
   ↓
9. Certification intégrité (_certify_lot_commits)
   ↓
10. Calcul des KPI (KpiCalculator)
    ├─ MR Rate par site
    ├─ Approved MR Rate par site
    ├─ Merged MR Rate par site
    ├─ Commit Rate par site
    ├─ NB commit par project
    └─ Temps moyen de relecture
```

---

## Points clés à retenir pour la réunion

### 1. Fiabilité des données
- **Double validation** : Filtre API + Filtre local
- **Certification post-extraction** : Répare les erreurs d'identification
- **Règle RG-02** : Garantit que seules les contributions de mission sont comptées

### 2. Performance
- **Pagination optimisée** : 200 résultats par page
- **Préfetching** : Membres du projet chargés en une fois
- **Matching rapide** : Map des développeurs cibles pour éviter les requêtes BDD

### 3. Sécurité
- **Zero Trust** : Seuls les développeurs assignés sont considérés
- **Chiffrement** : Tokens GitLab chiffrés (AES)
- **Audit trail** : Toutes les actions sont loggées
- **Périodes fermées** : Données historiques immuables (RG-01)

### 4. Flexibilité
- **Multi-niveaux** : KPI par site, groupe, développeur, global
- **Configurable** : Seuils RG-02 par projet/développeur
- **Extensible** : Architecture modulaire pour ajouter de nouveaux KPI

### 5. Observabilité
- **Progression en temps réel** : UI feedback pendant l'extraction
- **Logs détaillés** : Chaque étape est loggée
- **Métriques API** : Nombre d'appels, retries, erreurs

---

## Agrégation des KPI - Snapshots mensuels

### Point d'entrée principal

**Fichier** : `dataCollection/src/backend/app/services/kpi/kpi_aggregator.py`
**Fonction** : `generate_monthly_snapshots()` (lignes 39-203)

Cette fonction est le cœur de l'agrégation des KPI. Elle génère des snapshots pour 4 niveaux :
1. **Par site** - Un snapshot par site associé au projet
2. **Global** - Agrégat tous sites confondus
3. **Par groupe** - Un snapshot par groupe de développeurs
4. **Par développeur** - Un snapshot par développeur avec score et classement

**Code d'entrée (lignes 39-68)** :
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
    """
    # Résolution de la plage de dates du mois
    start_date, end_date = get_period_date_range_exclusive(year, month)

    period = self.period_repo.get_by_year_month(self.db, year, month)
    if not period:
        raise ValueError(f"Period {year}/{month:02d} not found")

    # Harmonisation Mission-Strict (FIX 1: Matérialisation unique)
    eligible_ids = get_certified_developers_for_mission(
        db=self.db, project_id=project_id, period_id=period.id,
        start_date=start_date.date(), end_date=end_date.date()
    )
```

### Étape 1 : Nettoyage des snapshots périmés

**Fichier** : `kpi_aggregator.py`
**Lignes** : 70-83

```python
# Nettoyage des snapshots agrégés périmés (site / global / groupe)
self.db.query(KpiSnapshot).filter(
    KpiSnapshot.project_id   == project_id,
    KpiSnapshot.period_id    == period.id,
    KpiSnapshot.developer_id.is_(None),   # site, global et groupe uniquement
).delete(synchronize_session=False)
self.db.flush()

# Élagage des snapshots de développeurs obsolètes (SCD Type 2 Rebalancing)
self._prune_stale_developer_snapshots(project_id, period.id, eligible_ids)
```

**Pourquoi ce nettoyage ?**
- Évite l'accumulation de snapshots en doublon
- Supprime les snapshots de développeurs qui ont changé de site
- Garantit la cohérence temporelle (SCD Type 2)

### Étape 2 : Snapshot par site

**Fichier** : `kpi_aggregator.py`
**Lignes** : 87-113

```python
# Résolution des sites impactés pour cette période
project_site_ids = self._get_project_site_ids(project_id, period.id)

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

**Fonction helper** : `_get_project_site_ids()` (lignes 403-428)
- Priorité absolue : Configuration Admin (ProjectSite)
- Fallback historique : Via DeveloperSite pour compatibilité

### Étape 3 : Snapshot global

**Fichier** : `kpi_aggregator.py`
**Lignes** : 115-124

```python
# Snapshot global
global_kpis = self.calculator.calculate_global(project_id, start_date, end_date, eligible_ids=eligible_ids)
global_kpis["site_id"]      = None
global_kpis["developer_id"] = None

global_snapshot = self._upsert_with_deltas(
    kpis=global_kpis, period_id=period.id,
    year=year, month=month, lot_id=lot_id,
)
snapshots.append(global_snapshot)
```

### Étape 4 : Snapshot par groupe

**Fichier** : `kpi_aggregator.py`
**Lignes** : 126-144

```python
# Snapshot par groupe
project_group_ids = self._get_project_group_ids(project_id, period.id)
if project_group_ids:
    for group_id in project_group_ids:
        kpis = self.calculator.calculate_for_group(
            project_id, group_id, start_date, end_date, eligible_ids=eligible_ids
        )
        kpis["group_id"] = group_id
        snapshot = self._upsert_with_deltas(
            kpis=kpis, period_id=period.id,
            year=year, month=month, lot_id=lot_id,
        )
        snapshots.append(snapshot)
```

### Étape 5 : Snapshot par développeur avec classement

**Fichier** : `kpi_aggregator.py`
**Lignes** : 146-183

```python
# Récupération des objets Developer à partir des IDs matérialisés
developers = self.db.query(Developer).filter(Developer.id.in_(eligible_ids)).all()

# Collecter les snapshots individuels pour le classement par site
dev_snapshots_by_site: dict = {}  # site_id → [(score, snapshot)]

for developer in developers:
    dev_kpis = self.calculator.calculate_for_developer(
        project_id=project_id, developer_id=developer.id,
        start_date=start_date, end_date=end_date, eligible_ids=eligible_ids
    )

    primary_site_id = self._get_primary_site_for_developer(developer.id, period_date=start_date.date())
    primary_group_id = self._get_primary_group_for_developer(developer.id, period_date=start_date.date())
    
    dev_kpis["site_id"]      = primary_site_id
    dev_kpis["group_id"]     = primary_group_id
    dev_kpis["developer_id"] = developer.id

    snapshot = self._upsert_with_deltas(
        kpis=dev_kpis, period_id=period.id,
        year=year, month=month, lot_id=lot_id,
        developer_id=developer.id,
    )
    snapshots.append(snapshot)

    score = dev_kpis.get("developer_score", 0.0) or 0.0
    if primary_site_id is not None:
        dev_snapshots_by_site.setdefault(primary_site_id, []).append(
            (score, snapshot)
        )

# Calcul du classement dans chaque site
for site_id, score_snapshot_list in dev_snapshots_by_site.items():
    sorted_list = sorted(score_snapshot_list, key=lambda x: x[0], reverse=True)
    for rank, (_, snap) in enumerate(sorted_list, start=1):
        snap.score_rank_in_site = rank
```

### Étape 6 : Calcul des deltas (variation mensuelle)

**Fichier** : `kpi_aggregator.py`
**Fonction** : `_upsert_with_deltas()` (lignes 671-718)

```python
def _upsert_with_deltas(
    self,
    kpis:         dict,
    period_id:    int,
    year:         int,
    month:        int,
    lot_id:       Optional[int] = None,
    developer_id: Optional[int] = None,
) -> KpiSnapshot:
    snapshot = self._upsert_snapshot(kpis, period_id, year, month, lot_id, developer_id)

    # Récupération du snapshot du mois précédent
    prev_year, prev_month = (year - 1, 12) if month == 1 else (year, month - 1)
    prev_period = self.period_repo.get_by_year_month(self.db, prev_year, prev_month)

    if prev_period:
        prev_snapshot = self.snapshot_repo.get_for_period(
            db=self.db,
            project_id=kpis.get("project_id"),
            period_id=prev_period.id,
            site_id=kpis.get("site_id"),
            group_id=kpis.get("group_id"),
            developer_id=developer_id,
        )
        if prev_snapshot:
            # Calcul des deltas (variation mensuelle)
            snapshot.delta_mr_rate          = round(
                snapshot.mr_rate_per_site     - prev_snapshot.mr_rate_per_site,     4)
            snapshot.delta_approved_mr_rate = round(
                snapshot.approved_mr_rate     - prev_snapshot.approved_mr_rate,     4)
            snapshot.delta_merged_mr_rate   = round(
                snapshot.merged_mr_rate       - prev_snapshot.merged_mr_rate,       4)
            snapshot.delta_commit_rate      = round(
                snapshot.commit_rate_per_site - prev_snapshot.commit_rate_per_site, 4)
            snapshot.delta_nb_commits       = (
                snapshot.nb_commits_per_project - prev_snapshot.nb_commits_per_project
            )
            snapshot.delta_avg_review_time  = round(
                snapshot.avg_review_time_hours - prev_snapshot.avg_review_time_hours, 2)
```

**Deltas calculés :**
- `delta_mr_rate` - Variation du taux de MR
- `delta_approved_mr_rate` - Variation du taux d'approbation
- `delta_merged_mr_rate` - Variation du taux de merge
- `delta_commit_rate` - Variation du taux de commits
- `delta_nb_commits` - Variation du nombre de commits
- `delta_avg_review_time` - Variation du temps moyen de revue

---

## Glossaire technique

### Termes clés

- **ExtractionLot** : Lot d'extraction identifiant une session d'extraction (traçabilité)
- **KpiSnapshot** : Snapshot KPI stockant les indicateurs calculés pour une période
- **RG-02** : Règle métier des 15 jours de tolérance autour des dates de mission
- **RG-01** : Règle métier d'immutabilité des périodes fermées
- **SCD Type 2** : Slowly Changing Dimension Type 2 (gestion historique des affectations)
- **Defense in Depth** : Approche de sécurité avec plusieurs couches de validation
- **Zero Trust** : Principe de ne faire confiance à aucune donnée sans validation
- **Certification** : Processus post-extraction garantissant l'intégrité des données

### Modèles de données principaux

- **Commit** : Commit GitLab extrait (exclut les merges automatiques)
- **MergeRequest** : Merge Request GitLab avec métadonnées d'approbation
- **Developer** : Développeur avec identité GitLab et affectations RH
- **DeveloperProject** : Table M2M liant développeur et projet (mission)
- **DeveloperSite** : Table M2M liant développeur et site (affectation géographique)
- **DeveloperGroup** : Table M2M liant développeur et groupe (organisation)
- **Period** : Période temporelle (année/mois) pour le calcul des KPI
- **Project** : Projet GitLab avec configuration
- **Site** : Site géographique (ex: Paris, Lyon, Berlin)

### Fonctions utilitaires clés

- `build_period_window()` - Définition des bornes temporelles (extraction_filters.py:12)
- `is_in_period()` - Vérification d'appartenance à une période (extraction_filters.py:37)
- `find_matched_target_dev()` - Matching rapide d'auteur (extraction_filters.py:56)
- `is_project_contribution_certified()` - Certification RG-02 (mission_utils.py)
- `get_developers_for_data_extraction()` - Sélection développeurs éligibles (mission_utils.py)
- `get_certified_developers_for_mission()` - Développeurs certifiés pour mission (mission_utils.py)

### Patterns de conception

- **Repository Pattern** : Séparation logique d'accès aux données
- **Service Pattern** : Encapsulation de la logique métier
- **Mapper Pattern** : Transformation des données API vers modèles BDD
- **Strategy Pattern** : Différentes stratégies d'extraction (REALTIME vs MONTHLY)
- **Observer Pattern** : Auto-déclenchement des KPI après extraction

---

## Conclusion

Le système d'extraction GitLab est conçu avec une approche **Defense in Depth** :
- Plusieurs couches de filtrage pour garantir la précision
- Certification post-extraction pour réparer les erreurs
- Traçabilité complète pour l'audit
- Sécurité renforcée pour la protection des données

Les KPI calculés sont donc basés sur des données **fiables, précises et certifiées**, permettant une prise de décision éclairée pour la gestion des équipes de développement.

### Points clés à retenir

1. **Fiabilité des données** : Double validation (API + local) + certification post-extraction
2. **Performance** : Pagination optimisée, prefetching, matching rapide
3. **Sécurité** : Zero Trust, chiffrement AES, audit trail, périodes immuables
4. **Flexibilité** : Multi-niveaux (site/groupe/dev/global), seuils configurables
5. **Observabilité** : Progression temps réel, logs détaillés, métriques API
