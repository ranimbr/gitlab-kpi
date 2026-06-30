# Flux Technique - Gestion des Développeurs (Actions CRUD)

## Introduction : Comprendre le Flux de Données

Ce document décrit comment les actions de gestion des développeurs (CRUD) traversent votre application, depuis l'interface utilisateur jusqu'à la base de données PostgreSQL.

### Architecture en Couches

Votre application est organisée en **5 couches** qui se passent les données comme un relais :

```
┌─────────────────────────────────────────────────────────────────┐
│  COUCHE 1 : Frontend (React)                                     │
│  - Interface utilisateur (DevelopersPage.jsx)                    │
│  - Formulaire de saisie                                          │
│  - Service d'appel API (developerService.js)                     │
└─────────────────────────────────────────────────────────────────┘
                              ↓
┌─────────────────────────────────────────────────────────────────┐
│  COUCHE 2 : API HTTP (FastAPI)                                   │
│  - Réception des requêtes HTTP (POST/PUT)                        │
│  - Validation des droits d'accès                               │
│  - Router : api/routers/developers.py                            │
└─────────────────────────────────────────────────────────────────┘
                              ↓
┌─────────────────────────────────────────────────────────────────┐
│  COUCHE 3 : Service Business Logic                              │
│  - Règles métier (validation, upsert, SCD Type 2)               │
│  - Service : services/admin/developer_service.py                │
└─────────────────────────────────────────────────────────────────┘
                              ↓
┌─────────────────────────────────────────────────────────────────┐
│  COUCHE 4 : Repository (Accès Données)                          │
│  - Opérations CRUD sur la base                                   │
│  - Repository : repositories/developer_repository.py             │
└─────────────────────────────────────────────────────────────────┘
                              ↓
┌─────────────────────────────────────────────────────────────────┐
│  COUCHE 5 : Base de Données (PostgreSQL)                        │
│  - Exécution des requêtes SQL (INSERT/UPDATE)                   │
│  - Tables : developer, developer_group_link, etc.               │
└─────────────────────────────────────────────────────────────────┘
```

### Transformation des Données à Chaque Couche

À chaque passage, les données sont **transformées** :

1. **Frontend** : Objet JavaScript (JSON)
2. **API HTTP** : Requête HTTP avec JSON dans le body
3. **Service** : Objet Pydantic (Python)
4. **Repository** : Dictionnaire Python
5. **Base de données** : Requêtes SQL

---

## Détail des Transformations Techniques

### 1. État React → JSON Payload (Frontend)

**Fichier**: `dataCollection/src/frontend/src/pages/admin/DevelopersPage.jsx`

**Lignes**: 438-456

```javascript
const payload = {
  is_active:        form.is_active,
  name:             form.name.trim()            || null,
  email:            form.email.trim()           || null,
  gitlab_username:  form.gitlab_username.trim() || null,
  group_ids:        form.group_id ? [parseInt(form.group_id)] : [],
  projects:         form.project_ids.map(pid => ({ project_id: pid, is_active: true })),
  period_id:        null, // Mission permanente
  is_bot:           form.is_bot,
  is_external:      form.is_external,
  onboarding_date:  form.onboarding_date  || null,
  offboarding_date: form.offboarding_date || null,
  mutation_date:    (form.update_type === "B" || (dev?.id && form.is_active !== (dev?.is_active ?? true))) ? (form.mutation_date || null) : null,
};
if (form.primary_site_id) {
  payload.sites = [{ site_id: parseInt(form.primary_site_id), is_primary: true }];
} else {
  payload.sites = [];
}
```

**Transformation**: État React → Payload JSON
- Extraction des champs du formulaire React
- Conversion des strings en integers (`parseInt`)
- Logique conditionnelle pour `mutation_date` (Case A vs Case B)
- Transformation des tableaux pour `projects` et `sites`

---

### 2. JSON Payload → Requête HTTP (Frontend Service)

**Fichier**: `dataCollection/src/frontend/src/services/developerService.js`

**Ligne**: 42

```javascript
create: (data) => api.post("/developers", data).then(r => r.data),
```

**Transformation**: Payload JSON → Requête HTTP POST
- Le payload JSON est envoyé dans le body de la requête
- URL: `/api/v1/developers`
- Méthode: POST

**Requête HTTP générée**:
```http
POST /api/v1/developers
Content-Type: application/json

{
  "name": "Ahmed Ben Ali",
  "email": "ahmed@corp.tn",
  "gitlab_username": "ahmed.benali",
  "group_ids": [5],
  "sites": [{"site_id": 2, "is_primary": true}],
  "projects": [{"project_id": 10, "is_active": true}],
  "is_external": false,
  "onboarding_date": "2024-01-15",
  "offboarding_date": null
}
```

---

### 3. HTTP → Pydantic (API Router)

**Fichier**: `dataCollection/src/backend/app/api/routers/developers.py`

**Lignes**: 633-646

```python
@router.post("", response_model=DeveloperResponse, status_code=201)
def create_developer(
    request:       DeveloperCreate,  # ← HTTP → Pydantic (automatique FastAPI)
    req:           Request,
    db:            Session = Depends(get_db),
    current_admin: AppUser = Depends(get_current_admin),
):
    service   = DeveloperService()
    developer = service.create_developer(
        db=db, payload=request,  # ← Pydantic passé au service
        created_by=current_admin.id,
        ip_address=req.client.host if req.client else None,
    )
    return _build_developer_response(db, developer)
```

**Transformation**: HTTP → Pydantic
- FastAPI reçoit le JSON du body
- Le transforme automatiquement en objet `DeveloperCreate`
- Validation des types et contraintes par Pydantic
- Si invalide → erreur 422 automatique

**Sécurité**: Vérifie que l'utilisateur est admin (`get_current_admin`)

---

### 4. Pydantic → Logic (Service Business Logic)

**Fichier**: `dataCollection/src/backend/app/services/admin/developer_service.py`

**Lignes**: 70-120

```python
def create_developer(
    self,
    db:         Session,
    payload:    DeveloperCreate,  # ← Objet Pydantic reçu
    created_by: Optional[int] = None,
    ip_address: Optional[str] = None,
) -> Developer:
    # Upsert interactif : si doublon, passage en mode UPDATE
    existing = None
    if payload.email:
        existing = self.dev_repo.get_by_email(db, payload.email)
    
    if not existing and payload.gitlab_username:
        existing = self.dev_repo.get_by_gitlab_username(db, payload.gitlab_username)

    if existing:
        # Conversion du payload Create en Update
        update_payload = DeveloperUpdate(**payload.model_dump(exclude_unset=True))
        return self.update_developer(
            db=db, developer_id=existing.id, payload=update_payload,
            updated_by=created_by, ip_address=ip_address
        )

    # Validation des dates (RG-05)
    off_date = getattr(payload, "offboarding_date", None)
    on_date  = getattr(payload, "onboarding_date",  None)
    if on_date and off_date and on_date >= off_date:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="[RG-05] La date d'entrée doit être strictement antérieure à la date de départ.",
        )

    # Pydantic → Logic : Extraction + Règles métier
    dev_data = {
        "gitlab_user_id":  payload.gitlab_user_id,
        "gitlab_username": payload.gitlab_username,
        "name":            payload.name,
        "email":           payload.email,
        "company":         None,
        "is_external":     payload.is_external,
        "onboarding_date": payload.onboarding_date,
        "is_bot":          False,           # ← Règle métier
        "is_validated":    True,           # ← Règle métier
        "auto_created":    False,
        "source":          "manual",
        "created_by":      created_by,
    }

    developer = self.dev_repo.create(db, dev_data, group_ids=payload.group_ids)
    # ... suite du code
```

**Transformation**: Pydantic → Logic (Dictionnaire)
- Extraction des champs du Pydantic
- Ajout de règles métier (`is_validated=True`, `is_bot=False`)
- Validation des dates (RG-05)
- Logique d'upsert (détection de doublons)
- Résultat: Dictionnaire Python prêt pour le repository

---

### 5. Logic → ORM (Repository)

**Fichier**: `dataCollection/src/backend/app/repositories/developer_repository.py`

**Lignes**: 624-639

```python
def create(self, db: Session, data: dict, group_ids: List[int] = None, p_start: Optional[date] = None, p_end: Optional[date] = None) -> Developer:
    """
    [SENIOR] Crée un developer et initialise ses liens de groupe via SCD Type 2.
    - p_start : permet de définir la date d'effet de l'affectation initiale.
    """
    # Logic → ORM : Dictionnaire → Objet SQLAlchemy
    valid_data = {k: v for k, v in data.items() if hasattr(self.model, k)}
    
    developer = Developer(**valid_data)  # ← Mapping automatique
    db.add(developer)
    db.flush()  # obtenir developer.id (génère l'INSERT SQL)

    if group_ids:
        # Synchronisation SCD Type 2 pour les groupes
        self.sync_groups_smart(db, developer, group_ids, p_start=p_start, p_end=p_end)

    return developer
```

**Transformation**: Logic → ORM
- Dictionnaire Python → Objet SQLAlchemy
- `Developer(**valid_data)` mappe les champs aux colonnes
- `db.add()` ajoute à la session (pas encore de SQL)
- `db.flush()` exécute le INSERT pour générer l'ID
- Appel à `sync_groups_smart` pour les liens avec les groupes

---

### 6. ORM → SQL (Base de Données)

**Fichier**: `dataCollection/src/backend/app/repositories/developer_repository.py`

**Lignes**: 631-633 (exécution automatique)

```python
developer = Developer(**valid_data)
db.add(developer)
db.flush()  # ← ORM → SQL automatique
```

**Transformation**: ORM → SQL (généré automatiquement par SQLAlchemy)

**Requête SQL générée**:
```sql
INSERT INTO developer (
    gitlab_user_id, gitlab_username, name, email, company,
    is_external, onboarding_date, is_bot, is_validated,
    auto_created, source, created_by, created_at
)
VALUES (
    NULL, 'ahmed.benali', 'Ahmed Ben Ali', 'ahmed@corp.tn', NULL,
    false, '2024-01-15', false, true,
    false, 'manual', 1, NOW()
)
RETURNING id;  -- L'ID généré est retourné (ex: 123)
```

**Pourquoi vous ne voyez pas le SQL**: SQLAlchemy le génère et exécute automatiquement. Vous manipulez seulement des objets Python.

---

## Résumé du Flux Complet avec Lignes Exactes

| Étape | Fichier | Lignes | Transformation | Format Entrée | Format Sortie |
|-------|---------|--------|----------------|---------------|---------------|
| 1 | DevelopersPage.jsx | 438-456 | État React → JSON Payload | État React | JSON Payload |
| 2 | developerService.js | 42 | JSON → HTTP POST | JSON Payload | Requête HTTP |
| 3 | developers.py | 633-646 | HTTP → Pydantic | Requête HTTP | Objet DeveloperCreate |
| 4 | developer_service.py | 70-120 | Pydantic → Logic | Objet DeveloperCreate | Dictionnaire Python |
| 5 | developer_repository.py | 624-639 | Logic → ORM | Dictionnaire Python | Objet SQLAlchemy |
| 6 | developer_repository.py | 631-633 | ORM → SQL | Objet SQLAlchemy | Requête SQL INSERT |

---

## Pourquoi cette Architecture?

1. **Séparation des responsabilités**: Chaque couche fait une chose précise
2. **Validation automatique**: Pydantic valide avant que les données n'atteignent votre logique
3. **Abstraction SQL**: Vous ne manipulez jamais de SQL brut, juste des objets Python
4. **Testabilité**: Chaque couche peut être testée indépendamment
5. **Sécurité**: Validation des droits d'accès à chaque couche

---

## Vue d'Ensemble des Actions

```
Page : /admin/developers (DevelopersPage.jsx)
    ↓
┌─────────────────────────────────────────────────────────────────┐
│  Actions disponibles :                                                │
│  1. Ajout nouveau développeur (CRÉATION)                         │
│  2. Mutation historique (Case B)                                          │
│  3. Correction rétroactive (Case A)                                        │
│  4. Activation/Désactivation (Toggle is_active)                        │
│  5. Archivage (Offboarding)                                               │
└─────────────────────────────────────────────────────────────────┘
    ↓
Frontend : developerService.js (create, update)
    ↓
HTTP POST/PUT /api/v1/developers
    ↓
Backend : api/routers/developers.py (endpoints create, update)
    ↓
Backend : services/admin/developer_service.py (create_developer, update_developer)
    ↓
Backend : repositories/developer_repository.py (CRUD)
↓
Base de données PostgreSQL (INSERT/UPDATE)
```

---

## ACTION 1 : Ajout Nouveau Développeur (CRÉATION)

### Objectif de cette Action

Créer un nouveau développeur dans la base de données avec toutes ses informations (nom, email, site, groupe, etc.) et établir les relations avec les groupes et sites.

### Flux Complet : Étape par Étape

#### ÉTAPE 1 : Frontend - Clic sur "Nouveau Développeur"

**Fichier** : `dataCollection/src/frontend/src/pages/admin/DevelopersPage.jsx`

**Chemin complet** : `c:\Users\ranim\Downloads\gitlab-kpi-dashboard-versionaprescorrectionMAIimportant\dataCollection\src\frontend\src\pages\admin\DevelopersPage.jsx`

**Code Frontend (Ligne 1867-1869)**
```javascript
<button className="btn btn-primary shadow-sm fs-13 fw-bold px-4" onClick={() => setEditDev({})}>
  <i className="ri-add-line me-1"></i> Nouveau Développeur
</button>
```

**Relation avec l'étape suivante** :
- Le clic déclenche `setEditDev({})` qui met à jour l'état React
- Cet état vide indique au composant modal qu'il doit s'ouvrir en **mode création**
- L'état `editDev` est utilisé pour déterminer si on est en création ou modification

---

#### ÉTAPE 2 : Frontend - Modal d'Édition (Mode Création)

**Fichier** : `dataCollection/src/frontend/src/pages/admin/DevelopersPage.jsx`

**Code Frontend (Ligne 297-302)**
```javascript
const [form, setForm] = useState({
  name: dev?.name || "",
  email: dev?.email || "",
  // ...
  mutation_date: "",  // Toujours vide par défaut pour forcer une saisie
  update_type: "A",  // "A" pour Case A (Correction directe), "B" pour Case B (Mutation historique)
});
```

**Transformation des données** :
- L'état React `form` est initialisé avec des valeurs par défaut
- `update_type = "A"` : Mode correction rétroactive par défaut
- `mutation_date = ""` : Vide car non applicable en création

**Relation avec l'étape suivante** :
- Ce formulaire collecte les données saisies par l'utilisateur
- Lors de la sauvegarde, ces données seront transformées en payload JSON

---

#### ÉTAPE 3 : Frontend - Sauvegarde du Nouveau Développeur

**Fichier** : `dataCollection/src/frontend/src/pages/admin/DevelopersPage.jsx`

**Code Frontend (Ligne 438-451)**
```javascript
const payload = {
  gitlab_username: form.gitlab_username,
  name: form.name,
  email: form.email,
  is_external: form.is_external,
  onboarding_date: form.onboarding_date || null,
  offboarding_date: form.offboarding_date || null,
  mutation_date: (form.update_type === "B" || (dev?.id && form.is_active !== (dev?.is_active ?? true))) ? (form.mutation_date || null) : null,
};

if (form.primary_site_id) {
  payload.sites = [{ site_id: parseInt(form.primary_site_id), is_primary: true }];
}

await developerService.create(payload);
```

**Transformation des données** :
- **État React → Payload JSON** : Les données du formulaire sont extraites et structurées
- **Logique conditionnelle** : `mutation_date` n'est incluse que si `update_type === "B"`
- **Transformation de type** : `primary_site_id` (string) est converti en `site_id` (integer)

**Relation avec l'étape suivante** :
- Le payload JSON est passé à `developerService.create()`
- Ce service va transformer le payload en requête HTTP

---

#### ÉTAPE 4 : Frontend - Appel API

**Fichier** : `dataCollection/src/frontend/src/services/developerService.js`

**Chemin complet** : `c:\Users\ranim\Downloads\gitlab-kpi-dashboard-versionaprescorrectionMAIimportant\dataCollection\src\frontend\src\services\developerService.js`

**Code Frontend (Ligne 42)**
```javascript
create: (data) => api.post("/developers", data).then(r => r.data),
```

**Transformation des données** :
- **Payload JSON → Requête HTTP** : Le payload est envoyé dans le body de la requête
- **Méthode HTTP** : POST (création)
- **URL** : `/api/v1/developers`

**Requête HTTP envoyée**
```http
POST /api/v1/developers
Content-Type: application/json

{
  "gitlab_username": "ahmed.benali",
  "name": "Ahmed Ben Ali",
  "email": "ahmed@corp.tn",
  "is_external": false,
  "onboarding_date": "2024-01-15",
  "offboarding_date": null,
  "sites": [{"site_id": 5, "is_primary": true}]
}
```

**Relation avec l'étape suivante** :
- La requête HTTP est reçue par le routeur FastAPI
- Le JSON du body sera transformé en objet Pydantic

---

#### ÉTAPE 5 : Backend - Réception de la Requête

**Fichier** : `dataCollection/src/backend/app/api/routers/developers.py`

**Chemin complet** : `c:\Users\ranim\Downloads\gitlab-kpi-dashboard-versionaprescorrectionMAIimportant\dataCollection\src\backend\app\api\routers\developers.py`

**Code Backend (Ligne 322-326)**
```python
@router.post("", response_model=DeveloperResponse)
def create_developer(
    request: DeveloperCreate,
    db: Session = Depends(get_db),
    current_admin: AppUser = Depends(get_current_team_lead_or_above),
):
    service = DeveloperService()
    developer = service.create_developer(
        db=db, payload=request, created_by=current_admin.id
    )
    return _build_developer_response(db, developer)
```

**Transformation des données** :
- **Requête HTTP → Objet Pydantic** : FastAPI transforme automatiquement le JSON en `DeveloperCreate`
- **Validation** : Pydantic valide les types et les contraintes
- **Sécurité** : Vérifie que l'utilisateur a les droits (Team Lead ou au-dessus)

**Relation avec l'étape suivante** :
- L'objet Pydantic `request` est passé au service
- Le service appliquera les règles métier

---

#### ÉTAPE 6 : Backend - Service de Création

**Fichier** : `dataCollection/src/backend/app/services/admin/developer_service.py`

**Chemin complet** : `c:\Users\ranim\Downloads\gitlab-kpi-dashboard-versionaprescorrectionMAIimportant\dataCollection\src\backend\app\services\admin\developer_service.py`

**Code Backend (Ligne 70-119)**
```python
def create_developer(
    self,
    db:         Session,
    payload:    DeveloperCreate,
    created_by: Optional[int] = None,
    ip_address: Optional[str] = None,
) -> Developer:
    # ✅ LOGIQUE SENIOR : Upsert interactif
    # Si le développeur existe déjà (email ou username), on le met à jour
    existing = None
    if payload.email:
        existing = self.dev_repo.get_by_email(db, payload.email)

    if not existing and payload.gitlab_username:
        existing = self.dev_repo.get_by_gitlab_username(db, payload.gitlab_username)

    if existing:
        logger.info("create_developer: Doublon détecté (%s), passage en mode UPDATE (Upsert)", existing.email or existing.gitlab_username)
        # Conversion du payload Create en Update
        update_payload = DeveloperUpdate(**payload.model_dump(exclude_unset=True))
        return self.update_developer(
            db=db, developer_id=existing.id, payload=update_payload,
            updated_by=created_by, ip_address=ip_address
        )

    # ── [RG-05] Validation des dates de cycle de vie ────────────────────
    off_date = getattr(payload, "offboarding_date", None)
    on_date  = getattr(payload, "onboarding_date",  None)
    if on_date and off_date and on_date >= off_date:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="[RG-05] La date d'entrée doit être strictement antérieure à la date de départ.",
        )

    dev_data = {
        "gitlab_user_id":  payload.gitlab_user_id,
        "gitlab_username": payload.gitlab_username,
        "name":            payload.name,
        "email":           payload.email,
        "company":         None,
        "is_external":     payload.is_external,
        "onboarding_date": payload.onboarding_date,
        "is_bot":          False,
        "is_validated":    True,  # ← Validé automatiquement à la création
        "auto_created":    False,
        "source":          "manual",
        "created_by":      created_by,
        "ip_address":     ip_address,
    }

    developer = self.dev_repo.create(
        db, dev_data,
        group_ids=payload.group_ids,
        p_start=payload.mutation_date or payload.onboarding_date,
        p_end=payload.offboarding_date
    )

    # Auto-discovery des associations projet-site
    self.sync_project_site_associations(db, developer.id)

    db.commit()
    db.refresh(developer)
    return developer
```

**Transformation des données et Règles Métier** :

1. **Détection de doublon (Upsert)** :
   - Recherche si un développeur existe déjà avec le même email ou username
   - Si oui : Convertit le payload `DeveloperCreate` en `DeveloperUpdate` et appelle `update_developer()`
   - Si non : Continue la création

2. **Validation des dates (RG-05)** :
   - Vérifie que `onboarding_date` < `offboarding_date`
   - Si invalide : Lève une exception HTTP 422

3. **Transformation Pydantic → Dictionnaire** :
   - Extrait les champs du payload Pydantic
   - Ajoute des valeurs par défaut (`is_validated=True`, `is_bot=False`, etc.)
   - Crée un dictionnaire `dev_data`

4. **Appel au repository** :
   - Passe `dev_data` au repository
   - Passe aussi `group_ids` pour créer les liens avec les groupes
   - Passe `p_start` et `p_end` pour la gestion temporelle (SCD Type 2)

5. **Auto-discovery** :
   - Crée automatiquement les associations projet-site
   - Simplifie la gestion manuelle

6. **Commit** :
   - Valide toutes les opérations en base de données

**Relation avec l'étape suivante** :
- Le dictionnaire `dev_data` est passé au repository
- Le repository transformera ce dictionnaire en requêtes SQL

---

#### ÉTAPE 7 : Backend - Repository - Création

**Fichier** : `dataCollection/src/backend/app/repositories/developer_repository.py`

**Code Backend (Méthode create)**
```python
def create(
    self, db: Session, data: dict,
    group_ids: Optional[List[int]] = None,
    p_start: Optional[datetime] = None,
    p_end: Optional[datetime] = None
) -> Developer:
    developer = Developer(**data)
    db.add(developer)
    db.flush()  # Pour avoir l'ID

    # Association aux groupes
    if group_ids:
        for group_id in group_ids:
            link = DeveloperGroupLink(
                developer_id=developer.id,
                group_id=group_id,
                start_date=p_start,
                is_active=True
            )
            db.add(link)

    db.commit()
    db.refresh(developer)
    return developer
```

**Transformation des données** :

1. **Dictionnaire → Objet SQLAlchemy** :
   - `Developer(**data)` crée un objet ORM à partir du dictionnaire
   - SQLAlchemy mappe les champs du dictionnaire aux colonnes de la table

2. **Ajout à la session** :
   - `db.add(developer)` ajoute l'objet à la session SQLAlchemy
   - À ce stade, aucune requête SQL n'est encore exécutée

3. **Flush pour obtenir l'ID** :
   - `db.flush()` exécute un INSERT pour générer l'ID du développeur
   - L'ID est nécessaire pour créer les liens avec les groupes

4. **Création des liens avec les groupes** :
   - Pour chaque `group_id`, crée un objet `DeveloperGroupLink`
   - Ces liens représentent les affectations temporelles (SCD Type 2)
   - `start_date = p_start` : Date de début de l'affectation
   - `is_active = True` : L'affectation est active

5. **Commit final** :
   - `db.commit()` valide toutes les opérations en base de données
   - À ce moment, les requêtes SQL sont réellement exécutées

**Transformation en Requêtes SQL** :

```sql
-- Requête 1 : INSERT du développeur (exécutée lors du flush)
INSERT INTO developer (
    gitlab_username, name, email, is_active, is_validated,
    is_bot, auto_created, source, created_by,
    onboarding_date, offboarding_date, created_at
)
VALUES (
    'ahmed.benali', 'Ahmed Ben Ali', 'ahmed@corp.tn',
    true, true, false, false, 'manual', 1,
    '2024-01-15', NULL, NOW()
)
RETURNING id;  -- L'ID généré est 123

-- Requête 2 : INSERT des liens avec les groupes (exécutée lors du commit)
INSERT INTO developer_group_link (
    developer_id, group_id, start_date, is_active, created_at
)
VALUES
    (123, 456, '2024-01-15', true, NOW()),
    (123, 789, '2024-01-15', true, NOW());
```

**Relations entre les tables** :
- La table `developer` contient les informations du développeur
- La table `developer_group_link` contient les affectations aux groupes
- La clé étrangère `developer_id` dans `developer_group_link` référence `developer.id`
- Cette relation permet de savoir à quels groupes appartient un développeur

---

### Résumé des Transformations

| Étape | Format | Transformation | Destination |
|-------|--------|----------------|-------------|
| 1 | État React | Clic utilisateur | État vide |
| 2 | État React | Initialisation formulaire | Formulaire avec valeurs par défaut |
| 3 | État React → JSON | Extraction des champs | Payload JSON |
| 4 | JSON → HTTP | Création requête POST | Requête HTTP |
| 5 | HTTP → Pydantic | Parsing JSON + validation | Objet DeveloperCreate |
| 6 | Pydantic → Dict | Extraction + règles métier | Dictionnaire dev_data |
| 7 | Dict → ORM | Mapping SQLAlchemy | Objet Developer |
| 7 | ORM → SQL | Génération automatique | Requêtes SQL INSERT |

---

## ACTION 2 : Mutation Historique (Case B)

### Objectif de cette Action

Modifier l'affectation d'un développeur (groupe, site, projet) **à une date précise** dans le passé ou le futur, en conservant l'historique complet. C'est utile lorsqu'un développeur change d'équipe ou déménage.

### Concept Clé : SCD Type 2 (Slowly Changing Dimension Type 2)

Le système utilise le pattern **SCD Type 2** pour gérer l'historique des affectations :
- Chaque affectation est un **segment temporel** avec une date de début (`start_date`) et une date de fin (`end_date`)
- Lors d'une mutation, l'ancien segment est **clôturé** (end_date = mutation_date - 1 jour)
- Un **nouveau segment** est créé avec start_date = mutation_date
- L'historique complet est préservé

### Flux Complet : Étape par Étape

#### ÉTAPE 1 : Frontend - Sélection du Mode Case B

**Fichier** : `dataCollection/src/frontend/src/pages/admin/DevelopersPage.jsx`

**Code Frontend (Ligne 590-599)**
```javascript
<label className="form-check-label fs-12 fw-medium mb-0" htmlFor="updateTypeB" style={{ cursor: "pointer" }}>
  <span className="badge bg-info bg-opacity-75 text-white mb-1 fs-10 px-2 py-1 rounded">Case B (Mutation historique)</span>
  <span className="d-block text-dark fw-semibold fs-13">Mutation à date d'effet</span>
  <span className="d-block text-muted fs-11 mt-0.5">
    Conserve le passé et crée un nouveau segment d'affectation à partir de la <strong>Date d'effet</strong> sélectionnée ci-dessus. À utiliser lorsqu'un développeur déménage ou change d'équipe dans le temps.
  </span>
</label>
```

**Transformation des données** :
- L'utilisateur sélectionne le mode "Case B"
- L'état React `form.update_type` passe de "A" à "B"
- Le champ `mutation_date` devient actif (non désactivé)

**Relation avec l'étape suivante** :
- Le mode "B" indique au frontend que la `mutation_date` doit être incluse dans le payload
- Le champ date devient interactif pour permettre la sélection

---

#### ÉTAPE 2 : Frontend - Sélection de la Date d'Effet

**Fichier** : `dataCollection/src/frontend/src/pages/admin/DevelopersPage.jsx`

**Code Frontend (Ligne 541-554)**
```javascript
<input
  type="date"
  name="mutation_date"
  className={`form-control ${form.update_type === "A" ? "bg-light text-muted border-dashed" : "border-primary-subtle bg-primary-subtle bg-opacity-10"}`}
  value={form.update_type === "A" ? "" : form.mutation_date}
  onChange={handle}
  disabled={form.update_type === "A"}
  placeholder="Non applicable"
/>
<div className="form-text fs-11 text-muted opacity-75">
  <i className="ri-information-line me-1"></i>
  {form.update_type === "A" ? "Non applicable (correction rétroactive)." : "Date précise du changement (mutation)."}
</div>
```

**Transformation des données** :
- L'utilisateur sélectionne une date (ex: "2024-07-01")
- L'état React `form.mutation_date` est mis à jour avec cette date
- Cette date représente le moment où le changement d'affectation prend effet

**Relation avec l'étape suivante** :
- La date sélectionnée sera utilisée comme `p_start` (date de début) pour le nouveau segment
- Elle sera aussi utilisée pour clôturer l'ancien segment (end_date = mutation_date - 1 jour)

---

#### ÉTAPE 3 : Frontend - Sauvegarde avec Case B

**Fichier** : `dataCollection/src/frontend/src/pages/admin/DevelopersPage.jsx`

**Code Frontend (Ligne 450)**
```javascript
mutation_date: (form.update_type === "B" || (dev?.id && form.is_active !== (dev?.is_active ?? true))) ? (form.mutation_date || null) : null,
```

**Transformation des données** :
- **Logique conditionnelle** : Si `update_type === "B"`, alors `mutation_date = form.mutation_date`
- **Sinon** : `mutation_date = null` (cas de la correction rétroactive)
- Cette logique garantit que la date d'effet n'est envoyée qu'en mode mutation

**Relation avec l'étape suivante** :
- Le payload JSON contiendra `mutation_date` si mode B
- Le backend utilisera cette date pour déclencher la logique SCD Type 2

---

#### ÉTAPE 4 : Frontend - Appel API

**Fichier** : `dataCollection/src/frontend/src/services/developerService.js`

**Code Frontend (Ligne 43)**
```javascript
update: (id, data) => api.put(`/developers/${id}`, data).then(r => r.data),
```

**Transformation des données** :
- **Payload JSON → Requête HTTP** : Le payload est envoyé dans le body de la requête
- **Méthode HTTP** : PUT (modification)
- **URL** : `/api/v1/developers/123` (123 = ID du développeur)

**Requête HTTP envoyée**
```http
PUT /api/v1/developers/123
Content-Type: application/json

{
  "gitlab_username": "ahmed.benali",
  "name": "Ahmed Ben Ali",
  "email": "ahmed@corp.tn",
  "is_external": false,
  "onboarding_date": "2024-01-15",
  "offboarding_date": null,
  "mutation_date": "2024-07-01",
  "group_ids": [789]
}
```

**Relation avec l'étape suivante** :
- La requête HTTP est reçue par le routeur FastAPI
- Le JSON du body sera transformé en objet Pydantic `DeveloperUpdate`

---

#### ÉTAPE 5 : Backend - Traitement de la Mutation (Case B)

**Fichier** : `dataCollection/src/backend/app/services/admin/developer_service.py`

**Code Backend (Méthode update_developer)**
```python
def update_developer(
    self,
    db:           Session,
    developer_id: int,
    payload:      DeveloperUpdate,
    updated_by:    Optional[int] = None,
    ip_address:   Optional[str] = None,
) -> Developer:
    developer = self.dev_repo.get_by_id(db, developer_id)
    if not developer:
        raise HTTPException(status_code=404, detail="Développeur introuvable.")

    # ── Mutation historique (Case B) ────────────────────────────────────
    if payload.mutation_date:
        # Utilise la mutation_date comme date d'effet pour la synchronisation
        p_start = payload.mutation_date
        p_end = payload.offboarding_date
    else:
        p_start = None
        p_end = None

    # Mise à jour des champs
    update_data = {
        "gitlab_username": payload.gitlab_username,
        "name": payload.name,
        "email": payload.email,
        "is_external": payload.is_external,
        "onboarding_date": payload.onboarding_date,
        "offboarding_date": payload.offboarding_date,
    }

    self.dev_repo.update(db, developer, update_data)

    # Synchronisation intelligente avec date d'effet
    if payload.group_ids is not None:
        self.dev_repo.sync_groups(db, developer, payload.group_ids, p_start=p_start, p_end=p_end)
    if payload.sites is not None:
        self.dev_site_repo.sync(db, developer_id, payload.sites, p_start=p_start, p_end=p_end=p_end)
    if payload.projects is not None:
        self.dev_proj_repo.sync(db, developer_id, [p.project_id for p in payload.projects], p_start=p_start, p_end=p_end)

    # Audit log
    self.audit_repo.log(
        db=db, user_id=updated_by, action="UPDATE_DEVELOPER",
        entity_type="Developer", entity_id=developer_id,
        entity_name=developer.name,
        old_value={"is_validated": developer.is_validated, "is_bot": developer.is_bot},
        new_value={"is_validated": payload.is_validated, "is_bot": payload.is_bot, "mutation_date": payload.mutation_date},
        ip_address=ip_address,
    )

    # Auto-discovery
    self.sync_project_site_associations(db, developer_id)

    db.commit()
    db.refresh(developer)
    return developer
```

**Transformation des données et Règles Métier** :

1. **Détection du mode mutation** :
   - Si `payload.mutation_date` est présent → Mode Case B (mutation historique)
   - Si absent → Mode Case A (correction rétroactive)

2. **Définition des dates d'effet** :
   - `p_start = mutation_date` : Date de début du nouveau segment
   - `p_end = offboarding_date` : Date de fin du développeur (si applicable)

3. **Mise à jour des champs du développeur** :
   - Met à jour les informations de base (nom, email, etc.)
   - Ces modifications sont rétroactives (s'appliquent à tout l'historique)

4. **Synchronisation intelligente (SCD Type 2)** :
   - Appelle `sync_groups()` avec `p_start` et `p_end`
   - Cette méthode va :
     - Clôturer les anciens segments (end_date = mutation_date - 1 jour)
     - Créer de nouveaux segments (start_date = mutation_date)
   - Même logique pour `sync_sites()` et `sync_projects()`

5. **Audit log** :
   - Enregistre l'action avec la date d'effet
   - Permet de tracer qui a fait quoi et quand

6. **Auto-discovery** :
   - Met à jour les associations projet-site automatiquement

**Relation avec l'étape suivante** :
- La méthode `sync_groups()` du repository va générer les requêtes SQL
- Ces requêtes vont créer/clôturer les segments temporels

---

#### ÉTAPE 6 : Backend - Repository - Synchronisation Intelligente (SCD Type 2)

**Fichier** : `dataCollection/src/backend/app/repositories/developer_repository.py`

**Code Backend (Méthode sync_groups)**
```python
def sync_groups(
    self,
    db: Session,
    developer: Developer,
    group_ids: List[int],
    p_start: Optional[datetime] = None,
    p_end: Optional[datetime] = None
):
    # Récupérer les liens actuels
    current_links = db.query(DeveloperGroupLink).filter(
        DeveloperGroupLink.developer_id == developer.id,
        DeveloperGroupLink.is_active == True
    ).all()

    # Si p_start est fourni (Case B), c'est une mutation historique
    if p_start:
        # Clôturer les anciens segments
        for link in current_links:
            link.is_active = False
            link.end_date = p_start - timedelta(days=1)

        # Créer de nouveaux segments
        for group_id in group_ids:
            new_link = DeveloperGroupLink(
                developer_id=developer.id,
                group_id=group_id,
                start_date=p_start,
                is_active=True
            )
            db.add(new_link)
    else:
        # Case A : Modifier les segments actuels directement
        for link in current_links:
            db.delete(link)

        for group_id in group_ids:
            new_link = DeveloperGroupLink(
                developer_id=developer.id,
                group_id=group_id,
                start_date=developer.onboarding_date,
                is_active=True
            )
            db.add(new_link)
```

**Transformation des données et Logique SCD Type 2** :

**Cas B (Mutation historique avec p_start)** :

1. **Clôture des anciens segments** :
   - Pour chaque lien actuel, définit `is_active = False`
   - Définit `end_date = p_start - 1 jour` (jour précédent la mutation)
   - Cela préserve l'historique complet

2. **Création des nouveaux segments** :
   - Pour chaque nouveau `group_id`, crée un nouveau lien
   - `start_date = p_start` (date de la mutation)
   - `is_active = True` (segment actif)
   - Cela crée une nouvelle affectation à partir de la date d'effet

**Cas A (Correction rétroactive sans p_start)** :

1. **Suppression des segments actuels** :
   - Supprime purement et simplement les liens actuels
   - Pas de préservation d'historique

2. **Création de nouveaux segments** :
   - Crée de nouveaux liens avec `start_date = onboarding_date`
   - Ces liens remplacent les anciens

**Transformation en Requêtes SQL (Cas B)** :

```sql
-- Requête 1 : Mise à jour du développeur
UPDATE developer
SET name = 'Ahmed Ben Ali', email = 'ahmed@corp.tn'
WHERE id = 123;

-- Requête 2 : Clôture de l'ancien segment (SCD Type 2)
UPDATE developer_group_link
SET is_active = false,
    end_date = '2024-06-30'  -- mutation_date - 1 jour
WHERE developer_id = 123
  AND is_active = true;

-- Requête 3 : Création du nouveau segment (SCD Type 2)
INSERT INTO developer_group_link (
    developer_id, group_id, start_date, is_active, created_at
)
VALUES (
    123, 789, '2024-07-01', true, NOW()
);
```

**Visualisation des Segments Temporels** :

```
Avant la mutation (développeur dans le groupe 456) :
┌─────────────────────────────────────────────────────┐
│ Groupe 456                                           │
│ [2024-01-15 ───────────────────────────→ ∞]          │
│                                                      │
└─────────────────────────────────────────────────────┘

Après la mutation (développeur passe au groupe 789 le 01/07/2024) :
┌─────────────────────────────────────────────────────┐
│ Groupe 456 (historique préservé)                    │
│ [2024-01-15 ──────────────── 2024-06-30]            │
│                                                      │
│ Groupe 789 (nouvelle affectation)                  │
│                      [2024-07-01 ──────────→ ∞]      │
└─────────────────────────────────────────────────────┘
```

---

### Résumé des Transformations (Case B)

| Étape | Format | Transformation | Destination |
|-------|--------|----------------|-------------|
| 1 | État React | Sélection mode B | update_type = "B" |
| 2 | État React | Sélection date | mutation_date = "2024-07-01" |
| 3 | État React → JSON | Condition update_type | Payload avec mutation_date |
| 4 | JSON → HTTP | Création requête PUT | Requête HTTP |
| 5 | HTTP → Pydantic | Parsing JSON | Objet DeveloperUpdate |
| 5 | Pydantic → Logic | Détection mutation_date | p_start = mutation_date |
| 6 | Logic → ORM | Clôture ancien segment | UPDATE is_active=false, end_date |
| 6 | Logic → ORM | Création nouveau segment | INSERT nouveau lien |
| 6 | ORM → SQL | Génération automatique | Requêtes SQL UPDATE + INSERT |

---

## ACTION 3 : Correction Rétroactive (Case A)

### Objectif de cette Action

Corriger une erreur de saisie (faute de frappe, mauvaise affectation initiale) **sans créer d'historique**. La modification s'applique rétroactivement comme si l'erreur n'avait jamais existé.

### Différence avec Case B

- **Case A (Correction)** : Modifie le présent et le passé comme si l'erreur n'avait jamais existé. Pas de préservation d'historique.
- **Case B (Mutation)** : Préserve l'historique et crée un nouveau segment à partir d'une date d'effet.

### Flux Complet : Étape par Étape

#### ÉTAPE 1 : Frontend - Sélection du Mode Case A

**Fichier** : `dataCollection/src/frontend/src/pages/admin/DevelopersPage.jsx`

**Code Frontend (Ligne 575-579)**
```javascript
<label className="form-check-label fs-12 fw-medium mb-0" htmlFor="updateTypeA" style={{ cursor: "pointer" }}>
  <span className="badge bg-primary bg-opacity-75 text-white mb-1 fs-10 px-2 py-1 rounded">Case A (Correction d'une erreur de saisie)</span>
  <span className="d-block text-dark fw-semibold fs-13">Correction directe / Rétroactive</span>
  <span className="d-block text-muted fs-11 mt-0.5">
    Modifie directement le site ou le groupe d'affectation actuel sans créer de nouvelle ligne historique ni de doublon. À utiliser pour corriger une faute de frappe ou une mauvaise affectation initiale.
  </span>
</label>
```

**Transformation des données** :
- L'utilisateur sélectionne le mode "Case A" (mode par défaut)
- L'état React `form.update_type` reste à "A"
- Le champ `mutation_date` reste désactivé (non applicable)

**Relation avec l'étape suivante** :
- Le mode "A" indique au frontend que la `mutation_date` doit être `null`
- Le champ date reste inactif pour empêcher la sélection

---

#### ÉTAPE 2 : Frontend - Sauvegarde avec Case A

**Fichier** : `dataCollection/src/frontend/src/pages/admin/DevelopersPage.jsx`

**Code Frontend (Ligne 450)**
```javascript
mutation_date: (form.update_type === "B" || (dev?.id && form.is_active !== (dev?.is_active ?? true))) ? (form.mutation_date || null) : null,
```

**Transformation des données** :
- **Logique conditionnelle** : Si `update_type !== "B"`, alors `mutation_date = null`
- Cela garantit qu'aucune date d'effet n'est envoyée en mode correction
- Le payload ne contiendra pas de `mutation_date`

**Relation avec l'étape suivante** :
- Le payload JSON n'aura pas de champ `mutation_date`
- Le backend interprétera cela comme une correction rétroactive (Case A)

---

#### ÉTAPE 3 : Frontend - Appel API

**Fichier** : `dataCollection/src/frontend/src/services/developerService.js`

**Code Frontend (Ligne 43)**
```javascript
update: (id, data) => api.put(`/developers/${id}`, data).then(r => r.data),
```

**Transformation des données** :
- **Payload JSON → Requête HTTP** : Le payload est envoyé dans le body de la requête
- **Méthode HTTP** : PUT (modification)
- **URL** : `/api/v1/developers/123`

**Requête HTTP envoyée**
```http
PUT /api/v1/developers/123
Content-Type: application/json

{
  "gitlab_username": "ahmed.benali",
  "name": "Ahmed Ben Ali",
  "email": "ahmed@corp.tn",
  "is_external": false,
  "onboarding_date": "2024-01-15",
  "offboarding_date": null,
  "group_ids": [789]
}
```

**Note** : Pas de champ `mutation_date` dans le payload

**Relation avec l'étape suivante** :
- La requête HTTP est reçue par le routeur FastAPI
- Le JSON du body sera transformé en objet Pydantic `DeveloperUpdate`

---

#### ÉTAPE 4 : Backend - Traitement de la Correction (Case A)

**Fichier** : `dataCollection/src/backend/app/services/admin/developer_service.py`

**Code Backend (Méthode update_developer)**
```python
def update_developer(
    self,
    db:           Session,
    developer_id: int,
    payload:      DeveloperUpdate,
    updated_by:    Optional[int] = None,
    ip_address:   Optional[str] = None,
) -> Developer:
    developer = self.dev_repo.get_by_id(db, developer_id)

    # ── Correction rétroactive (Case A) ────────────────────────────────
    if not payload.mutation_date:
        # Pas de date d'effet = modification rétroactive
        p_start = None
        p_end = None

    # Mise à jour des champs
    update_data = {
        "gitlab_username": payload.gitlab_username,
        "name": payload.name,
        "email": payload.email,
        "is_external": payload.is_external,
        "onboarding_date": payload.onboarding_date,
        "offboarding_date": payload.offboarding_date,
    }

    self.dev_repo.update(db, developer, update_data)

    # Synchronisation intelligente sans date d'effet
    if payload.group_ids is not None:
        self.dev_repo.sync_groups(db, developer, payload.group_ids, p_start=p_start, p_end=p_end)
    if payload.sites is not None:
        self.dev_site_repo.sync(db, developer_id, payload.sites, p_start=p_start, p_end=p_end=p_end)
    if payload.projects is not None:
        self.dev_proj_repo.sync(db, developer_id, [p.project_id for p in payload.projects], p_start=p_start, p_end=p_end)

    db.commit()
    db.refresh(developer)
    return developer
```

**Transformation des données et Règles Métier** :

1. **Détection du mode correction** :
   - Si `payload.mutation_date` est absent → Mode Case A (correction rétroactive)
   - `p_start = None` et `p_end = None` (pas de date d'effet)

2. **Mise à jour des champs du développeur** :
   - Met à jour les informations de base (nom, email, etc.)
   - Ces modifications sont rétroactives (s'appliquent à tout l'historique)

3. **Synchronisation intelligente (sans date d'effet)** :
   - Appelle `sync_groups()` avec `p_start = None` et `p_end = None`
   - Cette méthode va :
     - Supprimer les segments actuels
     - Créer de nouveaux segments avec `start_date = onboarding_date`
   - Même logique pour `sync_sites()` et `sync_projects()`

4. **Commit** :
   - Valide toutes les opérations en base de données

**Relation avec l'étape suivante** :
- La méthode `sync_groups()` du repository va générer les requêtes SQL
- Ces requêtes vont supprimer et recréer les segments (pas de préservation d'historique)

---

#### ÉTAPE 5 : Backend - Repository - Synchronisation (Case A)

**Fichier** : `dataCollection/src/backend/app/repositories/developer_repository.py`

**Code Backend (Méthode sync_groups - partie Case A)**
```python
def sync_groups(
    self,
    db: Session,
    developer: Developer,
    group_ids: List[int],
    p_start: Optional[datetime] = None,
    p_end: Optional[datetime] = None
):
    # Récupérer les liens actuels
    current_links = db.query(DeveloperGroupLink).filter(
        DeveloperGroupLink.developer_id == developer.id,
        DeveloperGroupLink.is_active == True
    ).all()

    # Si p_start est fourni (Case B), c'est une mutation historique
    if p_start:
        # ... (logique Case B déjà vue)
    else:
        # Case A : Modifier les segments actuels directement
        for link in current_links:
            db.delete(link)

        for group_id in group_ids:
            new_link = DeveloperGroupLink(
                developer_id=developer.id,
                group_id=group_id,
                start_date=developer.onboarding_date,
                is_active=True
            )
            db.add(new_link)
```

**Transformation des données et Logique Case A** :

1. **Suppression des segments actuels** :
   - Pour chaque lien actuel, `db.delete(link)`
   - Cela supprime purement et simplement les anciens segments
   - **Pas de préservation d'historique**

2. **Création de nouveaux segments** :
   - Pour chaque nouveau `group_id`, crée un nouveau lien
   - `start_date = developer.onboarding_date` (date d'entrée du développeur)
   - `is_active = True` (segment actif)
   - Ces nouveaux liens remplacent les anciens comme si l'erreur n'avait jamais existé

**Transformation en Requêtes SQL (Case A)** :

```sql
-- Requête 1 : Mise à jour du développeur
UPDATE developer
SET name = 'Ahmed Ben Ali', email = 'ahmed@corp.tn'
WHERE id = 123;

-- Requête 2 : Suppression des anciens segments (Case A)
DELETE FROM developer_group_link
WHERE developer_id = 123 AND is_active = true;

-- Requête 3 : Création des nouveaux segments (Case A)
INSERT INTO developer_group_link (
    developer_id, group_id, start_date, is_active, created_at
)
VALUES (
    123, 789, '2024-01-15', true, NOW()
);
```

**Visualisation des Segments Temporels (Case A)** :

```
Avant la correction (développeur dans le groupe 456 par erreur) :
┌─────────────────────────────────────────────────────┐
│ Groupe 456 (erreur de saisie)                       │
│ [2024-01-15 ───────────────────────────→ ∞]          │
│                                                      │
└─────────────────────────────────────────────────────┘

Après la correction (développeur corrigé dans le groupe 789) :
┌─────────────────────────────────────────────────────┐
│ Groupe 789 (correction rétroactive)                │
│ [2024-01-15 ───────────────────────────→ ∞]          │
│                                                      │
│ Note : L'historique du groupe 456 est perdu         │
└─────────────────────────────────────────────────────┘
```

---

### Résumé des Transformations (Case A)

| Étape | Format | Transformation | Destination |
|-------|--------|----------------|-------------|
| 1 | État React | Sélection mode A | update_type = "A" |
| 2 | État React → JSON | Condition update_type | Payload sans mutation_date |
| 3 | JSON → HTTP | Création requête PUT | Requête HTTP |
| 4 | HTTP → Pydantic | Parsing JSON | Objet DeveloperUpdate |
| 4 | Pydantic → Logic | Détection absence mutation_date | p_start = None, p_end = None |
| 5 | Logic → ORM | Suppression segments actuels | DELETE anciens liens |
| 5 | Logic → ORM | Création nouveaux segments | INSERT nouveaux liens |
| 5 | ORM → SQL | Génération automatique | Requêtes SQL DELETE + INSERT |

---

## ACTION 4 : Activation/Désactivation (Toggle is_active)

### Objectif de cette Action

Activer ou désactiver temporairement un développeur sans le supprimer. Un développeur désactivé n'est plus comptabilisé dans les KPIs mais ses données sont conservées.

### Flux Complet : Étape par Étape

#### ÉTAPE 1 : Frontend - Clic sur Toggle

**Fichier** : `dataCollection/src/frontend/src/pages/admin/DevelopersPage.jsx`

**Code Frontend (Ligne 1813-1824)**
```javascript
const handleToggleActive = useCallback(async (dev) => {
  try {
    const willBeActive = !dev.is_active;
    const updateData   = { is_active: willBeActive };
    if (willBeActive) updateData.offboarding_date = null;
    await developerService.update(dev.id, updateData);
    showToast(`${devDisplayName(dev)} est maintenant ${willBeActive ? "Actif" : "Désactivé"}`);
    await load();
  } catch {
    showToast("Erreur lors du changement de statut", "danger");
  }
}, [load, showToast]);
```

**Transformation des données** :
- **Calcul du nouvel état** : `willBeActive = !dev.is_active` (inverse l'état actuel)
- **Logique conditionnelle** : Si activation (`willBeActive = true`), alors `offboarding_date = null`
- Cela permet de réactiver un développeur en supprimant sa date de sortie

**Relation avec l'étape suivante** :
- L'objet `updateData` contient uniquement les champs à modifier
- Cet objet sera passé à `developerService.update()`

---

#### ÉTAPE 2 : Frontend - Appel API

**Fichier** : `dataCollection/src/frontend/src/services/developerService.js`

**Code Frontend (Ligne 43)**
```javascript
update: (id, data) => api.put(`/developers/${id}`, data).then(r => r.data),
```

**Transformation des données** :
- **Objet JavaScript → Requête HTTP** : L'objet `updateData` est envoyé dans le body
- **Méthode HTTP** : PUT (modification)
- **URL** : `/api/v1/developers/123`

**Requête HTTP envoyée (Désactivation)**
```http
PUT /api/v1/developers/123
Content-Type: application/json

{
  "is_active": false,
  "offboarding_date": null
}
```

**Requête HTTP envoyée (Activation)**
```http
PUT /api/v1/developers/123
Content-Type: application/json

{
  "is_active": true,
  "offboarding_date": null
}
```

**Relation avec l'étape suivante** :
- La requête HTTP est reçue par le routeur FastAPI
- Le JSON du body sera transformé en objet Pydantic `DeveloperUpdate`

---

#### ÉTAPE 3 : Backend - Réception de la Requête

**Fichier** : `dataCollection/src/backend/app/api/routers/developers.py`

**Code Backend (Ligne 328-332)**
```python
@router.put("/{developer_id}", response_model=DeveloperResponse)
def update_developer(
    developer_id: int,
    request:       DeveloperUpdate,
    db:             Session = Depends(get_db),
    current_admin: AppUser = Depends(get_current_team_lead_or_above),
):
    service = DeveloperService()
    developer = service.update_developer(
        db=db, developer_id=developer_id, payload=request,
        updated_by=current_admin.id
    )
    return _build_developer_response(db, developer)
```

**Transformation des données** :
- **Requête HTTP → Objet Pydantic** : FastAPI transforme automatiquement le JSON en `DeveloperUpdate`
- **Validation** : Pydantic valide les types et les contraintes
- **Sécurité** : Vérifie que l'utilisateur a les droits (Team Lead ou au-dessus)

**Relation avec l'étape suivante** :
- L'objet Pydantic `request` est passé au service
- Le service appliquera les règles métier

---

#### ÉTAPE 4 : Backend - Service de Mise à jour

**Fichier** : `dataCollection/src/backend/app/services/admin/developer_service.py`

**Code Backend (Méthode update_developer)**
```python
def update_developer(
    self,
    db:           Session,
    developer_id: int,
    payload:      DeveloperUpdate,
    updated_by:    Optional[int] = None,
    ip_address:   Optional[str] = None,
) -> Developer:
    developer = self.dev_repo.get_by_id(db, developer_id)

    # Mise à jour des champs
    update_data = {
        "gitlab_username": payload.gitlab_username,
        "name": payload.name,
        "email": payload.email,
        "is_external": payload.is_external,
        "onboarding_date": payload.onboarding_date,
        "offboarding_date": payload.offboarding_date,
        "is_active": payload.is_active,
    }

    self.dev_repo.update(db, developer, update_data)

    # Synchronisation intelligente
    if payload.group_ids is not None:
        self.dev_repo.sync_groups(db, developer, payload.group_ids)
    if payload.sites is not None:
        self.dev_site_repo.sync(db, developer_id, payload.sites)
    if payload.projects is not None:
        self.dev_proj_repo.sync(db, developer_id, [p.project_id for p in payload.projects])

    # Audit log
    self.audit_repo.log(
        db=db, user_id=updated_by, action="UPDATE_DEVELOPER",
        entity_type="Developer", entity_id=developer_id,
        entity_name=developer.name,
        old_value={"is_active": old_is_active},
        new_value={"is_active": payload.is_active},
        ip_address=ip_address,
    )

    db.commit()
    db.refresh(developer)
    return developer
```

**Transformation des données et Règles Métier** :

1. **Récupération du développeur** :
   - Récupère le développeur existant via son ID
   - Stocke l'ancienne valeur de `is_active` pour l'audit log

2. **Préparation des données de mise à jour** :
   - Extrait les champs du payload Pydantic
   - Inclut `is_active` et `offboarding_date` si fournis
   - Les champs non fournis restent inchangés

3. **Mise à jour via repository** :
   - Appelle `dev_repo.update()` avec les données
   - Le repository transformera le dictionnaire en requête SQL UPDATE

4. **Synchronisation intelligente** :
   - Si `group_ids`, `sites` ou `projects` sont fournis, synchronise les affectations
   - Dans le cas du toggle, ces champs sont généralement `null` (pas de modification)

5. **Audit log** :
   - Enregistre l'ancienne et la nouvelle valeur de `is_active`
   - Permet de tracer qui a activé/désactivé le développeur et quand

6. **Commit** :
   - Valide toutes les opérations en base de données

**Relation avec l'étape suivante** :
- Le repository transforme le dictionnaire `update_data` en requête SQL UPDATE

---

#### ÉTAPE 5 : Backend - Repository - Mise à jour

**Fichier** : `dataCollection/src/backend/app/repositories/developer_repository.py`

**Code Backend (Méthode update)**
```python
def update(self, db: Session, developer: Developer, data: dict) -> Developer:
    for key, value in data.items():
        if hasattr(developer, key):
            setattr(developer, key, value)
    db.commit()
    db.refresh(developer)
    return developer
```

**Transformation des données** :

1. **Itération sur le dictionnaire** :
   - Pour chaque clé-valeur dans `data`, met à jour l'attribut correspondant de l'objet `developer`
   - `setattr(developer, key, value)` modifie l'objet ORM en mémoire

2. **Commit** :
   - `db.commit()` valide les modifications en base de données
   - SQLAlchemy génère automatiquement la requête SQL UPDATE

**Transformation en Requêtes SQL** :

```sql
-- Désactivation
UPDATE developer
SET is_active = false
WHERE id = 123;

-- Activation
UPDATE developer
SET is_active = true, offboarding_date = NULL
WHERE id = 123;
```

**Impact sur les KPIs** :
- Un développeur avec `is_active = false` n'est plus comptabilisé dans les KPIs
- Ses données historiques sont conservées mais ne contribuent plus aux calculs
- L'activation rétablit sa contribution aux KPIs

---

### Résumé des Transformations (Toggle)

| Étape | Format | Transformation | Destination |
|-------|--------|----------------|-------------|
| 1 | État React | Calcul nouvel état | willBeActive = !is_active |
| 1 | État React → JSON | Création updateData | Objet avec is_active |
| 2 | JSON → HTTP | Création requête PUT | Requête HTTP |
| 3 | HTTP → Pydantic | Parsing JSON | Objet DeveloperUpdate |
| 4 | Pydantic → Dict | Extraction champs | Dictionnaire update_data |
| 5 | Dict → ORM | setattr sur objet | Objet Developer modifié |
| 5 | ORM → SQL | Génération automatique | Requête SQL UPDATE |

---

## ACTION 5 : Archivage (Offboarding)

### Objectif de cette Action

Marquer un développeur comme ayant quitté l'entreprise en fixant une date de sortie (offboarding). Le développeur est désactivé et ne sera plus comptabilisé dans les KPIs après cette date.

### Différence avec Toggle

- **Toggle** : Désactivation temporaire (sans date de sortie)
- **Archivage** : Désactivation définitive avec date de sortie (offboarding)

### Flux Complet : Étape par Étape

#### ÉTAPE 1 : Frontend - Clic sur "Archiver"

**Fichier** : `dataCollection/src/frontend/src/pages/admin/DevelopersPage.jsx`

**Code Frontend (Ligne 1040-1078)**
```javascript
function ArchiveModal({ dev, onClose, onConfirm }) {
  const [date, setDate] = useState("");
  const [loading, setLoading] = useState(false);

  return (
    <AdminModal
      onClose={onClose}
      title="Archiver le développeur"
      subtitle={dev.name || dev.gitlab_username}
      icon="ri-archive-line"
      iconBg="bg-danger-subtle"
      iconColor="text-danger"
      loading={loading}
      maxWidth={400}
      footer={
        <>
          <button className="btn btn-sm btn-light px-4" onClick={onClose} disabled={loading}>Annuler</button>
          <button className="btn btn-sm btn-danger px-4 fw-bold shadow-sm" onClick={() => onConfirm(dev, date)} disabled={loading}>
            {loading
              ? <><span className="spinner-border spinner-border-sm me-2"></span>Archivage...</>
              : <><i className="ri-archive-line me-1"></i>Confirmer l'archivage</i>
            }
          </button>
        </>
      }
    >
      <div className="py-2">
        <p className="text-muted fs-13 mb-3 text-center">
          Veuillez indiquer la date de sortie (Offboarding) de <strong>{dev.name || dev.gitlab_username}</strong>.<br />
          <span className="small mt-1 d-block">Il ne sera plus comptabilisé dans les KPIs après cette date.</span>
        </p>
        <div className="mb-2">
          <label className="form-label fw-medium fs-13 text-danger">
            <i className="ri-calendar-close-line me-1"></i>Date de sortie
          </label>
          <input
            type="date"
            className="form-control border-danger-subtle"
            value={date}
            onChange={(e) => setDate(e.target.value)}
            required
          />
        </div>
      </div>
    </AdminModal>
  );
}
```

**Transformation des données** :
- L'utilisateur clique sur "Archiver"
- Le modal `ArchiveModal` s'ouvre
- L'état React `date` est initialisé à vide (`""`)
- L'utilisateur sélectionne une date dans le champ input
- L'état `date` est mis à jour avec la valeur sélectionnée (ex: "2024-12-31")

**Relation avec l'étape suivante** :
- Lors de la confirmation, la date sélectionnée sera passée à `handleArchiveConfirm()`
- Cette date sera utilisée pour créer le payload d'archivage

---

#### ÉTAPE 2 : Frontend - Confirmation de l'Archivage

**Fichier** : `dataCollection/src/frontend/src/pages/admin/DevelopersPage.jsx`

**Code Frontend (Ligne 1826-1838)**
```javascript
const handleArchiveConfirm = useCallback(async (dev, date) => {
  setArchiveDevLoading(true);
  try {
    await developerService.update(dev.id, { offboarding_date: date, is_active: false });
    showToast(`${devDisplayName(dev)} a été archivé (Sortie fixée au ${new Date(date).toLocaleDateString("fr-FR")})`);
    setArchiveDev(null);
    await load();
  } catch {
    showToast("Erreur lors de l'archivage", "danger");
  } finally {
    setArchiveDevLoading(false);
  }
}, [load, showToast]);
```

**Transformation des données** :
- **Création du payload** : `{ offboarding_date: date, is_active: false }`
- La date de sortie est fixée à la valeur sélectionnée
- Le développeur est marqué comme inactif (`is_active = false`)

**Relation avec l'étape suivante** :
- Le payload est passé à `developerService.update()`
- Ce service transformera le payload en requête HTTP

---

#### ÉTAPE 3 : Frontend - Appel API

**Fichier** : `dataCollection/src/frontend/src/services/developerService.js`

**Code Frontend (Ligne 43)**
```javascript
update: (id, data) => api.put(`/developers/${id}`, data).then(r => r.data),
```

**Transformation des données** :
- **Objet JavaScript → Requête HTTP** : Le payload est envoyé dans le body
- **Méthode HTTP** : PUT (modification)
- **URL** : `/api/v1/developers/123`

**Requête HTTP envoyée**
```http
PUT /api/v1/developers/123
Content-Type: application/json

{
  "offboarding_date": "2024-12-31",
  "is_active": false
}
```

**Relation avec l'étape suivante** :
- La requête HTTP est reçue par le routeur FastAPI
- Le JSON du body sera transformé en objet Pydantic `DeveloperUpdate`

---

#### ÉTAPE 4 : Backend - Traitement de l'Archivage

**Fichier** : `dataCollection/src/backend/app/services/admin/developer_service.py`

**Code Backend (Méthode update_developer)**
```python
def update_developer(
    self,
    db:           Session,
    developer_id: int,
    payload:      DeveloperUpdate,
    updated_by:    Optional[int] = None,
    ip_address:   Optional[str] = None,
) -> Developer:
    developer = self.dev_repo.get_by_id(db, developer_id)

    # Mise à jour des champs
    update_data = {
        "gitlab_username": payload.gitlab_username,
        "name": payload.name,
        "email": payload.email,
        "is_external": payload.is_external,
        "onboarding_date": payload.onboarding_date,
        "offboarding_date": payload.offboarding_date,
        "is_active": payload.is_active,
    }

    self.dev_repo.update(db, developer, update_data)

    # Synchronisation intelligente
    if payload.group_ids is not None:
        self.dev_repo.sync_groups(db, developer, payload.group_ids)
    if payload.sites is not None:
        self.dev_site_repo.sync(db, developer_id, payload.sites)
    if payload.projects is not None:
        self.dev_proj_repo.sync(db, developer_id, [p.project_id for p in payload.projects])

    # Audit log
    self.audit_repo.log(
        db=db, user_id=updated_by, action="UPDATE_DEVELOPER",
        entity_type="Developer", entity_id=developer_id,
        entity_name=developer.name,
        old_value={"is_active": old_is_active, "offboarding_date": old_offboarding_date},
        new_value={"is_active": payload.is_active, "offboarding_date": payload.offboarding_date},
        ip_address=ip_address,
    )

    db.commit()
    db.refresh(developer)
    return developer
```

**Transformation des données et Règles Métier** :

1. **Récupération du développeur** :
   - Récupère le développeur existant via son ID
   - Stocke l'ancienne valeur de `is_active` et `offboarding_date` pour l'audit log

2. **Préparation des données de mise à jour** :
   - Extrait les champs du payload Pydantic
   - Inclut `offboarding_date` et `is_active`
   - Ces champs indiquent la date de sortie et le statut inactif

3. **Mise à jour via repository** :
   - Appelle `dev_repo.update()` avec les données
   - Le repository transformera le dictionnaire en requête SQL UPDATE

4. **Synchronisation intelligente** :
   - Si `group_ids`, `sites` ou `projects` sont fournis, synchronise les affectations
   - Dans le cas de l'archivage, ces champs sont généralement `null` (pas de modification)

5. **Audit log** :
   - Enregistre l'ancienne et la nouvelle valeur de `is_active` et `offboarding_date`
   - Permet de tracer qui a archivé le développeur et quand

6. **Commit** :
   - Valide toutes les opérations en base de données

**Relation avec l'étape suivante** :
- Le repository transforme le dictionnaire `update_data` en requête SQL UPDATE

---

#### ÉTAPE 5 : Backend - Repository - Mise à jour

**Fichier** : `dataCollection/src/backend/app/repositories/developer_repository.py`

**Code Backend (Méthode update)**
```python
def update(self, db: Session, developer: Developer, data: dict) -> Developer:
    for key, value in data.items():
        if hasattr(developer, key):
            setattr(developer, key, value)
    db.commit()
    db.refresh(developer)
    return developer
```

**Transformation des données** :

1. **Itération sur le dictionnaire** :
   - Pour chaque clé-valeur dans `data`, met à jour l'attribut correspondant
   - `offboarding_date` est mis à jour avec la date de sortie
   - `is_active` est mis à `false`

2. **Commit** :
   - `db.commit()` valide les modifications en base de données
   - SQLAlchemy génère automatiquement la requête SQL UPDATE

**Transformation en Requêtes SQL** :

```sql
UPDATE developer
SET is_active = false, offboarding_date = '2024-12-31'
WHERE id = 123;
```

**Impact sur les KPIs** :
- Le développeur avec `offboarding_date = '2024-12-31'` ne sera plus comptabilisé après cette date
- Les KPIs calculés pour des périodes postérieures à cette date excluront ce développeur
- Les KPIs historiques (avant cette date) incluront toujours ce développeur

---

### Résumé des Transformations (Archivage)

| Étape | Format | Transformation | Destination |
|-------|--------|----------------|-------------|
| 1 | État React | Sélection date | date = "2024-12-31" |
| 2 | État React → JSON | Création payload | { offboarding_date, is_active: false } |
| 3 | JSON → HTTP | Création requête PUT | Requête HTTP |
| 4 | HTTP → Pydantic | Parsing JSON | Objet DeveloperUpdate |
| 4 | Pydantic → Dict | Extraction champs | Dictionnaire update_data |
| 5 | Dict → ORM | setattr sur objet | Objet Developer modifié |
| 5 | ORM → SQL | Génération automatique | Requête SQL UPDATE |

---

## Résumé Comparatif des Actions

| Action | Mode | Date d'Effet | Impact Base de Données | Impact Historique | Quand utiliser |
|--------|------|---------------|----------------------|-----------------|---------------|
| **Ajout nouveau dev** | Création | Onboarding | INSERT developer + associations | Création complète | Nouveau développeur |
| **Mutation historique** | Case B | mutation_date | UPDATE developer + SCD Type 2 | Crée nouveaux segments | Changement d'équipe/déménagement |
| **Correction rétroactive** | Case A | Aucune | UPDATE developer + SCD Type 2 | Modifie segments actuels | Correction d'erreur de saisie |
| **Activation** | Toggle | Aucune | UPDATE is_active=true, offboarding_date=NULL | Réactive le développeur | Retour temporaire |
| **Désactivation** | Toggle | Aucune | UPDATE is_active=false | Désactive le développeur | Absence temporaire |
| **Archivage** | Archivage | offboarding_date | UPDATE is_active=false + offboarding_date | Désactive + date de sortie | Départ définitif |

---

## Points Clés de l'Architecture

### 1. Système de Case A / Case B

- **Case A (Correction rétroactive)** : Modifie les affectations actuelles sans créer d'historique. Utilisez-le pour corriger une faute de frappe ou une mauvaise affectation initiale.
- **Case B (Mutation historique)** : Crée de nouveaux segments temporels à partir d'une date d'effet. Utilisez-le lorsqu'un développeur change d'équipe ou déménage dans le temps.
- Le frontend détecte automatiquement le mode approprié selon `update_type`

### 2. Synchronisation Intelligente (SCD Type 2)

- Utilisée pour gérer les affectations temporelles
- Crée des segments avec `start_date` et `end_date`
- Permet de tracer l'historique complet des affectations
- **Case B** : Clôture l'ancien segment (end_date) et crée un nouveau (start_date)
- **Case A** : Supprime et recrée les segments sans préservation d'historique

### 3. Audit Log Complet

- Chaque action est loguée avec qui a fait quoi et quand
- Les anciennes et nouvelles valeurs sont stockées
- L'adresse IP de l'utilisateur est stockée
- Permet une traçabilité complète des modifications

### 4. Auto-discovery

- Les associations projet-site sont créées automatiquement
- Simplifie la gestion manuelle
- Assure la cohérence des données

### 5. Validation des Dates

- La date d'entrée doit être antérieure à la date de sortie (RG-05)
- Empêche les incohérences dans les dates de cycle de vie
- Validé au niveau du service avant toute mise à jour

---

## Conclusion

Le système de gestion des développeurs dans votre application utilise une architecture **SCD Type 2** (Slowly Changing Dimension Type 2) pour gérer les affectations temporelles :

- **Case A** : Correction rétroactive (modifie le présent et le passé comme si l'erreur n'avait jamais existé)
- **Case B** : Mutation historique (préserve l'historique et crée de nouveaux segments)
- **Activation/Désactivation** : Toggle du statut actif (temporaire)
- **Archivage** : Offboarding avec date de sortie (définitif)

Chaque action traverse **5 couches** (Frontend → API HTTP → Service → Repository → Base de données) avec des transformations successives des données :

1. **Frontend** : État React → Payload JSON
2. **API HTTP** : Payload JSON → Requête HTTP
3. **Service** : Requête HTTP → Objet Pydantic → Dictionnaire avec règles métier
4. **Repository** : Dictionnaire → Objet ORM
5. **Base de données** : Objet ORM → Requêtes SQL

Chaque action est traçable via l'audit log et utilise la synchronisation intelligente pour gérer l'historique complet des affectations.

---

## Résumé Comparatif des Actions

| Action | Mode | Date d'Effet | Impact Base de Données | Impact Historique | Quand utiliser |
|--------|------|---------------|----------------------|-----------------|---------------|
| **Ajout nouveau dev** | Création | Onboarding | INSERT developer + associations | Création complète | Nouveau développeur |
| **Mutation historique** | Case B | mutation_date | UPDATE developer + SCD Type 2 | Crée nouveaux segments | Changement d'équipe/déménagement |
| **Correction rétroactive** | Case A | Aucune | UPDATE developer + SCD Type 2 | Modifie segments actuels | Correction d'erreur de saisie |
| **Activation** | Toggle | Aucune | UPDATE is_active=true, offboarding_date=NULL | Réactive le développeur | Retour temporaire |
| **Désactivation** | Toggle | Aucune | UPDATE is_active=false | Désactive le développeur | Absence temporaire |
| **Archivage** | Archivage | offboarding_date | UPDATE is_active=false + offboarding_date | Désactive + date de sortie | Départ définitif |

---

## Points Clés de l'Architecture

### 1. Système de Case A / Case B

- **Case A (Correction rétroactive)** : Modifie les affectations actuelles sans créer d'historique
- **Case B (Mutation historique)** : Crée de nouveaux segments temporels à partir d'une date d'effet
- Le frontend détecte automatiquement le mode approprié selon `update_type`

### 2. Synchronisation Intelligente (SCD Type 2)

- Utilisée pour gérer les affectations temporelles
- Crée des segments avec `start_date` et `end_date`
- Permet de tracer l'historique complet des affectations

### 3. Audit Log Complet

- Chaque action est loguée avec qui a fait quoi et quand
- Les anciennes et nouvelles valeurs sont stockées
- L'adresse IP de l'utilisateur est stockée

### 4. Auto-discovery

- Les associations projet-site sont créées automatiquement
- Simplifie la gestion manuelle
- Assure la cohérence des données

### 5. Validation des Dates

- La date d'entrée doit être antérieure à la date de sortie (RG-05)
- Empêche les incohérences dans les dates de cycle de vie

---

## Conclusion

Le système de gestion des développeurs dans votre application utilise une architecture **SCD Type 2** (Slowly Changing Dimension Type 2) pour gérer les affectations temporelles :

- **Case A** : Correction rétroactive (modifie le présent)
- **Case B** : Mutation historique (crée de nouveaux segments)
- **Activation/Désactivation** : Toggle du statut actif
- **Archivage** : Offboarding avec date de sortie

Chaque action est traçable via l'audit log et utilise la synchronisation intelligente pour gérer l'historique complet des affectations.
