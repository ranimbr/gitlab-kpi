# Documentation Simplifiée : Comment les KPIs sont Calculés

## Table des Matières
1. [Concepts de Base](#concepts-de-base)
2. [Structure de la Base de Données](#structure-bdd)
3. [Flux de Récupération des Données](#flux-recuperation)
4. [Explication du Code](#explication-code)
5. [Exemple Concret](#exemple-concret)

---

## 1. Concepts de Base <a name="concepts-de-base"></a>

### Qu'est-ce que "self" en Python ?

**self** représente l'objet actuel de la classe. C'est comme dire "moi-même" en français.

```python
class KpiCalculator:
    def __init__(self, db):
        self.db = db  # Je stocke la base de données dans mon objet
    
    def calculer_kpi(self):
        # self.db = la base de données que j'ai stockée
        return self.db.query(...)
```

Quand on crée un objet :
```python
calculator = KpiCalculator(db)  # On crée un objet avec une base de données
calculator.calculer_kpi()       # self.db sera cette base de données
```

### Qu'est-ce qu'une Classe ?

Une classe est un "moule" pour créer des objets. 
- La classe = le plan (le moule)
- L'objet = ce qu'on fabrique avec le moule

Exemple :
```python
class Voiture:              # Le moule
    def __init__(self, couleur):
        self.couleur = couleur

ma_voiture = Voiture("rouge")  # L'objet créé
```

---

## 2. Structure de la Base de Données <a name="structure-bdd"></a>

### Tables Principales

#### **Table Developer** (Développeurs)
- `id` : Identifiant unique du développeur
- `name` : Nom du développeur
- `onboarding_date` : Date d'arrivée
- `offboarding_date` : Date de départ
- `is_active` : Est-il actif ?

#### **Table Commit** (Commits GitLab)
- `id` : Identifiant unique
- `developer_id` : Qui a fait le commit ?
- `project_id` : Sur quel projet ?
- `authored_date` : Date du commit
- `extraction_lot_id` : Quel lot d'extraction ?

#### **Table MergeRequest** (MRs GitLab)
- `id` : Identifiant unique
- `developer_id` : Qui a créé le MR ?
- `project_id` : Sur quel projet ?
- `created_at_gitlab` : Date de création
- `approved` : Est-il approuvé ?
- `merged_at` : Date de fusion
- `review_time_hours` : Temps de revue en heures
- `is_draft` : Est-ce un brouillon ?

#### **Table DeveloperProject** (Missions)
- `developer_id` : Quel développeur ?
- `project_id` : Sur quel projet ?
- `start_date` : Début de la mission
- `end_date` : Fin de la mission

#### **Table DeveloperSite** (Affectations aux Sites)
- `developer_id` : Quel développeur ?
- `site_id` : Quel site ?
- `start_date` : Début de l'affectation
- `end_date` : Fin de l'affectation

#### **Table Period** (Périodes de temps)
- `id` : Identifiant
- `year` : Année (ex: 2024)
- `month` : Mois (ex: 4)

#### **Table ExtractionLot** (Lots d'extraction)
- `id` : Identifiant
- `project_id` : Projet concerné
- `period_id` : Période concernée

---

## 3. Flux de Récupération des Données <a name="flux-recuperation"></a>

### Vue d'ensemble du Flux

```
1. FRONTEND demande des KPIs
   ↓
2. API ROUTER reçoit la demande
   ↓
3. KPI SERVICE orchestre le calcul
   ↓
4. KPI CALCULATOR récupère les données de la BDD
   ↓
5. KPI CALCULATOR calcule les KPIs
   ↓
6. KPI AGGREGATOR stocke les résultats
   ↓
7. FRONTEND affiche les KPIs
```

### Étape 1 : Identification des Développeurs Actifs

**Fichier** : `app/utils/mission_utils.py`

```python
def get_certified_developers_query(db, project_id, start_date, end_date):
    """
    Cette fonction trouve quels développeurs étaient actifs
    sur un projet pendant une période donnée.
    """
    query = db.query(Developer.id)  # Je veux les IDs des développeurs
        .join(DeveloperProject, ...)  # Qui avaient une mission sur le projet
        .join(DeveloperSite, ...)      # Qui étaient affectés à un site
        .join(DeveloperGroupLink, ...) # Qui étaient dans un groupe
        .filter(
            # Le développeur n'est pas un robot
            Developer.is_bot.is_(False),
            
            # Il était arrivé avant la fin de la période
            or_(Developer.onboarding_date.is_(None), 
                Developer.onboarding_date < end_date),
            
            # Il n'était pas parti avant le 15 du mois (règle RG-02)
            or_(Developer.offboarding_date.is_(None), 
                Developer.offboarding_date >= threshold_date),
            
            # Son affectation au site couvrait la période
            or_(DeveloperSite.start_date.is_(None), 
                DeveloperSite.start_date < end_date),
            or_(DeveloperSite.end_date.is_(None), 
                DeveloperSite.end_date >= start_date),
            
            # Son affectation au groupe couvrait la période
            or_(DeveloperGroupLink.start_date.is_(None), 
                DeveloperGroupLink.start_date < end_date),
            or_(DeveloperGroupLink.end_date.is_(None), 
                DeveloperGroupLink.end_date >= start_date),
        )
    
    return query  # Je retourne la requête SQL
```

**Ce que ça fait en français** :
- Je cherche tous les développeurs qui avaient une mission sur le projet
- Je vérifie qu'ils étaient affectés à un site pendant la période
- Je vérifie qu'ils étaient dans un groupe pendant la période
- J'applique la règle des 15 jours (RG-02)

### Étape 2 : Récupération des Commits

**Fichier** : `app/services/kpi/kpi_calculator.py`

```python
def _count_commits_by_devs(self, project_id, start_date, end_date, ...):
    """
    Cette fonction compte les commits des développeurs actifs.
    """
    
    # 1. Je récupère les IDs des développeurs actifs
    valid_ids = self._active_dev_ids_query(...).subquery()
    
    # 2. Je récupère la période et le lot d'extraction
    period = self.db.query(Period).filter(
        Period.year == start_date.year,
        Period.month == start_date.month
    ).first()
    
    lot_ids = [r[0] for r in self.db.query(ExtractionLot.id).filter(
        ExtractionLot.period_id == period.id,
        ExtractionLot.project_id == project_id
    ).all()]
    
    # 3. Je construis la requête pour les commits
    q = self.db.query(Commit).filter(
        Commit.project_id == project_id,           # Du bon projet
        Commit.authored_date >= start_date,         # Après le début
        Commit.authored_date < end_date,            # Avant la fin
        Commit.developer_id.in_(select(valid_ids.c.id))  # D'un dev actif
    )
    
    # 4. Je filtre par lot d'extraction si nécessaire
    if lot_ids:
        q = q.filter(Commit.extraction_lot_id.in_(lot_ids))
    
    # 5. Je filtre par site si demandé
    if site_id:
        q = q.join(
            DeveloperSite,
            (DeveloperSite.developer_id == Commit.developer_id) &
            (DeveloperSite.site_id == site_id) &
            (DeveloperSite.start_date <= func.date(Commit.authored_date)) &
            (or_(DeveloperSite.end_date.is_(None), 
                 DeveloperSite.end_date >= func.date(Commit.authored_date)))
        )
    
    # 6. Je compte le résultat
    return q.count()
```

**Ce que ça fait en français** :
1. Je trouve quels développeurs étaient actifs
2. Je trouve quel lot d'extraction utiliser
3. Je cherche tous les commits du projet dans la période
4. Je garde seulement ceux des développeurs actifs
5. Je filtre par site si demandé
6. Je compte combien il y en a

### Étape 3 : Récupération des MRs (Merge Requests)

**Fichier** : `app/services/kpi/kpi_calculator.py`

```python
def _count_mrs(self, project_id, start_date, end_date, ...):
    """
    Cette fonction compte les MRs des développeurs actifs.
    """
    
    # 1. Je récupère les IDs des développeurs actifs
    valid_ids = self._active_dev_ids_query(...).subquery()
    
    # 2. Je récupère la période et le lot d'extraction
    period = self.db.query(Period).filter(
        Period.year == start_date.year,
        Period.month == start_date.month
    ).first()
    
    lot_ids = [r[0] for r in self.db.query(ExtractionLot.id).filter(
        ExtractionLot.period_id == period.id,
        ExtractionLot.project_id == project_id
    ).all()]
    
    # 3. Je construis la requête pour les MRs
    q = self.db.query(MergeRequest).join(
        DeveloperProject,
        (DeveloperProject.developer_id == MergeRequest.developer_id) &
        (DeveloperProject.project_id == MergeRequest.project_id)
    ).filter(
        MergeRequest.project_id == project_id,      # Du bon projet
        MergeRequest.is_draft.is_(False),           # Pas un brouillon
        MergeRequest.created_at_gitlab >= start_date,  # Après le début
        MergeRequest.created_at_gitlab < end_date,     # Avant la fin
        MergeRequest.developer_id.in_(select(valid_ids.c.id))  # D'un dev actif
    )
    
    # 4. Je filtre par lot d'extraction
    if lot_ids:
        q = q.filter(MergeRequest.extraction_lot_id.in_(lot_ids))
    
    # 5. Je filtre par site si demandé
    if site_id:
        q = q.join(
            DeveloperSite,
            (DeveloperSite.developer_id == MergeRequest.developer_id) &
            (DeveloperSite.site_id == site_id) &
            (DeveloperSite.start_date <= func.date(MergeRequest.created_at_gitlab)) &
            (or_(DeveloperSite.end_date.is_(None), 
                 DeveloperSite.end_date >= func.date(MergeRequest.created_at_gitlab)))
        )
    
    # 6. J'applique la règle RG-02 après récupération
    all_mrs = q.all()
    
    certified_mr_ids = []
    for mr in all_mrs:
        if is_mr_certified_for_period(
            mr.created_at_gitlab.date(),
            mr.developer_id,
            self.db,
            period_id=period.id if period else None,
            start_date=start_date.date(),
            end_date=end_date.date()
        ):
            certified_mr_ids.append(mr.id)
    
    # 7. Je compte seulement les MRs certifiés
    return len(certified_mr_ids)
```

**Ce que ça fait en français** :
1. Je trouve quels développeurs étaient actifs
2. Je trouve quel lot d'extraction utiliser
3. Je cherche tous les MRs du projet dans la période
4. Je garde seulement ceux des développeurs actifs
5. Je filtre par site si demandé
6. J'applique la règle des 15 jours (RG-02) à chaque MR
7. Je compte seulement les MRs qui respectent la règle

---

## 4. Explication du Code <a name="explication-code"></a>

### La Classe KpiCalculator

```python
class KpiCalculator:
    """
    Cette classe calcule les KPIs pour un projet, un site, un groupe ou un développeur.
    """
    
    # Constantes de normalisation
    COMMIT_NORMALIZATION = 10.0   # 10 commits/mois = score 1.0
    MR_NORMALIZATION = 5.0        # 5 MRs/mois = score 1.0
    REVIEW_REF_HOURS = 24.0       # 24 heures de revue = score 0.5
    
    def __init__(self, db: Session):
        """
        Quand on crée un KpiCalculator, on lui donne une base de données.
        """
        self.db = db  # Je stocke la base de données dans mon objet
```

**Explication** :
- `__init__` est le constructeur. Il est appelé quand on crée un objet.
- `self.db` stocke la base de données pour l'utiliser dans toutes les méthodes.

### La Méthode Principale : calculate_project_kpis

```python
def calculate_project_kpis(
    self,
    project_id: int,      # ID du projet
    start_date: datetime,  # Date de début
    end_date: datetime,    # Date de fin
    site_id: Optional[int] = None,      # Site optionnel
    group_id: Optional[int] = None,     # Groupe optionnel
    developer_id: Optional[int] = None, # Développeur optionnel
    eligible_ids: Optional[list] = None, # IDs pré-filtrés
) -> dict:
    """
    Cette méthode calcule TOUS les KPIs pour un scope donné.
    """
    
    # 1. Je collecte les données brutes
    nb_commits_project = self._count_all_project_commits(...)
    nb_devs = self._count_developers(...)
    nb_commits_devs = self._count_commits_by_devs(...)
    nb_mrs = self._count_mrs(...)
    nb_mrs_approved = self._count_approved_mrs(...)
    nb_mrs_merged = self._count_merged_mrs(...)
    sum_review_time = self._sum_review_time(...)
    
    # 2. Je calcule les KPIs normalisés
    denom = max(nb_devs, 1)  # Évite la division par zéro
    
    mr_rate_per_site = round(nb_mrs / denom, 4)
    approved_mr_rate = min(1.0, round(nb_mrs_approved / nb_mrs, 4)) if nb_mrs > 0 else 0.0
    merged_mr_rate = min(1.0, round(nb_mrs_merged / nb_mrs_approved, 4)) if nb_mrs_approved > 0 else 0.0
    commit_rate_per_site = round(nb_commits_devs / denom, 4)
    avg_review_time_hours = round(sum_review_time / nb_mrs_with_time, 2) if nb_mrs_with_time > 0 else 0.0
    
    # 3. Je retourne tous les KPIs
    return {
        "mr_rate_per_site": mr_rate_per_site,
        "approved_mr_rate": approved_mr_rate,
        "merged_mr_rate": merged_mr_rate,
        "commit_rate_per_site": commit_rate_per_site,
        "avg_review_time_hours": avg_review_time_hours,
        "nb_developers": nb_devs,
        ...
    }
```

**Explication** :
- Cette méthode est le point d'entrée principal
- Elle appelle plusieurs méthodes pour collecter les données
- Elle calcule les ratios et moyennes
- Elle retourne un dictionnaire avec tous les KPIs

### Les Méthodes de Comptage

Chaque méthode de comptage suit le même pattern :

```python
def _count_xxx(self, project_id, start_date, end_date, ...):
    """
    Pattern standard de comptage :
    1. Récupérer les développeurs actifs
    2. Récupérer la période et le lot d'extraction
    3. Construire la requête SQL
    4. Appliquer les filtres
    5. Compter les résultats
    """
    
    # Étape 1 : Développeurs actifs
    valid_ids = self._active_dev_ids_query(...).subquery()
    
    # Étape 2 : Période et lot
    period = self.db.query(Period).filter(...).first()
    lot_ids = [...]
    
    # Étape 3 : Requête principale
    q = self.db.query(Table).filter(
        Table.project_id == project_id,
        Table.date >= start_date,
        Table.date < end_date,
        Table.developer_id.in_(select(valid_ids.c.id))
    )
    
    # Étape 4 : Filtres optionnels
    if site_id:
        q = q.join(DeveloperSite, ...).filter(...)
    
    if group_id:
        q = q.join(DeveloperGroupLink, ...).filter(...)
    
    # Étape 5 : Comptage
    return q.count()
```

---

## 5. Exemple Concret <a name="exemple-concret"></a>

### Scénario : Calculer les KPIs pour Avril 2024

**Données** :
- Projet : ID = 1
- Période : 1er avril 2024 au 1er mai 2024
- Site : ID = 2 (optionnel)

### Étape 1 : Création du Calculateur

```python
from app.database.session import SessionLocal
from app.services.kpi.kpi_calculator import KpiCalculator

# Je crée une connexion à la base de données
db = SessionLocal()

# Je crée le calculateur avec cette connexion
calculator = KpiCalculator(db)
```

### Étape 2 : Appel de la Méthode Principale

```python
# Je calcule les KPIs
kpis = calculator.calculate_project_kpis(
    project_id=1,
    start_date=datetime(2024, 4, 1),
    end_date=datetime(2024, 5, 1),
    site_id=2
)
```

### Étape 3 : Ce qui se passe en interne

#### 3.1 Identification des Développeurs Actifs

```python
# Le système cherche les développeurs actifs
valid_ids = calculator._active_dev_ids_query(
    project_id=1,
    start_date=datetime(2024, 4, 1),
    end_date=datetime(2024, 5, 1),
    site_id=2
)
```

**Requête SQL générée** :
```sql
SELECT DISTINCT developer.id 
FROM developer
JOIN developer_project ON developer_project.developer_id = developer.id
JOIN developer_site ON developer_site.developer_id = developer.id
JOIN developer_group_link ON developer_group_link.developer_id = developer.id
WHERE developer.is_bot = FALSE
  AND developer_project.project_id = 1
  AND developer_site.site_id = 2
  AND developer_site.start_date < '2024-05-01'
  AND (developer_site.end_date >= '2024-04-01' OR developer_site.is_active = TRUE)
  AND developer_group_link.start_date < '2024-05-01'
  AND (developer_group_link.end_date >= '2024-04-01' OR developer_group_link.end_date IS NULL)
  AND (developer.onboarding_date IS NULL OR developer.onboarding_date < '2024-05-01')
  AND (developer.offboarding_date IS NULL OR developer.offboarding_date >= '2024-04-15')
```

**Résultat** : `[1, 3, 5, 7, 9]` (IDs des développeurs actifs)

#### 3.2 Comptage des Commits

```python
# Le système compte les commits
nb_commits = calculator._count_commits_by_devs(
    project_id=1,
    start_date=datetime(2024, 4, 1),
    end_date=datetime(2024, 5, 1),
    site_id=2,
    eligible_ids=[1, 3, 5, 7, 9]
)
```

**Requête SQL générée** :
```sql
SELECT COUNT(*) 
FROM commit
WHERE commit.project_id = 1
  AND commit.authored_date >= '2024-04-01'
  AND commit.authored_date < '2024-05-01'
  AND commit.developer_id IN (1, 3, 5, 7, 9)
```

**Résultat** : `150` commits

#### 3.3 Comptage des MRs

```python
# Le système compte les MRs
nb_mrs = calculator._count_mrs(
    project_id=1,
    start_date=datetime(2024, 4, 1),
    end_date=datetime(2024, 5, 1),
    site_id=2,
    eligible_ids=[1, 3, 5, 7, 9]
)
```

**Requête SQL générée** :
```sql
SELECT COUNT(*) 
FROM merge_request
JOIN developer_project ON developer_project.developer_id = merge_request.developer_id
                        AND developer_project.project_id = merge_request.project_id
WHERE merge_request.project_id = 1
  AND merge_request.is_draft = FALSE
  AND merge_request.created_at_gitlab >= '2024-04-01'
  AND merge_request.created_at_gitlab < '2024-05-01'
  AND merge_request.developer_id IN (1, 3, 5, 7, 9)
```

**Résultat** : `25` MRs

#### 3.4 Application de la Règle RG-02

Pour chaque MR, le système vérifie :
```python
for mr in all_mrs:
    if is_mr_certified_for_period(mr.created_at_gitlab.date(), mr.developer_id, ...):
        certified_mr_ids.append(mr.id)
```

**Vérification** :
- Le développeur avait-il une affectation au site pendant au moins 15 jours avant le MR ?
- Si oui → Le MR est compté
- Si non → Le MR est ignoré

**Résultat final** : `23` MRs certifiés (2 MRs ignorés)

#### 3.5 Calcul des KPIs

```python
# Le système calcule les ratios
denom = max(5, 1)  # 5 développeurs actifs

mr_rate_per_site = 23 / 5 = 4.6 MRs/développeur
commit_rate_per_site = 150 / 5 = 30 commits/développeur
```

### Étape 4 : Résultat Final

```python
{
    "mr_rate_per_site": 4.6,
    "commit_rate_per_site": 30.0,
    "nb_developers": 5,
    "total_commits": 150,
    "total_mrs_created": 23,
    ...
}
```

---

## Résumé

### Comment les MRs et Commits sont récupérés ?

1. **Identification des développeurs actifs** :
   - Le système trouve quels développeurs avaient une mission sur le projet
   - Il vérifie leurs affectations au site et au groupe
   - Il applique la règle des 15 jours (RG-02)

2. **Récupération des données brutes** :
   - Le système cherche tous les commits/MRs dans la période
   - Il filtre par lot d'extraction
   - Il garde seulement ceux des développeurs actifs
   - Il filtre par site/groupe si demandé

3. **Application de la règle RG-02** :
   - Pour chaque MR, le système vérifie si le développeur respecte la règle des 15 jours
   - Seuls les MRs certifiés sont comptés

4. **Calcul des KPIs** :
   - Le système divise les totaux par le nombre de développeurs
   - Il calcule les taux d'approbation, de fusion, etc.
   - Il retourne tous les KPIs dans un dictionnaire

### Points Clés

- **self** = l'objet actuel de la classe (comme "moi-même")
- **Les données viennent de la base de données** via des requêtes SQL
- **Les filtres s'appliquent en cascade** : développeurs → période → site/groupe → RG-02
- **La règle RG-02** s'applique à la fois aux développeurs et aux MRs
- **Les KPIs sont normalisés** (divisés par le nombre de développeurs)
