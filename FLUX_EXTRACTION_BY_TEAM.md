# Flux d'Extraction By Team - Filtrage par Mission et Période

## 🎯 Objectif du Système

Permettre l'extraction des données GitLab (commits, Merge Requests) pour une équipe de développeurs, en ciblant uniquement ceux qui ont une mission active pendant chaque période spécifique, en respectant les dates contractuelles RH (onboarding/offboarding) et les affectations temporelles (SCD Type 2).

---

## 📊 Architecture en 4 Couches

```
┌─────────────────────────────────────────────────────────────────┐
│                     FRONTEND (React)                              │
│  - Sélection Site/Groupe/Développeurs                               │
│  - Toggle Smart-Sync RH (ciblage automatique)                        │
│  - Simulation avant extraction                                       │
└──────────────────────┬──────────────────────────────────────────────┘
                       │ HTTP Request (Query Params)
                       ↓
┌─────────────────────────────────────────────────────────────────┐
│                    BACKEND API (FastAPI)                            │
│  - Endpoint /extraction/run                                          │
│  - Endpoint /extraction/simulate-team                               │
│  - Validation des paramètres                                        │
└──────────────────────┬──────────────────────────────────────────────┘
                       │ Appel Services
                       ↓
┌─────────────────────────────────────────────────────────────────┐
│              BACKEND SERVICES (Business Logic)                       │
│  - Filtrage développeurs actifs selon mission                          │
│  - Ciblage automatique par période (Smart-Sync)                       │
│  - Extraction GitLab filtrée                                         │
│  - Certification des données                                          │
└──────────────────────┬──────────────────────────────────────────────┘
                       │ SQL Queries
                       ↓
┌─────────────────────────────────────────────────────────────────┐
│                 BASE DE DONNÉES (PostgreSQL)                        │
│  - Tables: developer, developer_site, developer_project, etc.      │
│  - SCD Type 2 pour historisation temporelle                         │
└─────────────────────────────────────────────────────────────────┘
```

---

## 🔄 ÉTAPE 1: Frontend - Interface Utilisateur

### Fichier: `src/frontend/src/pages/ExtractionByTeamTab.jsx`

**Objectif**: Permettre la sélection de l'équipe et configuration de l'extraction

#### 1.1 États du Composant (lignes 32-47)
```javascript
const [sites, setSites] = useState([]);
const [groups, setGroups] = useState([]);
const [developers, setDevelopers] = useState([]);

const [selectedConfig, setSelectedConfig] = useState("");
const [selectedSite, setSelectedSite] = useState("");
const [selectedGroup, setSelectedGroup] = useState("");
const [selectedDeveloperIds, setSelectedDeveloperIds] = useState([]);
const [isSmartSync, setIsSmartSync] = useState(false); // ✅ Toggle Smart-Sync RH
const [selectedPeriod, setSelectedPeriod] = useState("");
const [isBackfill, setIsBackfill] = useState(false);
```

**Objectif**: Stocker les sélections de l'utilisateur
- `selectedSite`: Option 1 - Ciblage par site
- `selectedGroup`: Option 2 - Ciblage par groupe (Business Unit)
- `selectedDeveloperIds`: Option 3 - Sélection manuelle de développeurs
- `isSmartSync`: Mode intelligent qui cible automatiquement selon les dates RH

#### 1.2 Chargement des Développeurs avec Filtrage Temporel (lignes 60-78)
```javascript
const fetchLists = useCallback(async () => {
  setLoading(true);
  try {
    const [sitesRes, groupsRes, devsRes] = await Promise.all([
      siteService.getAll(false),
      developerService.getGroups(),
      // ✅ SENIOR : Mode intelligent - filtrage selon période
      api.get("/developers", { params: { tab: "extraction", period_id: selectedPeriod || undefined } })
    ]);
    const devsData = devsRes.data;
    setSites(Array.isArray(sitesRes) ? sitesRes : []);
    setGroups(Array.isArray(groupsRes) ? groupsRes : []);
    setDevelopers(Array.isArray(devsData) ? devsData : devsData.items || []);
  } catch (err) {
    console.warn("Failed to load sites/groups/devs", err);
    setError("Erreur lors du chargement des listes. Veuillez rafraîchir.");
  } finally {
    setLoading(false);
  }
}, [selectedPeriod]);
```

**Ce qui se passe**:
- Appel API `/developers` avec paramètre `tab="extraction"` et `period_id`
- Le backend filtre les développeurs actifs selon la période sélectionnée
- Les développeurs sont affichés avec leur statut RH (ACTIF, NEW, INACTIF, FUTUR)

#### 1.3 Toggle Smart-Sync RH (lignes 456-471)
```javascript
<div className="form-check form-switch mb-0 bg-success-subtle px-2 py-1 rounded-2 d-flex align-items-center gap-2 border border-success border-opacity-10 me-2">
  <label className="form-check-label fs-10 text-success fw-bold mb-0" htmlFor="team-smart-sync-toggle" style={{cursor:"pointer"}}>
     Smart-Sync
  </label>
  <input
    className="form-check-input ms-0"
    type="checkbox"
    id="team-smart-sync-toggle"
    checked={isSmartSync}
    onChange={e => {
      setIsSmartSync(e.target.checked);
      if (e.target.checked) setSelectedDeveloperIds([]);
    }}
    style={{cursor:"pointer", width: "1.6em", height: "0.8em"}}
  />
</div>
```

**Objectif**: Activer le ciblage automatique selon les dates RH
- Quand activé: Désactive la sélection manuelle de développeurs
- Le backend ciblera automatiquement les développeurs actifs selon leur onboarding_date

#### 1.4 Lancement de l'Extraction (lignes 242-285)
```javascript
const handleRun = async () => {
  setError(null);
  setJobs({});
  setLoading(true);

  try {
    const res = await api.post("/extraction/run", null, {
      params: {
        gitlab_config_id: selectedConfig,
        site_id: selectedSite || undefined,
        group_id: selectedGroup || undefined,
        developer_ids: selectedDeveloperIds.length > 0 ? selectedDeveloperIds.join(",") : undefined,
        extraction_type: extractionType,
        all_developers: (isSmartSync && !selectedSite && !selectedGroup) ? true : false,
        is_smart_sync: isSmartSync,
        period_id: selectedPeriod || undefined,
        is_backfill: isBackfill,
        project_ids: selectedProjectIds.length > 0 ? selectedProjectIds.join(",") : undefined,
        auto_target_by_period: isSmartSync  // ✅ Ciblage automatique par période
      }
    });

    const initialJobs = {};
    const jobsToProcess = res.data.lots || res.data.jobs || []; 
    
    jobsToProcess.forEach(job => {
      initialJobs[job.lot_id] = {
        lot_id: job.lot_id,
        developer_name: job.developer_name,
        status: job.status || "running",
        step_index: 0,
        step_label: "Démarrage en arrière-plan...",
        step_progress: 0
      };
    });
    setJobs(initialJobs);
  } catch (err) {
    console.error("Extraction error", err);
    setError(err.response?.data?.detail || "Erreur lors du lancement de l'extraction");
  } finally {
    setLoading(false);
  }
};
```

**Paramètres clés**:
- `is_smart_sync`: Active le ciblage automatique RH
- `auto_target_by_period`: Ciblage par période pour chaque développeur
- `all_developers`: Si Smart-Sync sans site/groupe → tous les développeurs actifs
- `period_id`: Période cible pour le filtrage temporel

---

## 🔄 ÉTAPE 2: Backend API - Réception des Paramètres

### Fichier: `src/backend/app/api/routers/extraction.py`

**Objectif**: Valider les paramètres et déclencher l'extraction en arrière-plan

#### 2.1 Endpoint /extraction/run (lignes 800-900 approx)
```python
@router.post("/run")
async def run_extraction(
    background_tasks: BackgroundTasks,
    gitlab_config_id: int = Query(...),
    site_id: Optional[int] = Query(None),
    group_id: Optional[int] = Query(None),
    developer_ids: Optional[str] = Query(None),
    extraction_type: str = Query("REALTIME"),
    all_developers: bool = Query(False),
    is_smart_sync: bool = Query(False),
    period_id: Optional[int] = Query(None),
    is_backfill: bool = Query(False),
    project_ids: Optional[str] = Query(None),
    auto_target_by_period: bool = Query(False),
    db: Session = Depends(get_db),
    current_user: AppUser = Depends(get_current_user),
):
```

**Paramètres reçus**:
- `is_smart_sync`: Flag pour activer le ciblage RH automatique
- `auto_target_by_period`: Flag pour cibler par période
- `period_id`: Période pour le filtrage temporel
- `site_id`, `group_id`, `developer_ids`: Filtres manuels

#### 2.2 Création du Lot d'Extraction
```python
# Création de l'ExtractionLot
lot = ExtractionLot(
    extraction_type=ExtractionTypeEnum[extraction_type.upper()],
    status=ExtractionStatusEnum.running,
    period_id=period_id,
    gitlab_config_id=gitlab_config_id,
    triggered_by=current_user.id,
    auto_target_by_period=auto_target_by_period,
    is_smart_sync=is_smart_sync
)
db.add(lot)
db.flush()

# Déclenchement en arrière-plan
background_tasks.add_task(
    _background_extraction,
    lot_id=lot.id,
    gitlab_config_id=gitlab_config_id,
    triggered_by_user=current_user.id,
    developer_ids=developer_ids_list if developer_ids else None,
    auto_target_by_period=auto_target_by_period,
    fast_mode=(extraction_type == "REALTIME")
)
```

---

## 🔄 ÉTAPE 3: Backend Background Task - Ciblage RH

### Fichier: `src/backend/app/api/routers/extraction.py` (lignes 51-88)

**Objectif**: Cibler automatiquement les développeurs actifs selon leur mission

#### 3.1 Fonction _background_extraction (lignes 51-88)
```python
async def _background_extraction(
    lot_id:            int,
    gitlab_config_id:  int,
    triggered_by_user: int,
    gitlab_project_id: Optional[int] = None,
    developer_ids:     Optional[List[int]] = None,
    fast_mode:         bool          = False,
    allowed_gitlab_project_ids: Optional[List[int]] = None,
    auto_target_by_period: bool      = False,
) -> None:
```

#### 3.2 Ciblage Automatique par Période (lignes 80-87)
```python
# ✅ INTELLIGENCE SYSTÈME (SENIOR) : Ciblage automatique par période (Sync RH)
if auto_target_by_period:
    from app.services.extraction.extraction_filters import build_period_window
    from app.repositories.developer_repository import DeveloperRepository
    
    _, _, p_start, p_end = build_period_window(lot.period)
    eligible_devs = DeveloperRepository().get_active_during_period(
        db, p_start.date(), p_end.date()
    )
    developer_ids = [d.id for d in eligible_devs]
    logger.info(f"[lot={lot_id}] Smart-Sync: {len(developer_ids)} développeurs éligibles identifiés.")
```

**Logique détaillée**:
1. `build_period_window(lot.period)`: Calcule les dates de début et fin de la période
2. `get_active_during_period()`: Récupère les développeurs actifs pendant cette période
3. `developer_ids`: Liste des IDs des développeurs éligibles

---

## 🔄 ÉTAPE 4: Repository - Filtrage par Mission

### Fichier: `src/backend/app/repositories/developer_repository.py`

**Objectif**: Filtrer les développeurs selon leur mission active pendant une période

#### 4.1 Méthode get_by_tab (lignes 46-249)
```python
def get_by_tab(
    self,
    db:               Session,
    tab:              str           = "validated",
    project_id:       Optional[int] = None,
    site_id:          Optional[int] = None,
    group_id:         Optional[int] = None,
    period_id:        Optional[int] = None,
    limit:            Optional[int] = None,
    skip:             Optional[int] = 0,
) -> dict:
```

#### 4.2 Calcul des Dates de Période (lignes 150-199)
```python
# Calcul des dates de période si period_id fourni
start_p = end_p = None
if period_id is not None:
    period = db.query(Period).filter(Period.id == period_id).first()
    if period:
        start_p = date(period.year, period.month, 1)
        if period.month == 12:
            end_p = date(period.year + 1, 1, 1)
        else:
            end_p = date(period.year, period.month + 1, 1)
```

#### 4.3 Filtrage Temporel Site (SCD Type 2) (lignes 200-212)
```python
if site_id is not None:
    #  SENIOR : Filtrage temporel intelligent du site (SCD Type 2)
    # On réutilise les dates calculées plus haut (start_p, end_p) si period_id est fourni
    q = q.join(
        DeveloperSite,
        (DeveloperSite.developer_id == Developer.id) &
        (DeveloperSite.site_id      == site_id)
    )
    
    if period_id is not None and start_p is not None:
        q = q.filter(
            (DeveloperSite.is_active.is_(True) | (DeveloperSite.end_date >= start_p)),
            (DeveloperSite.start_date <= end_p) # Fixed: compare with end of period
        )
```

**Logique SCD Type 2**:
- `DeveloperSite.start_date <= end_p`: Le segment a commencé avant la fin de période
- `DeveloperSite.end_date >= start_p` OU `is_active=True`: Le segment est toujours actif ou couvre le début de période
- Cela permet de gérer les mutations de site dans le temps

#### 4.4 Filtrage Temporel Groupe (SCD Type 2) (lignes 214-226)
```python
if group_id is not None:
    #  SENIOR : Filtrage temporel intelligent du groupe (SCD Type 2)
    q = q.join(
        DeveloperGroupLink,
        (DeveloperGroupLink.developer_id == Developer.id) &
        (DeveloperGroupLink.group_id     == group_id)
    )
    if period_id is not None and start_p is not None:
        q = q.filter(
            (DeveloperGroupLink.is_active.is_(True) | (DeveloperGroupLink.end_date >= start_p)),
            (DeveloperGroupLink.start_date <= end_p) # Fixed: compare with end of period
        )
```

**Pourquoi filtrer le groupe?**
- Un développeur suspendu n'a PAS de segment groupe actif pendant la suspension
- Cela permet d'exclure correctement les suspensions de l'effectif

---

## 🔄 ÉTAPE 5: Utils - Logique Mission-Strict

### Fichier: `src/backend/app/utils/mission_utils.py`

**Objectif**: Logique de filtrage des développeurs certifiés pour une mission

#### 5.1 Règle RG-02 des 15 Jours (lignes 15-36)
```python
# =============================================================================
# RG-02 — Règle des 15 jours (Source de Vérité Unique)
# =============================================================================
# Un développeur est compté dans l'effectif d'un mois M si et seulement si
# sa date de sortie (offboarding_date) est >= au 15 de ce mois M.
# Cette règle s'inspire de la pratique RH standard de proratisation de la paie.
# IMPORTANT : Toute modification de ce seuil doit être faite ICI UNIQUEMENT.
# =============================================================================
RG02_THRESHOLD_DAY: int = 15

def get_rg02_threshold(year: int, month: int, today: Optional[date] = None) -> date:
    """
    [RG-02] Retourne la date-seuil d'offboarding pour un mois donné.
    - Si le mois est le mois en cours → today (état instantané)
    - Si le mois est passé             → 15 du mois (règle des 15 jours)
    """
    _today = today or date.today()
    if year == _today.year and month == _today.month:
        return _today
    return date(year, month, RG02_THRESHOLD_DAY)
```

**Pourquoi 15 jours?**
- Pratique RH standard pour la proratisation de la paie
- Un développeur qui part le 10 du mois compte pour le mois entier
- Un développeur qui part le 20 du mois ne compte pas pour le mois

#### 5.2 get_certified_developers_query (lignes 39-130)
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
    # Calcul des dates de période
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
        .join(
            DeveloperProject,
            (DeveloperProject.developer_id == Developer.id) &
            (DeveloperProject.project_id   == project_id)
        )
        # Join DeveloperSite temporel (SCD Type 2)
        .join(
            DeveloperSite,
            (DeveloperSite.developer_id == Developer.id)
        )
        # Join DeveloperGroupLink temporel (SCD Type 2)
        .join(
            DeveloperGroupLink,
            (DeveloperGroupLink.developer_id == Developer.id)
        )
        .filter(
            Developer.is_bot.is_(False),
            
            # [STRICT CYCLE DE VIE] Respect des dates contractuelles RH globales + Règle des 15 jours
            or_(Developer.onboarding_date.is_(None), Developer.onboarding_date < end_date),
            or_(Developer.offboarding_date.is_(None), Developer.offboarding_date >= threshold_date),

            # [SCD2 TEMPORAL - SITE] Le segment de site doit couvrir la période
            or_(DeveloperSite.start_date.is_(None), DeveloperSite.start_date < end_date),
            or_(DeveloperSite.end_date.is_(None),   DeveloperSite.end_date   >= start_date),

            # [SCD2 TEMPORAL - GROUPE] Le segment de groupe doit couvrir la période
            or_(DeveloperGroupLink.start_date.is_(None), DeveloperGroupLink.start_date < end_date),
            or_(DeveloperGroupLink.end_date.is_(None),   DeveloperGroupLink.end_date   >= start_date),
        )
        .distinct()
    )

    if eligible_ids:
        query = query.filter(Developer.id.in_(eligible_ids))

    # [STRICT TEMPORAL SCOPE] La mission spécifique au projet doit couvrir la période
    query = query.filter(
        or_(DeveloperProject.start_date.is_(None), DeveloperProject.start_date < end_date),
        or_(DeveloperProject.end_date.is_(None), DeveloperProject.end_date >= start_date)
    )
    return query
```

**Vérifications effectuées**:
1. **Cycle de vie RH**: `onboarding_date` et `offboarding_date` (avec règle RG-02 des 15 jours)
2. **Affectation Site**: Segment SCD Type 2 couvrant la période
3. **Affectation Groupe**: Segment SCD Type 2 couvrant la période
4. **Mission Projet**: Segment SCD Type 2 couvrant la période
5. **Exclusion bots**: `is_bot = false`

#### 5.3 get_developers_for_data_extraction (lignes 300-403)
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
    Contrairement à get_certified_developers_for_mission(), cette fonction N'APPLIQUE PAS
    la règle des 15 jours car l'extraction doit capturer TOUS les commits pendant la période
    de mission réelle, indépendamment des règles de proratisation RH.
    """
    # [DATA EXTRACTION] Cycle de vie RH SANS règle des 15 jours
    # On extrait TOUS les commits pendant la période de mission réelle
    or_(Developer.onboarding_date.is_(None), Developer.onboarding_date < end_date),
    or_(Developer.offboarding_date.is_(None), Developer.offboarding_date >= start_date),
```

**Pourquoi deux fonctions différentes?**
- `get_certified_developers_query`: Pour les KPIs (avec règle RG-02 des 15 jours)
- `get_developers_for_data_extraction`: Pour l'extraction brute (sans règle RG-02)

---

## 🔄 ÉTAPE 6: Backend Service - Extraction GitLab Filtrée

### Fichier: `src/backend/app/services/extraction/extraction_service.py`

**Objectif**: Extraire les données GitLab uniquement pour les développeurs ciblés

#### 6.1 Identification des Développeurs Éligibles (lignes 100-150 approx)
```python
# Dans run_realtime_extraction ou _extract_data
from app.utils.mission_utils import get_developers_for_data_extraction

eligible_dev_ids = get_developers_for_data_extraction(
    db, 
    project_id=project.id, 
    period_id=period.id,
    start_date=start_date,
    end_date=end_date
)
```

#### 6.2 Extraction des Commits Filtrés
```python
await self._extract_commits(
    db, 
    project, 
    lot, 
    client, 
    developer_ids=eligible_dev_ids,  # ← Filtrage par développeurs
    fast_mode=fast_mode
)
```

**Ce qui se passe dans _extract_commits**:
1. Appel API GitLab pour récupérer les commits du projet
2. Pour chaque commit, vérifier si l'auteur est dans `eligible_dev_ids`
3. Si oui → stocker le commit avec `developer_id`
4. Si non → ignorer le commit (ou stocker sans developer_id)

#### 6.3 Extraction des Merge Requests Filtrés
```python
await self._extract_merge_requests(
    db, 
    project, 
    lot, 
    client, 
    developer_ids=eligible_dev_ids,  # ← Filtrage par développeurs
    fast_mode=fast_mode
)
```

**Ce qui se passe dans _extract_merge_requests**:
1. Appel API GitLab pour récupérer les MRs du projet
2. Pour chaque MR, vérifier si l'auteur est dans `eligible_dev_ids`
3. Si oui → stocker le MR avec `developer_id`
4. Si non → ignorer le MR (ou stocker sans developer_id)

---

## 🔄 ÉTAPE 7: Base de Données - Persistance

### Tables Principales

#### 7.1 Table `developer` (Informations RH)
```sql
CREATE TABLE developer (
    id SERIAL PRIMARY KEY,
    name VARCHAR(255) NOT NULL,
    email VARCHAR(255) UNIQUE NOT NULL,
    gitlab_username VARCHAR(255),
    is_active BOOLEAN DEFAULT TRUE,
    is_bot BOOLEAN DEFAULT FALSE,
    onboarding_date DATE,      -- Date d'entrée
    offboarding_date DATE,     -- Date de sortie
    created_at TIMESTAMP DEFAULT NOW()
);
```

#### 7.2 Table `developer_site` (SCD Type 2 - Affectations Sites)
```sql
CREATE TABLE developer_site (
    id SERIAL PRIMARY KEY,
    developer_id INTEGER REFERENCES developer(id),
    site_id INTEGER REFERENCES site(id),
    is_primary BOOLEAN DEFAULT FALSE,
    is_active BOOLEAN DEFAULT TRUE,
    start_date DATE,           -- Début de l'affectation
    end_date DATE,             -- Fin de l'affectation (NULL si actif)
    UNIQUE(developer_id, site_id, start_date)
);
```

**Exemple de données**:
| developer_id | site_id | start_date | end_date | is_active |
|--------------|---------|------------|----------|-----------|
| 1 | 5 (Paris) | 2026-01-15 | NULL | true |
| 1 | 6 (Lyon) | 2026-06-01 | NULL | true |

#### 7.3 Table `developer_project` (SCD Type 2 - Missions)
```sql
CREATE TABLE developer_project (
    id SERIAL PRIMARY KEY,
    developer_id INTEGER REFERENCES developer(id),
    project_id INTEGER REFERENCES project(id),
    is_active BOOLEAN DEFAULT TRUE,
    start_date DATE,           -- Début de la mission
    end_date DATE,             -- Fin de la mission (NULL si actif)
    UNIQUE(developer_id, project_id, start_date)
);
```

**Exemple de données**:
| developer_id | project_id | start_date | end_date | is_active |
|--------------|------------|------------|----------|-----------|
| 1 | 12 (Frontend) | 2026-01-15 | NULL | true |
| 1 | 13 (Backend) | 2026-06-01 | NULL | true |

#### 7.4 Table `commit` (Commits GitLab)
```sql
CREATE TABLE commit (
    id SERIAL PRIMARY KEY,
    gitlab_commit_id VARCHAR(255) UNIQUE NOT NULL,
    project_id INTEGER REFERENCES project(id),
    developer_id INTEGER REFERENCES developer(id),  -- ← Lien avec développeur
    authored_date TIMESTAMP,
    committed_date TIMESTAMP,
    extraction_lot_id INTEGER REFERENCES extraction_lot(id),
    -- autres champs...
);
```

#### 7.5 Table `merge_request` (MRs GitLab)
```sql
CREATE TABLE merge_request (
    id SERIAL PRIMARY KEY,
    gitlab_mr_id INTEGER UNIQUE NOT NULL,
    project_id INTEGER REFERENCES project(id),
    developer_id INTEGER REFERENCES developer(id),  -- ← Lien avec développeur
    created_at TIMESTAMP,
    extraction_lot_id INTEGER REFERENCES extraction_lot(id),
    -- autres champs...
);
```

---

## 🔍 Exemple Concret Complet

### Scénario: Extraction Team "Backend" pour Janvier 2026

#### Frontend
```
1. Utilisateur sélectionne:
   - Domaine GitLab: "GitLab Enterprise"
   - Business Unit: "Backend"
   - Smart-Sync: activé ✓
   - Période: Janvier 2026
   - Type: REALTIME

2. Clique "Lancer l'extraction"
```

#### Backend API
```
Réception des paramètres:
- gitlab_config_id: 1
- group_id: 3 (Backend)
- is_smart_sync: true
- auto_target_by_period: true
- period_id: 5 (Janvier 2026)
```

#### Background Task
```
1. build_period_window(period_id=5)
   → start_date: 2026-01-01, end_date: 2026-02-01

2. get_active_during_period(start_date=2026-01-01, end_date=2026-02-01)
   → Requête SQL avec filtres SCD Type 2

3. Résultat: 12 développeurs éligibles identifiés
   - Jean Dupont (onboarding: 2025-12-01, offboarding: NULL)
   - Marie Martin (onboarding: 2026-01-10, offboarding: NULL)
   - Pierre Durand (onboarding: 2025-11-15, offboarding: 2026-01-20) ← Compte (RG-02)
   - Sophie Bernard (onboarding: 2026-02-01, offboarding: NULL) ← Ne compte pas (RG-02)
```

#### Extraction GitLab
```
Pour chaque projet du groupe Backend:
1. Récupérer tous les commits de Janvier 2026
2. Filtrer: ne garder que les commits des 12 développeurs éligibles
3. Stocker avec developer_id correspondant

Pour chaque projet du groupe Backend:
1. Récupérer tous les MRs de Janvier 2026
2. Filtrer: ne garder que les MRs des 12 développeurs éligibles
3. Stocker avec developer_id correspondant
```

#### Base de Données
```
Table commit (extrait):
| gitlab_commit_id | project_id | developer_id | authored_date |
|------------------|------------|--------------|--------------|
| abc123... | 13 (Backend) | 1 (Jean) | 2026-01-15 |
| def456... | 13 (Backend) | 2 (Marie) | 2026-01-20 |
| ghi789... | 13 (Backend) | 3 (Pierre) | 2026-01-10 |
| jkl012... | 13 (Backend) | NULL | 2026-01-25 | ← Dev non éligible

Table merge_request (extrait):
| gitlab_mr_id | project_id | developer_id | created_at |
|-------------|------------|--------------|------------|
| 123 | 13 (Backend) | 1 (Jean) | 2026-01-18 |
| 124 | 13 (Backend) | 2 (Marie) | 2026-01-22 |
| 125 | 13 (Backend) | 3 (Pierre) | 2026-01-12 |
| 126 | 13 (Backend) | NULL | 2026-01-28 | ← Dev non éligible
```

---

## 🎓 Points Clés pour la Soutenance

### 1. SCD Type 2 (Slowly Changing Dimension)
- **Historisation complète**: Chaque affectation est datée (start_date, end_date)
- **Support des mutations**: Un développeur peut changer de site/groupe/projet dans le temps
- **Requêtes temporelles**: Filtrage par période avec chevauchements gérés

### 2. Règle RG-02 des 15 Jours
- **Pratique RH standard**: Proratisation de la paie
- **Développeur partant le 10**: Compte pour le mois entier
- **Développeur partant le 20**: Ne compte pas pour le mois
- **Appliquée aux KPIs**: Pas à l'extraction brute

### 3. Smart-Sync RH
- **Ciblage automatique**: Selon les dates d'onboarding/offboarding
- **Filtrage par période**: Chaque développeur est ciblé selon sa mission active
- **Exclusion des suspensions**: Vérification triple (site + groupe + projet)

### 4. Triple Vérification
- **Site**: Segment SCD Type 2 couvrant la période
- **Groupe**: Segment SCD Type 2 couvrant la période
- **Projet**: Segment SCD Type 2 couvrant la période
- **Cycle de vie**: onboarding_date et offboarding_date respectés

### 5. Extraction Filtrée
- **Commits**: Seuls les commits des développeurs éligibles sont stockés avec developer_id
- **MRs**: Seuls les MRs des développeurs éligibles sont stockés avec developer_id
- **Données brutes**: Capturées pendant toute la période de mission réelle (sans RG-02)

### 6. Performance
- **Pré-chargement**: Un appel DB par type d'entité
- **Sous-requêtes**: Évite les N+1 avec get_certified_developers_query
- **Background tasks**: Extraction asynchrone non bloquante

---

## 🚀 Conclusion

Le flux d'extraction by team suit ce processus:

1. **Frontend**: Sélection de l'équipe (site/groupe/développeurs) + activation Smart-Sync
2. **API**: Réception des paramètres et création du lot d'extraction
3. **Background Task**: Ciblage automatique des développeurs actifs selon mission
4. **Repository**: Filtrage SCD Type 2 des affectations (site/groupe/projet)
5. **Utils**: Application de la règle RG-02 des 15 jours pour les KPIs
6. **Service**: Extraction GitLab filtrée par développeurs éligibles
7. **Base de données**: Persistance des commits/MRs avec developer_id

Chaque développeur est ciblé uniquement s'il a une mission active (site + groupe + projet) pendant la période spécifique, garantissant que les KPIs calculés reflètent la réalité de l'effectif RH.
