# Documentation du Flux d'Extraction GitLab - Guide Explicatif pour Réunion

## Table des matières
1. [Vue d'ensemble du Flux d'Extraction](#vue-densemble-du-flux-dextraction)
2. [Flux d'Extraction depuis GitLab](#1-flux-dextraction-depuis-gitlab)
3. [Extraction Intelligente et Mutations des Développeurs](#2-extraction-intelligente-et-mutations-des-développeurs)
4. [Affichage des Merge Requests dans MergePage.jsx](#3-affichage-des-merge-requests-dans-mergepagejsx)
5. [Affichage des Commits dans CommitsPage.jsx](#4-affichage-des-commits-dans-commitpagejsx)

---

## Vue d'ensemble du Flux d'Extraction

```
Administrateur (Navigateur)
    ↓
Frontend : ExtractionLotsPage.jsx (déclenchement)
    ↓
Backend : api/routers/extraction.py (endpoint POST /extraction)
    ↓
Backend : services/extraction/extraction_service.py (run_realtime_extraction / run_monthly_extraction)
    ↓
Backend : services/gitlab/gitlab_client.py (API GitLab)
    ↓
GitLab API (récupération commits + MRs)
    ↓
Backend : services/extraction/extraction_service.py (_extract_commits / _extract_merge_requests)
    ↓
Backend : repositories (commit_repository.py / merge_request_repository.py)
    ↓
PostgreSQL (sauvegarde commits + MRs)
    ↓
Backend : services/kpi/kpi_aggregator.py (recalcul KPIs automatique)
    ↓
Frontend : MergePage.jsx (affichage MRs)
Frontend : CommitsPage.jsx (affichage commits)
```

---

## 1. Flux d'Extraction depuis GitLab

### Étape 1: Déclenchement de l'Extraction (Frontend)

**Fichier:** `dataCollection/src/frontend/src/pages/admin/ExtractionLotsPage.jsx` (non analysé mais similaire à ExtractionLotsPage)

**Objectif de cette étape:**
Permettre à l'administrateur de lancer une extraction GitLab pour un projet spécifique.

**Pourquoi c'est important:**
- Point d'entrée du flux d'extraction
- Permet de choisir le projet, la période, et le mode d'extraction (réelle vs mensuelle)

**Ce que fait cette étape:**
- L'admin sélectionne un projet et une période
- Envoie une requête POST à `/extraction` avec les paramètres (project_id, period_id, etc.)
- Le backend crée un "lot d'extraction" (ExtractionLot) pour suivre la progression

**Comment cette étape prépare la suivante:**
Le backend reçoit la demande et crée un lot d'extraction qui va orchestrer tout le processus.

**Code Backend (extraction.py):**
```python
@router.post("", response_model=ExtractionLotCreate, status_code=201)
async def trigger_extraction(
    payload: ExtractionLotCreate,
    db: Session = Depends(get_db),
    current_admin: AppUser = Depends(get_current_admin),
):
    # Validation
    config = config_repo.get_by_id(db, payload.gitlab_config_id)
    if not config or not config.is_active:
        raise HTTPException(400, "Configuration GitLab inactive.")

    # Création du lot d'extraction
    lot = ExtractionLot(
        extraction_type=payload.extraction_type,
        status=ExtractionStatusEnum.pending,
        period_id=payload.period_id,
        project_id=payload.project_id,
        triggered_by=current_admin.id,
    )
    db.add(lot)
    db.flush()

    # Lancement en arrière-plan
    asyncio.create_task(
        _background_extraction(
            lot_id=lot.id,
            gitlab_config_id=payload.gitlab_config_id,
            triggered_by_user=current_admin.id,
            gitlab_project_id=payload.gitlab_project_id,
            developer_ids=payload.developer_ids,
            fast_mode=payload.fast_mode,
            auto_target_by_period=payload.auto_target_by_period,
        )
    )

    return lot
```

---

### Étape 2: Extraction en Arrière-plan (Backend)

**Fichier:** `dataCollection/src/backend/app/api/routers/extraction.py`

**Lignes:** 49-150

**Objectif de cette étape:**
Exécuter l'extraction GitLab en arrière-plan pour ne pas bloquer l'interface utilisateur.

**Pourquoi c'est important:**
- Permet des extractions longues sans bloquer le navigateur
- Met à jour la progression en temps réel pour l'utilisateur
- Gère les erreurs de manière robuste

**Ce que fait cette étape:**
- Charge la configuration GitLab
- Identifie les projets à traiter
- Pour chaque projet:
  - Appelle `ExtractionService._extract_commits` (extraction des commits)
  - Appelle `ExtractionService._extract_merge_requests` (extraction des MRs)
  - Appelle `ExtractionService._relink_commits_to_developers` (réassociation)
  - Met à jour les métadonnées du projet
- Met à jour le statut du lot (running → completed ou failed)

**Comment cette étape prépare la suivante:**
Les commits et MRs sont créés en base de données avec les liens vers les développeurs.

**Code:**
```python
async def _background_extraction(
    lot_id: int,
    gitlab_config_id: int,
    triggered_by_user: int,
    gitlab_project_id: Optional[int] = None,
    developer_ids: Optional[List[int]] = None,
    fast_mode: bool = False,
    allowed_gitlab_project_ids: Optional[List[int]] = None,
    auto_target_by_period: bool = False,
):
    db = SessionLocal()
    _job_progress[lot_id] = {"step_index": 0, "step_label": "Connexion à GitLab…"}

    try:
        lot = db.query(ExtractionLot).filter(ExtractionLot.id == lot_id).first()
        
        # Intelligence système : ciblage automatique par période
        if auto_target_by_period:
            _, _, p_start, p_end = build_period_window(lot.period)
            eligible_devs = DeveloperRepository().get_active_during_period(
                db, p_start.date(), p_end.date()
            )
            developer_ids = [d.id for d in eligible_devs]

        # Liste des projets à traiter
        projects_to_process = []
        if gitlab_project_id:
            p = project_repo.get_by_gitlab_id(db, gitlab_project_id)
            if p: projects_to_process.append(p)
        else:
            projects_to_process = project_repo.get_by_gitlab_config(db, gitlab_config_id)

        service = ExtractionService()
        client = GitLabClient(gitlab_config)

        for idx, project in enumerate(projects_to_process):
            # Extraction des commits
            await service._extract_commits(db, project, lot, client, developer_ids=developer_ids, fast_mode=fast_mode)
            
            # Extraction des MRs
            await service._extract_merge_requests(db, project, lot, client, developer_ids=developer_ids, fast_mode=fast_mode)
            
            # Réassociation des commits orphelins
            relinked = service._relink_commits_to_developers(db, project.id)
            
            # Mise à jour des métadonnées
            service._update_project_last_commit(db, project.id)

        lot.status = ExtractionStatusEnum.completed
        lot.completed_at = datetime.now(timezone.utc)
        db.commit()
    except Exception as e:
        lot.status = ExtractionStatusEnum.failed
        lot.error_message = str(e)
        db.commit()
```

---

### Étape 3: Extraction des Commits (Backend)

**Fichier:** `dataCollection/src/backend/app/services/extraction/extraction_service.py`

**Lignes:** 520-710

**Objectif de cette étape:**
Récupérer les commits depuis GitLab pour le projet et la période spécifiés.

**Pourquoi c'est important:**
- C'est le cœur de l'extraction des données brutes
- Les commits sont la source de vérité pour les KPIs
- Permet d'analyser l'activité des développeurs

**Ce que fait cette étape:**
1. **Sélection intelligente des développeurs:**
   - Appelle `get_developers_for_data_extraction()` pour identifier les développeurs éligibles
   - Cette fonction utilise les missions (DeveloperProject), les sites (DeveloperSite), et les groupes (DeveloperGroupLink)
   - Applique les règles de cycle de vie RH (onboarding/offboarding)
   - NE PAS la règle des 15 jours (RG-02) pour l'extraction brute

2. **Pré-chargement des développeurs:**
   - Charge les développeurs éligibles en mémoire
   - Résout les IDs GitLab manquants via l'API GitLab
   - Pré-charge les membres du projet pour optimiser la résolution

3. **Récupération des commits depuis GitLab:**
   - Appelle `fetch_unique_commits()` via GitLab API
   - Pour chaque commit:
     - Vérifie qu'il n'existe pas déjà (déduplication par SHA)
     - Vérifie que la date du commit est dans la période cible (filtrage chirurgical)
     - Résout l'auteur du commit (par ID GitLab, email, username)
     - Applique le filtre "mission stricte" (vérifie que le dev était en mission à cette date)
     - Crée le commit en base de données avec le lien vers le développeur

4. **Certification des commits:**
   - Appelle `_certify_lot_commits()` pour réparer les erreurs d'identification
   - Associe tous les commits du projet à ce lot si l'auteur fait partie de la mission

**Comment cette étape prépare la suivante:**
Les commits sont maintenant en base de données avec les liens vers les développeurs, sites, et projets.

**Code:**
```python
async def _extract_commits(self, db, project, lot, client, developer_ids=None, fast_mode=False):
    # Sélection intelligente des développeurs
    certified_mission_ids = set(get_developers_for_data_extraction(
        db=db, project_id=project.id, period_id=lot.period_id
    ))
    effective_ids = [did for did in developer_ids if did in certified_mission_ids]
    
    target_devs = db.query(Developer).filter(Developer.id.in_(effective_ids)).all()
    target_devs_map = {d.id: d for d in target_devs}
    
    # Résolution des IDs GitLab manquants
    await self._ensure_developers_ids(db, target_devs, client)
    
    # Récupération des commits depuis GitLab
    since, until, lot_start, lot_end = build_period_window(lot.period)
    unique_commits = await fetch_unique_commits(
        client=client,
        gitlab_project_id=project.gitlab_project_id,
        since=since,
        until=until,
    )
    
    created = skipped = 0
    for commit_data in unique_commits:
        sha = commit_data.get("id")
        
        # Déduplication par SHA
        if not sha or self.commit_repo.get_by_sha(db, sha, project.id):
            skipped += 1
            continue
        
        # Filtre chirurgical : date de l'auteur
        if not is_in_period(commit_data.get("authored_date"), lot_start, lot_end):
            filtered_out_period += 1
            skipped += 1
            continue
        
        # Résolution de l'auteur
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
                db=db, project_id=project.id, period_id=lot.period_id,
                email=author_email, name=author_name,
                gitlab_id=gitlab_id, username=author_username,
                members_map=members_map,
                forbid_creation=True
            )
        
        if not developer:
            skipped += 1
            continue
        
        # Vérification chirurgicale de la mission (précision journalière)
        if not is_project_contribution_certified(db, developer.id, project.id, commit_date, prefetched_missions):
            logger.warning(f"[SECURITY] Commit {sha[:8]} rejected for {developer.name} on project {project.name}")
            skipped += 1
            continue
        
        # Création du commit
        mapped = GitLabMapper.map_commit(
            data=commit_data,
            project_id=project.id,
            developer_id=developer.id,
            extraction_lot_id=lot.id,
        )
        self.commit_repo.create(db, mapped)
        created += 1
    
    # Certification des commits
    self._certify_lot_commits(db, lot, project, effective_ids, lot_start, lot_endend)
    
    return len(lot.commits)
```

---

### Étape 4: Extraction des Merge Requests (Backend)

**Fichier:** `dataCollection/src/backend/app/services/extraction/extraction_service.py`

**Lignes:** 750-900 (approximatif)

**Objectif de cette étape:**
Récupérer les Merge Requests depuis GitLab pour le projet et la période spécifiés.

**Pourquoi c'est important:**
- Les MRs sont essentiels pour les KPIs (temps de revue, approbation, fusion)
- Permet d'analyser le processus de revue de code

**Ce que fait cette étape:**
1. Récupère les MRs depuis GitLab API
2. Pour chaque MR:
   - Résout l'auteur et le reviewer
   - Vérifie que le MR est dans la période cible
   - Vérifie que l'auteur est un développeur de la mission
   - Crée le MR en base de données avec les liens vers le développeur
3 - Met à jour les compteurs (commits_count, user_notes_count)

**Comment cette étape prépare la suivante:**
Les MRs sont maintenant en base de données et peuvent être affichés dans l'interface.

---

### Étape 5: Recalcul Automatique des KPIs

**Fichier:** `dataCollection/src/backend/app/services/extraction/extraction.py`

**Lignes:** 191-205 (realtime) et 389-403 (monthly)

**Objectif de cette étape:**
Déclencher automatiquement le recalcul des KPIs après une extraction réussie.

**Pourquoi c'est important:**
- Garantit que les KPIs sont toujours à jour après chaque extraction
- Évite les incohérences entre les données brutes et les KPIs
- Automatise un processus manuel fastidieux

**Ce que fait cette étape:**
- Appelle `KpiAggregator.generate_monthly_snapshots()`
- Recalcul les KPIs pour le projet, la période, et le lot d'extraction
- Sauvegarde les snapshots en base de données

**Comment cette étape prépare la suivante:**
Les KPIs sont maintenant à jour et peuvent être consultés dans l'interface d'analyse.

**Code:**
```python
# Après extraction réussie
try:
    from app.services.kpi.kpi_aggregator import KpiAggregator
    aggregator = KpiAggregator(db)
    aggregator.generate_monthly_snapshots(
        project_id=project.id,
        year=period.year,
        month=period.month,
        lot_id=lot.id
    )
    db.commit()
    logger.info(f"[AUTO-SNAPSHOT] Success for Project {project.id}")
except Exception as e:
    logger.error(f"[AUTO-SNAPSHOT] Failed for Project {project.id}: {e}")
```

---

## 2. Extraction Intelligente et Mutations des Développeurs

### Vue d'ensemble de l'Intelligence

```
Extraction Mensuelle
    ↓
Mission Utils (missionUtils.py)
    ↓
get_developers_for_data_extraction()
    ↓
Filtre TRIPLE :
  - DeveloperProject (mission projet)
  - DeveloperSite (affectation site)
  - DeveloperGroupLink (affectation groupe)
    ↓
Application des règles de cycle de vie RH
    ↓
Liste des développeurs éligibles pour l'extraction
```

---

### Étape 1: Sélection Intelligente des Développeurs

**Fichier:** `dataCollection/src/backend/app/utils/mission_utils.py`

**Lignes:** 300-404

**Objectif de cette étape:**
Identifier quels développeurs doivent être inclus dans l'extraction en fonction de leurs missions, sites, et groupes.

**Pourquoi c'est important:**
- Permet de cibler uniquement les développeurs qui étaient réellement présents
- Évite d'extraire des données pour des développeurs qui n'étaient pas en mission
- Gère les mutations (nouveau dev, mutation, archivage, désactivation, activation)

**Ce que fait cette étape:**
1. **Définition de la fenêtre temporelle:**
   - Calcule les dates de début et fin de la période (ex: 01/01/2025 → 01/02/2025)

2. **Filtre TRIPLE (SCD Type 2):**
   - **DeveloperProject:** Vérifie que le développeur a une mission active sur le projet
   - **DeveloperSite:** Vérifie que le développeur a une affectation site active couvrant la période
   - **DeveloperGroupLink:** Vérifie que le développeur a une affectation groupe active couvrant la période

3. **Application des règles de cycle de vie RH:**
   - `onboarding_date < end_date`: Le développeur a commencé avant la fin de la période
   - `offboarding_date >= start_date`: Le développeur n'est pas parti avant le début
   - `is_bot = False`: Exclut les bots automatiques

4. **SANS règle des 15 jours:**
   - Pour l'extraction, on extrait TOUS les commits pendant la période de mission réelle
   - La règle RG-02 (15 jours) est appliquée UNIQUEMENT au niveau du calcul des KPIs

**Comment cette étape prépare la suivante:**
La liste des développeurs éligibles est passée à l'extraction pour cibler les données GitLab.

**Code:**
```python
def get_developers_for_data_extraction(
    db: Session,
    project_id: int,
    period_id: Optional[int] = None,
    start_date: Optional[date] = None,
    end_date: Optional[date] = None,
    eligible_ids: Optional[List[int]] = None
) -> List[int]:
    """
    [DATA EXTRACTION ONLY] - SANS règle RG-02 des 15 jours
    Retourne les développeurs éligibles pour l'EXTRACTION de données GitLab brutes.
    """
    # Calcul de la fenêtre temporelle
    if not start_date or not end_date:
        period = db.query(Period).filter(Period.id == period_id).first()
        start_date = date(period.year, period.month, 1)
        end_date = date(period.year, period.month + 1, 1)

    # Filtre TRIPLE : Site + Groupe + Projet
    query = (
        db.query(Developer.id)
        .join(DeveloperProject, (DeveloperProject.developer_id == Developer.id) & (DeveloperProject.project_id == project_id))
        .join(DeveloperSite, (DeveloperSite.developer_id == Developer.id))
        .join(DeveloperGroupLink, (DeveloperGroupLink.developer_id == Developer.id))
        .filter(
            Developer.is_bot.is_(False),
            # Cycle de vie RH SANS règle des 15 jours
            or_(Developer.onboarding_date.is_(None), Developer.onboarding_date < end_date),
            or_(Developer.offboarding_date.is_(None), Developer.offboarding_date >= start_date),
            # Site SCD Type 2
            or_(DeveloperSite.start_date.is_(None), DeveloperSite.start_date < end_date),
            or_(DeveloperSite.end_date.is_(None), DeveloperSite.end_date >= start_date),
            # Groupe SCD Type 2
            or_(DeveloperGroupLink.start_date.is_(None), DeveloperGroupLink.start_date < end_date),
            or_(DeveloperGroupLink.end_date.is_(None), DeveloperGroupLink.end_date >= start_date),
        )
        .distinct()
    )

    # Mission spécifique au projet doit couvrir la période
    query = query.filter(
        or_(DeveloperProject.start_date.is_(None), DeveloperProject.start_date < end_date),
        or_(DeveloperProject.end_date.is_(None), DeveloperProject.end_date >= start_date)
    )
    
    return [row.id for row in query.all()]
```

---

### Étape 2: Gestion des Mutations de Développeurs

**Fichier:** `dataCollection/src/backend/app/utils/mission_utils.py`

**Lignes:** 164-198

**Objectif de cette étape:**
Vérifier qu'un développeur était en mission à une date spécifique pour un projet.

**Pourquoi c'est important:**
- Permet une précision chirurgicale (daily precision)
- Gère les mutations de développeurs (nouveau dev, mutation, archivage, désactivation, activation)
- Assure que seuls les commits valides sont comptés

**Ce que fait cette étape:**
1. Vérifie que le développeur est présent dans l'entreprise (RH globale)
2. Vérifie que le développeur a une mission active sur le projet à cette date
3 - Si `start_date` est renseigné: vérifie que la date de contribution >= start_date
   - Si `end_date` est renseigné: vérifie que la date de contribution <= end_date

**Comment cette étape prépare la suivante:**
Les commits sont filtrés pour ne compter que ceux valides selon la mission à cette date précise.

**Code:**
```python
def is_project_contribution_certified(
    db: Session,
    developer_id: int,
    project_id: int,
    contribution_date: date,
    prefetched_missions: Optional[Dict[int, Tuple[Optional[date], Optional[date]]] = None
) -> bool:
    """
    [SURGICAL DAILY PRECISION]
    Verifies if a contribution on a SPECIFIC project is authorized on a SPECIFIC day.
    """
    # 1. Vérification RH globale
    dev = db.query(Developer).get(developer_id)
    if not dev or not is_contribution_certified(dev, contribution_date):
        return False

    # 2. Vérification de la Mission spécifique au Projet
    if prefetched_missions and developer_id in prefetched_missions:
        start_dt, end_dt = prefetched_missions[developer_id]
        if start_dt and contribution_date < start_dt:
            return False
        if end_dt and contribution_date > end_dt:
            return False
        return True
    else:
        # Cherche un segment de mission (SCD Type 2) qui couvre la date de contribution
        assoc = db.query(DeveloperProject).filter(
            DeveloperProject.developer_id == developer_id,
            DeveloperProject.project_id   == project_id,
            DeveloperProject.start_date <= contribution_date,
            or_(DeveloperProject.end_date >= contribution_date, DeveloperProject.end_date.is_(None))
        ).first()
        return assoc is not None
```

---

### Étape 3: Résolution des Identités des Auteurs

**Fichier:** `DataCollection/src/backend/app/services/extraction/developer_identity.py`

**Lignes:** 109-242

**Objectif de cette étape:**
Identifier quel développeur correspond à un auteur de commit GitLab (par ID GitLab, email, username).

**Pourquoi c'est important:**
- GitLab peut avoir des formats différents pour les identifiants
- Les développeurs peuvent avoir changé d'email ou de username
- Permet de gérer les nouveaux développeurs automatiquement si nécessaire

**Ce que fait cette étape:**
1. **Recherche par ID GitLab:**
   - Si l'ID GitLab est fourni, cherche le développeur par `gitlab_user_id`

2. **Recherche par Email:**
   - Si l'email est fourni, cherche le développeur par email (normalisé)

3. **Recherche par Username:**
   - Si le username est fourni, cherche le développeur par `gitlab_username`

4. **Recherche par Nom:**
   - Si le nom est fourni, cherche le développeur par nom

5. **Vérification d'autorisation de projet:**
   - Vérifie que le développeur a une mission active sur le projet (Enterprise Guard)
   - Si non, rejette le commit (Zero Trust Discovery)

6. **Création automatique (si autorisé):**
   - Si aucun développeur trouvé et création autorisée, crée un nouveau développeur
   - Génère un ID GitLab synthétique pour les contributeurs externes

**Comment cette étape prépare la suivante:**
Chaque commit est lié au bon développeur en base de données.

**Code:**
```python
def resolve_developer(
    db: Session,
    project_id: int,
    period_id: int,
    developer_repo: DeveloperRepository,
    dev_project_repo: DeveloperProjectRepository,
    email: Optional[str] = None,
    name: Optional[str] = None,
    gitlab_id: Optional[int] = None,
    username: Optional[str] = None,
    forbid_creation: bool = False,
) -> Optional[Developer]:
    norm_email = normalize_email(email)
    norm_name = normalize_name(name)
    norm_username = normalize_username(username)

    # Recherche par ID GitLab
    if gitlab_id is not None and gitlab_id > 0:
        dev = developer_repo.get_by_gitlab_user_id(db, gitlab_id)
        if dev:
            if forbid_creation and not _is_authorized_for_project(db, dev_project_repo, dev.id, project_id):
                return None
            return dev

    # Recherche par Email
    if norm_email:
        dev = developer_repo.get_by_email(db, norm_email)
        if dev:
            if forbid_creation and not _is_authorized_for_project(db, dev_project_repo, dev.id, project_id):
                return None
            return dev

    # Recherche par Username
    if norm_username:
        dev = developer_repo.get_by_gitlab_username(db, norm_username)
        if dev:
            if forbid_creation and not _is_authorised_for_project(db, dev_project_repo, dev.id, project_id):
                return None
            return dev

    # Recherche par Nom
    if norm_name:
        dev = developer_repo.get_by_username(db, norm_name)
        if dev:
            if forbid_creation and not _is_authorised_for_project(db, dev_project_repo, dev.id, project_id):
                return None
            return dev

    # Création automatique (si autorisé)
    if forbid_creation:
        return None

    mapped = GitLabMapper.map_developer(
        data={"id": gitlab_id, "username": norm_username, "name": norm_name, "email": norm_email},
    )
    mapped["is_validated"] = False
    mapped["is_bot"] = is_bot(norm_username, norm_name)
    mapped["source"] = "gitlab_extraction"
    developer = developer_repo.create(db, mapped)
    dev_project_repo.add(db, developer.id, project_id, period_id)
    return developer
```

---

## 3. Affichage des Merge Requests dans MergePage.jsx

### Vue d'ensemble du Flux d'Affichage

```
Utilisateur (Navigateur)
    ↓
Frontend : MergePage.jsx
    ↓
useEffect → load()
    ↓
Frontend : api.get("/projects/{project_id}/merge-requests")
    ↓
Backend : api/routers/projects.py (endpoint get_project_mrs)
    ↓
Backend : repositories/merge_request_repository.py
↓
PostgreSQL (lecture des MRs)
↓
Frontend : Affichage dans MergePage.jsx (tableau + filtres + graphiques)
```

---

### Étape 1: Chargement des MRs (Frontend)

**Fichier:** `dataCollection/src/frontend/src/pages/MergePage.jsx`

**Lignes:** 1083-1176

**Objectif de cette étape:**
Charger les MRs depuis le backend en fonction des filtres appliqués.

**Pourquoi c'est important:**
- Permet à l'utilisateur de voir les MRs extraits
- Permet de filtrer par période, projet, développeur, lot d'extraction
- Affiche les données de manière structurée et filtrable

**Ce que fait cette étape:**
1. **Chargement des métadonnées:**
   - Charge les projets, périodes, développeurs, lots d'extraction
   - Charge les développeurs validés (is_validated=true, is_bot=false)

2. **Construction des paramètres API:**
   - `project_id`: Projet cible
   - `period_id`: Période cible (si filtre période actif)
   - `lot_id`: Lot d'extraction (si filtre lot actif)
   - `developer_id`: Développeur cible (si filtre développeur actif)
   - `exclude_draft`: Exclure les MRs brouillons (si mode KPI)

3. **Appel API:**
   - `GET /projects/{project_id}/merge-requests`
   - Retourne la liste des MRs avec leurs métadonnées enrichies

4. **Enrichissement des données:**
   - Ajoute le nom du projet
   - Ajoute le nom de l'auteur
   - Ajoute les métadonnées de site et groupe du développeur

**Comment cette étape prépare la suivante:**
Les MRs sont chargés dans le state React et peuvent être filtrés et affichés.

**Code:**
```javascript
const load = useCallback(async()=>{
  setLoading(true); setSpinning(true);
  try {
    let devs = [];
    // 1. Fetch contextual metadata
    const periodParam = filters.period !== "all" ? `?active_only=true&period_id=${filters.period}` : "?active_only=true";
    const dRes = await api.get(`/developers${periodParam}`);
    const rawDevs = Array.isArray(dRes.data)?dRes.data:(dRes.data?.items??[]);
    devs = rawDevs.filter(d => d.is_validated === true && d.is_bot === false);
    setDevelopers(devs);

    // 2. Fetch Data
    const targetProjectId = filters.project === "all" ? "all" : projects.find(p => String(p.id) === String(filters.project))?.id;
    
    const params = { 
      exclude_draft: false,
      author_only: filters.dataScope === "kpi"
    };
    
    // Priorité : lot_id prend le dessus sur period_id
    if (filters.lot !== "all") {
      params.lot_id = parseInt(filters.lot);
    } else {
      if (filters.period !== "all") params.period_id = parseInt(filters.period);
      if (filters.developerId !== "all") params.developer_id = parseInt(filters.developerId);
    }

    const response = await api.get(`/projects/${targetProjectId}/merge-requests`, { params });
    const items = Array.isArray(response.data) ? response.data : (response.data?.items ?? []);
    
    data = items.map(mr => ({
      ...mr,
      project: project,
      author: authorStr,
      developer: devInfo || mr.developer,
      site_id: devInfo?.primary_site_id || mr.developer?.primary_site_id,
      group_ids: devInfo?.group_ids || mr.developer?.group_ids,
      reviewer: revName || null,
      assignee: assName || null
    }));
    setAllMrs(data);
  } catch (err) {
    setError("Impossible de charger les merge requests.");
  } finally {
    setLoading(false); setSpinning(false);
  }
}, [filters.project, filters.lot, filters.period, filters.developerId, projects]);
```

---

### Étape 2: Filtrage et Affichage (Frontend)

**Fichier:** `dataCollection/src/frontend/src/pages/MergePage.jsx`

**Lignes:** 1178-1229

**Objectif de cette étape:**
Filtrer et afficher les MRs selon les critères de l'utilisateur.

**Pourquoi c'est important:**
- Permet à l'utilisateur d'analyser les MRs selon différents axes (période, projet, développeur)
- Affiche des graphiques et des statistiques
- Permet d'exporter les données en CSV

**Ce que fait cette étape:**
1. **Filtrage intention-based:**
   - Identifie les développeurs ciblés par l'extraction (Intention)
   - Filtre par développeur assigné au projet (RH Assignment)

2. **Filtrage statique:**
   - Filtre par recherche (titre, développeur, projet)
   - Filtre par période
   - Filtre par site
   - Filtre par groupe

3. **Affichage:**
   - Tableau des MRs avec pagination
   - Graphiques de répartition (opened, merged, closed)
   - KPIs (temps de revue, nombre de MRs)
   - Export CSV

**Comment cette étape prépare la suivante:**
L'utilisateur peut analyser les MRs et exporter les données.

---

## 4. Affichage des Commits dans CommitsPage.jsx

### Vue d'ensemble du Flux d'Affichage

```
Utilisateur (Navigateur)
    ↓
Frontend : CommitsPage.jsx
    ↓
useEffect → loadCommits()
↓
Frontend : api.get("/projects/{project_id}/commits")
↓
Backend : api/routers/projects.py (endpoint get_project_commits)
↓
Backend : repositories/commit_repository.py
↓
PostgreSQL (lecture des commits)
↓
Frontend : Affichage dans CommitsPage.jsx (tableau + graphiques)
```

---

### Étape 1: Chargement des Commits (Frontend)

**Fichier:** `dataCollection/src/frontend/src/pages/CommitsPage.jsx`

**Lignes:** 813-840

**Objectif de cette étape:**
Charger les commits depuis le backend en fonction des filtres appliqués.

**Pourquoi c'est important:**
- Permet à l'utilisateur de voir les commits extraits
- Permet de filtrer par période, projet, développeur, site, groupe
- Affiche les données de manière structurée et filtrable

**Ce que fait cette étape:**
1. **Chargement des métadonnées:**
   - Charge les projets, périodes, développeurs, groupes, sites, lots d'extraction

2. **Construction des paramètres API:**
   - `project_id`: Projet cible
   - `period_id`: Période cible
   - `lot_id`: Lot d'extraction
   - `developer_id`: Développeur cible
   - `exclude_merge_commits`: Exclure les commits de fusion

3. **Appel API:**
   - `GET /projects/{project_id}/commits`
   - Retourne la liste des commits avec leurs métadonnées enrichies

4. **Enrichissement des données:**
   - Ajoute le nom du projet
   - Ajoute le nom de l'auteur
   - Ajoute les métadonnées de site et groupe du développeur

**Comment cette étape prépare la suivante:**
Les commits sont chargés dans le state React et peuvent être filtrés et affichés.

**Code:**
```javascript
const loadCommits = useCallback(async () => {
  setLoading(true); setSpinning(true);
  try {
    const isGlobal = filters.project === "all";
    const targetId = isGlobal ? "all" : filters.project;

    const params = {};
    if (filters.period      !== "all") params.period_id    = parseInt(filters.period);
    if (filters.lot         !== "all") params.lot_id       = parseInt(filters.lot);
    if (filters.developerId !== "all") params.developer_id = parseInt(filters.developerId);
    params.exclude_merge_commits = filters.excludeMerges;

    const res = await api.get(`/projects/${targetId}/commits`, { params });
    const data = Array.isArray(res.data) ? res.data : (res.data?.items ?? []);
    
    setCommits(data.map(c => ({
      ...c,
      project_name: c.project_name || projects.find(p => p.id === c.project_id)?.name || "Project"
    })));
    setError(null);
  } catch (err) {
    setError("Impossible de charger les commits.");
  } finally {
    setLoading(false); setSpinning(false);
  }
}, [filters.project, filters.period, filters.lot, filters.developerId, filters.excludeMerges, projects]);
```

---

### Étape 2: Filtrage et Affichage (Frontend)

**Fichier:** `dataCollection/src/frontend/src/pages/CommitsPage.jsx`

**Lignes:** 864-908

**Objectif de cette étape:**
Filtrer et afficher les commits selon les critères de l'utilisateur.

**Pourquoi c'est important:**
- Permet à l'utilisateur d'analyser les commits selon différents axes
- Affiche des graphiques de répartition
- Permet d'exporter les données en CSV

**Ce que fait cette étape:**
1. **Filtrage statique:**
   - Filtre par recherche (titre, auteur, SHA)
   - Filtre par période
   - Filtre par site
   - Filtre par groupe
   - Filtre par développeur
   - Filtre par tri (date, auteur, changes)

2. **Affichage:**
   - Tableau des commits avec pagination
   - Graphiques de répartition par auteur (Pie Chart)
   - Graphique de répartition par additions (Polar Chart)
   - Export CSV

**Comment cette étape prépare la suivante:**
L'utilisateur peut analyser les commits et exporter les données.

**Code:**
```javascript
const filtered = useMemo(() => {
  const q = filters.search.toLowerCase();
  let result = commits;

  if (q) {
    result = result.filter((c) =>
      getCommitTitle(c).toLowerCase().includes(q) ||
      getAuthor(c).toLowerCase().includes(q) ||
      (c.gitlab_commit_id || "").toLowerCase().includes(q)
    );
  }
  if (filters.siteId !== "all") {
    const targetSiteId = parseInt(filters.siteId);
    result = result.filter((c) => (c.site_id || c.developer?.site_id) === targetSiteId);
  }
  if (filters.groupId !== "all") {
    const gId = parseInt(filters.groupId);
    result = result.filter(c => {
      const devGroupIds = (c.developer?.group_ids || []);
      return devGroupIds.map(Number).includes(gId);
    });
  }
  if (filters.developerId !== "all") {
    const targetId = parseInt(filters.developerId);
    result = result.filter(c => c.developer_id === targetId);
  }

  // Tri
  return [...result].sort((a, b) => {
    if (filters.sort === "date")    return new Date(b.authored_date) - new Date(a.authored_date);
    if (filters.sort === "author") return getAuthor(a).localeCompare(getAuthor(b));
    if (filters.sort === "changes") return (b.total_changes || 0) - (a.total_changes || 0);
    return 0;
  });
}, [commits, filters]);
```

---

## Résumé pour votre responsable

### Flux d'Extraction GitLab

1. **Déclenchement (Frontend):** L'admin lance une extraction via ExtractionLotsPage.jsx → Backend crée un lot d'extraction
2. **Extraction en arrière-plan (Backend):** Le backend exécute `_background_extraction()` qui appelle `ExtractionService`
3. **Extraction des Commits:** Le service résout les développeurs éligibles via `get_developers_for_data_extraction()`, extrait les commits GitLab, filtre par période et mission, et sauvegarde en base
4. **Extraction des MRs:** Le service extrait les MRs GitLab, résout les auteurs, et sauvegarde en base
5. **Recalcul KPIs:** Après extraction réussie, le système déclenche automatiquement `KpiAggregator.generate_monthly_snapshots()` pour mettre à jour les KPIs

### Extraction Intelligente et Mutations

Le système utilise une approche "Mission-Strict" pour gérer les mutations des développeurs:

1. **Sélection Intelligente:**
   - `get_developpers_for_data_extraction()` filtre par DeveloperProject (mission projet), DeveloperSite (affectation site), et DeveloperGroupLink (affectation groupe)
   - Applique les règles de cycle de vie RH (onboarding/offboarding)
   - NE PAS la règle des 15 jours pour l'extraction brute (appliquée uniquement aux KPIs)

2. **Précision Chirurgicale:**
   - `is_project_contribution_certified()` vérifie la mission à la date exacte du commit
   - Permet de gérer les mutations (nouveau dev, mutation, archivage, désactivation, activation) avec précision journalière

3. **Résolution d'Identité:**
   - `resolve_developer()` résout les auteurs par ID GitLab, email, username, ou nom
   - Vérifie l'autorisation de projet (Enterprise Guard)
   - Crée automatiquement les nouveaux développeurs si autorisé

### Affichage dans MergePage.jsx

1. **Chargement:** `load()` appelle `GET /projects/{project_id}/merge-requests`
2. **Filtre:** Par période, projet, développeur, lot d'extraction, mode KPI vs Activité Générale
3. **Affichage:** Tableau avec pagination, graphiques de répartition (opened/merged/closed), KPIs, export CSV

### Affichage dans CommitsPage.jsx

1. **Chargement:** `loadCommits()` appelle `GET /projects/{project_id}/commits`
2.**Filtre:** Par période, projet, développeur, site, groupe, tri
3. **Affichage:** Tableau avec pagination, graphiques de répartition par auteur et additions, export CSV

### Points Clés à Retenir

- **Intégrité:** Les données sont cohérentes entre l'extraction GitLab et l'affichage frontend
- **Performance:** L'extraction est optimisée (pré-chargement, déduplication, filtres chirurgicaux)
- **Robustesse:** Gère les erreurs de manière robuste (retry automatique, logging détaillé)
- **Automatisation:** Le recalcul des KPIs est automatique après chaque extraction
- **Flexibilité:** Permet différents modes d'extraction (réelle, mensuelle, ciblée)
