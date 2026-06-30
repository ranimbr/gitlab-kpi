# Documentation Détaillée : Flux de Calcul des KPIs et Gestion Dynamique de l'Effectif

## Table des Matières
1. [Vue d'ensemble du système](#vue-densemble)
2. [Calcul de l'effectif développeur](#calcul-de-leffectif)
3. [Calcul des KPIs](#calcul-des-kpis)
4. [Gestion dynamique des mutations](#gestion-dynamique)
5. [Flux jusqu'à l'affichage frontend](#flux-frontend)
6. [Résumé des relations entre étapes](#resume)

---

## 1. Vue d'ensemble du système <a name="vue-densemble"></a>

### Architecture en couches

```
┌─────────────────────────────────────────────────────────────────┐
│                    FRONTEND (React)                              │
│  ComparativeAnalyticsPage.jsx (Ligne 1-2636)                     │
└───────────────────────────┬─────────────────────────────────────┘
                            │ API Calls
┌───────────────────────────▼─────────────────────────────────────┐
│              API ROUTERS (FastAPI)                               │
│  - kpis.py (Ligne 1-1133) : Endpoints KPI                       │
│  - developers.py (Ligne 1-1766) : Gestion développeurs          │
└───────────────────────────┬─────────────────────────────────────┘
                            │
┌───────────────────────────▼─────────────────────────────────────┐
│              SERVICES (Business Logic)                          │
│  - kpi_service.py (Ligne 1-126) : Orchestrateur                 │
│  - kpi_calculator.py (Ligne 1-1050) : Calcul des métriques      │
│  - kpi_aggregator.py (Ligne 1-737) : Agrégation & Snapshots     │
└───────────────────────────┬─────────────────────────────────────┘
                            │
┌───────────────────────────▼─────────────────────────────────────┐
│              UTILS (Règles métier)                             │
│  - mission_utils.py (Ligne 1-404) : RG-02 (15 jours)            │
└───────────────────────────┬─────────────────────────────────────┘
                            │
┌───────────────────────────▼─────────────────────────────────────┐
│              MODELS (Base de données)                           │
│  - developer.py : Développeurs avec SCD Type 2                 │
│  - kpi_snapshot.py : Snapshots KPIs stockés                    │
└─────────────────────────────────────────────────────────────────┘
```

### Objectif principal
Le système calcule des KPIs de performance (commits, MRs, review time, etc.) pour des projets, sites, groupes et développeurs individuels. Ces KPIs sont **dynamiques** et s'adaptent automatiquement aux mutations de développeurs (correction, archivage, activation, désactivation, changement de site/groupe).

---

## 2. Calcul de l'effectif développeur <a name="calcul-de-leffectif"></a>

### 2.1 Règle RG-02 : La règle des 15 jours

**Fichier** : `app/utils/mission_utils.py` (Lignes 13-36)

```python
# Ligne 20 : Seuil configurable (Source de Vérité Unique)
RG02_THRESHOLD_DAY: int = 15

# Lignes 23-36 : Calcul du seuil d'offboarding
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

**Objectif** : Un développeur est compté dans l'effectif d'un mois M si et seulement si sa date de sortie (offboarding_date) est >= au 15 de ce mois M. Cette règle s'inspire de la pratique RH standard de proratisation de la paie.

### 2.2 Certification des développeurs (Mission-Strict)

**Fichier** : `app/utils/mission_utils.py` (Lignes 39-100)

```python
# Lignes 39-100 : Requête de certification des développeurs
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
    Permet l'utilisation comme sous-requête pour éviter les N+1.
    """
    # ... résolution des dates ...
    
    # Ligne 79 : Règle des 15 jours
    threshold_date = date(start_date.year, start_date.month, 15)
    
    # Lignes 84-100 : Vérification TRIPLE (Site + Groupe + Projet)
    # Un développeur suspendu n'a PAS de segment site OU groupe actif
    query = (
        db.query(Developer.id)
        .join(DeveloperProject, ...)
        .join(DeveloperSite, ...)      # SCD Type 2 temporel
        .join(DeveloperGroupLink, ...)  # SCD Type 2 temporel
        .filter(
            # Conditions de validité temporelle
            DeveloperSite.start_date < end_date,
            or_(DeveloperSite.end_date >= start_date, DeveloperSite.is_active.is_(True)),
            # Même logique pour DeveloperGroupLink
            # Même logique pour DeveloperProject
        )
    )
```

**Objectif** : Identifier quels développeurs sont "certifiés" pour une période donnée en vérifiant :
- Ils ont une mission active sur le projet (DeveloperProject)
- Ils sont affectés à un site actif (DeveloperSite - SCD Type 2)
- Ils sont affectés à un groupe actif (DeveloperGroupLink - SCD Type 2)
- Ils respectent la règle RG-02 (offboarding_date >= 15 du mois)

### 2.3 Comptage des développeurs actifs

**Fichier** : `app/services/kpi/kpi_calculator.py` (Lignes 189-288)

```python
# Lignes 189-269 : Requête des IDs de développeurs actifs
def _active_dev_ids_query(self, project_id: int, start_date: datetime, 
                          end_date: datetime, site_id: Optional[int], 
                          group_id: Optional[int], developer_id: Optional[int], 
                          eligible_ids: Optional[list] = None):
    """
    [SENIOR] Retourne les IDs de développeurs ASSIGNÉS pour cette période.
    """
    if eligible_ids is not None:
        # Si les IDs sont déjà matérialisés, on les utilise directement
        q = self.db.query(Developer.id).filter(Developer.id.in_(eligible_ids))
    else:
        # Mise en cache de la requête de base pour éviter de la reconstruire 7x
        cache_key = (project_id, start_date, end_date)
        if cache_key not in self._base_mission_query_cache:
            # Ligne 221-227 : Appel à get_certified_developers_query
            from app.utils.mission_utils import get_certified_developers_query
            subq = get_certified_developers_query(
                db=self.db, project_id=project_id, period_id=period_id,
                start_date=start_date.date(), end_date=end_date_month.date()
            ).subquery()
            self._base_mission_query_cache[cache_key] = subq
        
        mission_subq = self._base_mission_query_cache[cache_key]
        
        # Ligne 234 : Seuil RG-02
        threshold_date = get_rg02_threshold(start_date.year, start_date.month)
        
        # Lignes 236-241 : Filtrage RH + RG-02
        q = self.db.query(Developer.id).distinct().filter(
            Developer.id.in_(select(mission_subq.c.id)),
            or_(Developer.onboarding_date.is_(None), Developer.onboarding_date < end_date.date()),
            or_(Developer.offboarding_date.is_(None), Developer.offboarding_date >= threshold_date)
        )
    
    # Lignes 245-253 : Filtrage par site (SCD Type 2)
    if site_id is not None:
        q = q.join(DeveloperSite, ...).filter(
            DeveloperSite.site_id == site_id,
            DeveloperSite.start_date < end_date.date(),
            or_(DeveloperSite.end_date >= start_date.date(), DeveloperSite.is_active.is_(True))
        )
    
    # Lignes 255-264 : Filtrage par groupe (SCD Type 2)
    if group_id is not None:
        q = q.join(DeveloperGroupLink, ...).filter(...)
    
    return q

# Lignes 271-288 : Comptage final
def _count_developers(self, project_id: int, start_date: datetime, end_date: datetime,
                      site_id: Optional[int] = None, group_id: Optional[int] = None, 
                      developer_id: Optional[int] = None, eligible_ids: Optional[list] = None) -> int:
    """
    [SENIOR STRATEGY] Assigned Headcount (Full Squad).
    Compte tous les développeurs officiellement affectés au projet/site.
    """
    q = self._active_dev_ids_query(project_id, start_date, end_date, site_id, group_id, developer_id, eligible_ids)
    return q.count()
```

**Objectif** : Compter le nombre de développeurs actifs en appliquant tous les filtres :
- Filtrage par mission (projet)
- Filtrage temporel (dates d'affectation SCD Type 2)
- Filtrage par site (si spécifié)
- Filtrage par groupe (si spécifié)
- Application de la règle RG-02 (15 jours)

---

## 3. Calcul des KPIs <a name="calcul-des-kpis"></a>

### 3.1 Point d'entrée principal : calculate_project_kpis

**Fichier** : `app/services/kpi/kpi_calculator.py` (Lignes 96-183)

```python
# Lignes 96-105 : Signature de la méthode
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
```

**Objectif** : Calculer tous les KPIs pour un scope donné (projet, site, groupe, ou développeur individuel).

### 3.2 Collecte des données brutes

**Fichier** : `app/services/kpi/kpi_calculator.py` (Lignes 107-136)

```python
# Lignes 107-136 : Collecte des volumes bruts
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

# Draft merge requests
nb_mrs_draft       = self._count_draft_mrs(project_id, start_date, end_date, site_id, group_id, developer_id, eligible_ids)

# Additional engineering KPIs
bus_factor         = self._calculate_bus_factor(project_id, start_date, end_date)
sprint_velocity    = self._calculate_sprint_velocity(project_id, start_date, end_date, developer_id)
code_churn_rate    = self._calculate_code_churn(project_id, start_date, end_date, developer_id)

denom = max(nb_devs, 1)
```

**Objectif** : Collecter toutes les données brutes nécessaires au calcul des KPIs. Chaque méthode utilise `_active_dev_ids_query` pour s'assurer que seuls les développeurs certifiés sont comptés.

### 3.3 Calcul des KPIs normalisés

**Fichier** : `app/services/kpi/kpi_calculator.py` (Lignes 137-177)

```python
# Ligne 137 : Dénominateur (nombre de développeurs, minimum 1 pour éviter division par zéro)
denom = max(nb_devs, 1)

# Lignes 139-144 : Calcul des KPIs normalisés
mr_rate_per_site      = round(nb_mrs / denom, 4)
approved_mr_rate      = min(1.0, round(nb_mrs_approved / nb_mrs, 4))         if nb_mrs > 0          else 0.0
merged_mr_rate        = min(1.0, round(nb_mrs_merged / nb_mrs_approved, 4))  if nb_mrs_approved > 0 else 0.0
commit_rate_per_site  = round(nb_commits_devs / denom, 4)
avg_review_time_hours = round(sum_review_time / nb_mrs_with_time, 2) if nb_mrs_with_time > 0 else 0.0

# Lignes 146-177 : Construction du dictionnaire de KPIs
kpis = {
    "mr_rate_per_site":        mr_rate_per_site,        # MRs par développeur
    "approved_mr_rate":        approved_mr_rate,        # Taux d'approbation
    "merged_mr_rate":          merged_mr_rate,          # Taux de merge
    "commit_rate_per_site":    commit_rate_per_site,    # Commits par développeur
    "nb_commits_per_project":  nb_commits_project,      # Total commits projet
    "avg_review_time_hours":   avg_review_time_hours,   # Temps moyen de review
    "nb_developers":           nb_devs,                 # Nombre de développeurs
    "total_commits":           nb_commits_devs,         # Total commits devs
    "total_mrs_created":       nb_mrs,                  # Total MRs créés
    "total_mrs_approved":      nb_mrs_approved,         # Total MRs approuvés
    "total_mrs_merged":        nb_mrs_merged,           # Total MRs mergés
    "review_time_hours":       round(sum_review_time, 2),
    "total_comments":          nb_comments,
    "total_reviews":           nb_reviews,
    "total_mrs_draft":         nb_mrs_draft,
    "cross_contribution_score": self._count_cross_contributions(...),
    "bus_factor":              bus_factor,
    "sprint_velocity":         sprint_velocity,
    "code_churn_rate":         code_churn_rate,
    # Métadonnées
    "site_id":                 site_id,
    "group_id":                group_id,
    "developer_id":            developer_id,
    "project_id":              project_id,
    "period_start":            start_date.isoformat(),
    "period_end":              end_date.isoformat(),
}

# Lignes 179-181 : Score individuel pour les snapshots développeur
if developer_id is not None:
    kpis["developer_score"] = self.calculate_developer_score(kpis)
```

**Objectif** : Calculer les KPIs normalisés (par développeur) et construire le dictionnaire final. Les KPIs qui dépendent du nombre de développeurs (mr_rate_per_site, commit_rate_per_site) utilisent le dénominateur `nb_devs`.

### 3.4 Score composite développeur

**Fichier** : `app/services/kpi/kpi_calculator.py` (Lignes 48-90)

```python
# Lignes 48-90 : Calcul du score composite développeur
def calculate_developer_score(self, kpis: dict, weights: Optional[dict] = None) -> float:
    """
    Score composite développeur normalisé (0.0 → 1.0).
    Formule pondérée :
      - commit_rate  (25%) : normalisé sur COMMIT_NORMALIZATION commits/mois
      - mr_rate      (25%) : normalisé sur MR_NORMALIZATION MRs/mois
      - approved_rate(30%) : taux d'approbation (déjà entre 0 et 1)
      - review_time  (20%) : score inverse sigmoïde — moins de temps = meilleur score
    """
    if weights is None:
        weights = {
            "commit_rate":   0.25,
            "mr_rate":       0.25,
            "approved_rate": 0.30,
            "review_time":   0.20,
        }
    
    # Lignes 71-74 : Normalisation des composants
    commit_rate   = min(kpis.get("commit_rate_per_site", 0.0) / self.COMMIT_NORMALIZATION, 1.0)
    mr_rate       = min(kpis.get("mr_rate_per_site",    0.0) / self.MR_NORMALIZATION,     1.0)
    approved_rate = min(kpis.get("approved_mr_rate",    0.0),                             1.0)
    avg_review    = max(kpis.get("avg_review_time_hours", 0.0), 0.0)
    
    # Lignes 76-79 : Développeur inactif = score 0
    if kpis.get("commit_rate_per_site", 0.0) == 0 and kpis.get("mr_rate_per_site", 0.0) == 0:
        return 0.0
    
    # Ligne 82 : Sigmoïde inverse pour le review time
    review_score = 1.0 / (1.0 + avg_review / self.REVIEW_REF_HOURS)
    
    # Lignes 84-89 : Calcul du score pondéré
    score = (
        weights["commit_rate"]   * commit_rate   +
        weights["mr_rate"]       * mr_rate        +
        weights["approved_rate"] * approved_rate  +
        weights["review_time"]   * review_score
    )
    return round(max(0.0, min(1.0, score)), 4)
```

**Objectif** : Calculer un score composite (0-1) pour chaque développeur en pondérant 4 métriques clés. Ce score est utilisé pour le classement (leaderboard).

---

## 4. Gestion dynamique des mutations <a name="gestion-dynamique"></a>

### 4.1 Détection des changements sensibles

**Fichier** : `app/api/routers/developers.py` (Lignes 1474-1524)

```python
# Lignes 1474-1524 : Endpoint de mise à jour développeur
@router.put("/{developer_id}")
def update_developer(
    developer_id:    int,
    request:         DeveloperUpdate,
    req:             Request,
    background_tasks: BackgroundTasks,
    db:              Session = Depends(get_db),
    current_admin:   AppUser = Depends(get_current_admin),
):
    service = DeveloperService()
    result  = service.update_developer(
        db=db, developer_id=developer_id, payload=request,
        updated_by=current_admin.id,
        ip_address=req.client.host if req.client else None,
    )
    
    # Lignes 1493-1495 : Extraction des métadonnées de recalcul
    developer           = result["developer"]
    recalculation_needed = result.get("recalculation_needed", False)
    changed_fields       = result.get("changed_fields", [])
    
    # Lignes 1497-1503 : Construction de la réponse enrichie
    dev_response = _build_developer_response(db, developer)
    response_dict = dev_response.model_dump()
    response_dict["recalculation_needed"] = recalculation_needed
    response_dict["changed_fields"]       = changed_fields
    
    # Lignes 1505-1518 : Déclenchement du recalcul en arrière-plan
    if recalculation_needed:
        logger.info(
            f"[ENTERPRISE] Developer {developer_id} ({developer.name}) updated "
            f"with sensitive changes: {changed_fields}. Triggering autonomous background recalculation."
        )
        from app.services.kpi.kpi_service import KpiService
        kpi_service = KpiService()
        
        # ✅ [REAL-TIME AGILITY] : Recalcul autonome de l'historique
        background_tasks.add_task(
            kpi_service.recalculate_developer_history,
            developer_id=developer_id,
            changed_fields=changed_fields
        )
    
    return response_dict
```

**Objectif** : Lorsqu'un développeur est modifié, le système détecte si les changements sont "sensibles" (changement de site, groupe, dates RH, etc.) et déclenche automatiquement un recalcul de l'historique en arrière-plan.

### 4.2 Recalcul de l'historique développeur

**Fichier** : `app/services/kpi/kpi_service.py` (Lignes 111-126)

```python
# Lignes 111-126 : Méthode de recalcul de l'historique
def recalculate_developer_history(self, developer_id: int, changed_fields: Optional[List[str]] = None):
    """
    [ENTERPRISE BRIDGE] Déclenche le recalcul historique via KpiAggregator.
    Utilisé par le routeur en BackgroundTask.
    """
    from app.database.session import SessionLocal
    from app.services.kpi.kpi_aggregator import KpiAggregator
    
    db = SessionLocal()
    try:
        aggregator = KpiAggregator(db)
        aggregator.recalculate_developer_history(developer_id, changed_fields)
    except Exception as e:
        logger.error(f"KpiService.recalculate_developer_history FAILED for dev {developer_id}: {e}")
    finally:
        db.close()
```

**Objectif** : Pont entre le routeur API et l'agrégateur KPI pour le recalcul historique.

### 4.3 Logique de recalcul ciblé

**Fichier** : `app/services/kpi/kpi_aggregator.py` (Lignes 305-397)

```python
# Lignes 305-397 : Recalcul ciblé de l'historique
def recalculate_developer_history(self, developer_id: int, changed_fields: List[str] = None):
    """
    [SENIOR++++] Recalcul ciblé de l'historique suite à une modification de profil.
    Recalcule les snapshots individuels ET les agrégats des sites impactés.
    """
    logger.info(f"RECALCULATE_DEV_HISTORY | dev_id={developer_id} | changes={changed_fields}")
    
    # Lignes 312-349 : Identification des périodes impactées
    periods = self.db.query(Period).all()
    overlapping_periods = set()
    
    for p in periods:
        # Vérifier si le dev a une mission sur cette période
        has_mission = self.db.query(DeveloperProject).filter(
            DeveloperProject.developer_id == developer_id,
            or_(
                DeveloperProject.period_id == p.id,
                and_(
                    DeveloperProject.period_id.is_(None),
                    or_(DeveloperProject.start_date.is_(None), DeveloperProject.start_date <= end_p),
                    or_(DeveloperProject.end_date.is_(None), DeveloperProject.end_date >= p_start)
                )
            )
        ).first() is not None
        
        if has_mission:
            overlapping_periods.add(p.id)
    
    # Lignes 339-345 : Fusion avec les périodes ayant des snapshots
    snapshot_periods = {
        r[0] for r in self.db.query(KpiSnapshot.period_id)
        .filter(KpiSnapshot.developer_id == developer_id)
        .all()
    }
    
    target_period_ids = sorted(list(overlapping_periods | snapshot_periods), reverse=True)
    
    # Lignes 351-397 : Recalcul pour chaque période impactée
    for p_id in target_period_ids:
        period = self.period_repo.get_by_id(self.db, p_id)
        if not period: continue
        
        # Identifier les projets concernés
        project_ids = {
            r[0] for r in self.db.query(DeveloperProject.project_id)
            .filter(
                DeveloperProject.developer_id == developer_id,
                or_(
                    DeveloperProject.period_id == p_id,
                    and_(
                        DeveloperProject.period_id.is_(None),
                        or_(DeveloperProject.start_date.is_(None), DeveloperProject.start_date <= end_p),
                        or_(DeveloperProject.end_date.is_(None), DeveloperProject.end_date >= p_start)
                    )
                )
            ).all()
        }
        
        # Lignes 384-394 : Recalcul complet du projet pour cette période
        for prj_id in project_ids:
            try:
                # On relance le calcul complet du projet pour cette période
                # Cela mettra à jour le dev, mais AUSSI le site (très important !)
                self.generate_monthly_snapshots(
                    project_id=prj_id,
                    year=period.year,
                    month=period.month
                )
            except Exception as e:
                logger.error(f"Error recalculating dev {developer_id} history for period {p_id} project {prj_id}: {e}")
    
    self.db.commit()
    logger.info(f"RECALCULATE_DEV_HISTORY_DONE | dev_id={developer_id}")
```

**Objectif** : Recalculer uniquement les périodes où le développeur a été actif ou a des snapshots, pour tous les projets concernés. Cela met à jour :
- Les snapshots individuels du développeur
- Les snapshots agrégés des sites (car le développeur contribue aux KPIs du site)
- Les snapshots agrégats globaux

### 4.4 Nettoyage des snapshots obsolètes (Auto-Prune)

**Fichier** : `app/services/kpi/kpi_aggregator.py` (Lignes 519-590)

```python
# Lignes 519-590 : Nettoyage des snapshots incohérents
def _prune_stale_developer_snapshots(self, project_id: int, period_id: int, eligible_dev_ids: List[int]):
    """
    [AUTO-PRUNE] Nettoyage des snapshots individuels incohérents.
    Si un développeur a changé de site, ses anciens snapshots individuels pour
    cette période/projet doivent être supprimés pour éviter de fausser les agrégats.
    """
    # Lignes 526-535 : Suppression si aucun développeur éligible
    if not eligible_dev_ids:
        deleted_count = self.db.query(KpiSnapshot).filter(
            KpiSnapshot.project_id == project_id,
            KpiSnapshot.period_id == period_id,
            KpiSnapshot.developer_id.isnot(None)
        ).delete(synchronize_session=False)
        if deleted_count > 0:
            logger.info(f"[AUTO-PRUNE] Removed all {deleted_count} developer snapshots")
        self.db.flush()
        return
    
    # Lignes 537-545 : Suppression des snapshots de devs non éligibles
    deleted_count = self.db.query(KpiSnapshot).filter(
        KpiSnapshot.project_id == project_id,
        KpiSnapshot.period_id == period_id,
        KpiSnapshot.developer_id.isnot(None),
        ~KpiSnapshot.developer_id.in_(eligible_dev_ids)
    ).delete(synchronize_session=False)
    
    # Lignes 547-590 : Suppression des snapshots avec site/groupe obsolète
    for dev_id in eligible_dev_ids:
        current_site_id = self._get_primary_site_for_developer(dev_id, period_date=period_date)
        current_group_id = self._get_primary_group_for_developer(dev_id, period_date=period_date)
        
        q = self.db.query(KpiSnapshot).filter(
            KpiSnapshot.project_id == project_id,
            KpiSnapshot.period_id == period_id,
            KpiSnapshot.developer_id == dev_id
        )
        
        conditions = []
        
        # Condition Site — NULL-safe
        if current_site_id is not None:
            conditions.append(
                or_(KpiSnapshot.site_id != current_site_id,
                    KpiSnapshot.site_id.is_(None))
            )
        else:
            conditions.append(KpiSnapshot.site_id.isnot(None))
        
        # Condition Groupe — NULL-safe
        if current_group_id is not None:
            conditions.append(
                or_(KpiSnapshot.group_id != current_group_id,
                    KpiSnapshot.group_id.is_(None))
            )
        else:
            conditions.append(KpiSnapshot.group_id.isnot(None))
        
        # Suppression si incohérence
        q = q.filter(or_(*conditions))
        deleted_count = q.delete(synchronize_session=False)
        if deleted_count > 0:
            logger.info(f"[AUTO-PRUNE] Removed {deleted_count} stale snapshots for dev_id={dev_id}")
    
    self.db.flush()
```

**Objectif** : Nettoyer automatiquement les snapshots KPIs qui ne sont plus cohérents avec l'état actuel des développeurs (changement de site, groupe, désactivation). Cela évite que les agrégats soient faussés par des données historiques incohérentes.

### 4.5 Types de mutations gérées

#### 4.5.1 Correction de profil (changement de site/groupe)
- **Déclencheur** : Modification de `site_associations` ou `group_links` dans `DeveloperUpdate`
- **Impact** : Recalcul de toutes les périodes où le dev a une mission
- **Auto-Prune** : Suppression des snapshots avec l'ancien site/groupe

#### 4.5.2 Archivage (offboarding)
- **Déclencheur** : Modification de `offboarding_date` ou `is_active = False`
- **Impact** : Application de la règle RG-02 (15 jours)
- **Comportement** : Le dev n'est plus compté dans les périodes futures, mais reste dans l'historique

#### 4.5.3 Activation (onboarding)
- **Déclencheur** : Modification de `onboarding_date` ou `is_active = True`
- **Impact** : Le dev commence à être compté à partir de sa date d'onboarding
- **Comportement** : Recalcul des périodes à partir de l'onboarding

#### 4.5.4 Désactivation temporaire (suspension)
- **Déclencheur** : `is_active = False` avec segment SCD Type 2 (start_date/end_date)
- **Impact** : Le dev n'est pas compté pendant la suspension (pas de segment site/groupe actif)
- **Comportement** : Les KPIs de la période de suspension sont recalculés sans ce dev

---

## 5. Flux jusqu'à l'affichage frontend <a name="flux-frontend"></a>

### 5.1 Génération des snapshots mensuels

**Fichier** : `app/services/kpi/kpi_aggregator.py` (Lignes 39-203)

```python
# Lignes 39-203 : Génération des snapshots mensuels
def generate_monthly_snapshots(
    self,
    project_id: int,
    year:       int,
    month:      int,
    lot_id:     Optional[int] = None,
) -> List[KpiSnapshot]:
    """
    Génère tous les snapshots KPI pour un projet et une période donnée.
    
    Niveaux générés :
        1. Par site    — un snapshot par site associé au projet
        2. Global      — agrégat tous sites confondus
        3. Par groupe  — un snapshot par groupe
        4. Par dev     — un snapshot par développeur validé
    """
    # Lignes 55-68 : Résolution de la plage de dates et certification
    start_date, end_date = get_period_date_range_exclusive(year, month)
    period = self.period_repo.get_by_year_month(self.db, year, month)
    
    eligible_ids = get_certified_developers_for_mission(
        db=self.db, project_id=project_id, period_id=period.id,
        start_date=start_date.date(), end_date=end_date.date()
    )
    
    # Lignes 74-83 : Nettoyage des snapshots obsolètes
    self.db.query(KpiSnapshot).filter(
        KpiSnapshot.project_id   == project_id,
        KpiSnapshot.period_id    == period.id,
        KpiSnapshot.developer_id.is_(None),   # site, global et groupe uniquement
    ).delete(synchronize_session=False)
    self._prune_stale_developer_snapshots(project_id, period.id, eligible_ids)
    
    # Lignes 87-113 : Snapshot par site
    if project_site_ids:
        for site_id in project_site_ids:
            kpis = self.calculator.calculate_for_site(
                project_id, site_id, start_date, end_date, eligible_ids=eligible_ids
            )
            kpis["site_id"] = site_id
            snapshot = self._upsert_with_deltas(kpis, period_id, year, month, lot_id)
            snapshots.append(snapshot)
    
    # Lignes 115-124 : Snapshot global
    global_kpis = self.calculator.calculate_global(project_id, start_date, end_date, eligible_ids=eligible_ids)
    global_kpis["site_id"] = None
    global_kpis["developer_id"] = None
    global_snapshot = self._upsert_with_deltas(global_kpis, period_id, year, month, lot_id)
    snapshots.append(global_snapshot)
    
    # Lignes 126-144 : Snapshot par groupe
    if project_group_ids:
        for group_id in project_group_ids:
            kpis = self.calculator.calculate_for_group(
                project_id, group_id, start_date, end_date, eligible_ids=eligible_ids
            )
            kpis["group_id"] = group_id
            snapshot = self._upsert_with_deltas(kpis, period_id, year, month, lot_id)
            snapshots.append(snapshot)
    
    # Lignes 146-189 : Snapshot par développeur
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
        
        snapshot = self._upsert_with_deltas(dev_kpis, period_id, year, month, lot_id, developer_id=developer.id)
        snapshots.append(snapshot)
    
    # Lignes 178-182 : Calcul du classement par site
    for site_id, score_snapshot_list in dev_snapshots_by_site.items():
        sorted_list = sorted(score_snapshot_list, key=lambda x: x[0], reverse=True)
        for rank, (_, snap) in enumerate(sorted_list, start=1):
            snap.score_rank_in_site = rank
    
    return snapshots
```

**Objectif** : Générer tous les niveaux de snapshots (site, global, groupe, développeur) pour une période donnée, en assurant la cohérence des données via le nettoyage automatique.

### 5.2 Endpoint API multi-période

**Fichier** : `app/api/routers/kpis.py` (Lignes 570-698)

```python
# Lignes 570-698 : Endpoint multi-période pour comparaison
@router.get("/multi-period", summary="Comparaison KPIs sur plusieurs mois par site")
def get_multi_period_kpis(
    project_id: int           = Query(...),
    months:     int           = Query(default=3, ge=1, le=12),
    site_id:    Optional[int] = Query(default=None),
    db:         Session       = Depends(get_db),
    current_user: AppUser     = Depends(get_current_user),
) -> List[Dict[str, Any]]:
    service = AnalyticsService(db)
    
    # Lignes 630-643 : Récupération des périodes avec données
    period_ids_query = (
        db.query(KpiSnapshot.period_id)
        .filter(KpiSnapshot.project_id == project_id)
        .filter(KpiSnapshot.developer_id.is_(None))
        .distinct()
    )
    
    periods_with_data = (
        db.query(Period)
        .filter(Period.id.in_(period_ids_query))
        .order_by(Period.year.desc(), Period.month.desc())
        .limit(months)
        .all()
    )
    
    # Lignes 647-698 : Construction de la réponse
    result = []
    for period in reversed(periods_with_data):
        q = db.query(KpiSnapshot).filter(
            KpiSnapshot.project_id   == project_id,
            KpiSnapshot.period_id    == period.id,
            KpiSnapshot.developer_id.is_(None),
        )
        if site_id is not None:
            q = q.filter(KpiSnapshot.site_id == site_id)
        snapshots = q.order_by(KpiSnapshot.site_id).all()
        
        snapshots_data = []
        for snap in snapshots:
            # Lignes 665-670 : Recalcul des taux avec nb_devs dynamique
            nb_devs = dev_repo.count_active_for_period(
                db, project_id, period.id, site_id=snap.site_id
            )
            
            commit_rate = round(float(snap.total_commits or 0) / nb_devs, 2) if nb_devs > 0 else 0.0
            mr_rate     = round(float(snap.total_mrs_created or 0) / nb_devs, 2) if nb_devs > 0 else 0.0
            
            snapshots_data.append({
                "site_id":                    snap.site_id,
                "mr_rate_per_site":           mr_rate,
                "approved_mr_rate":           snap.approved_mr_rate,
                "commit_rate_per_site":       commit_rate,
                "nb_developers":              nb_devs,
                # ... autres KPIs
            })
        
        result.append({
            "period_id":    period.id,
            "year":         period.year,
            "month":        period.month,
            "period_label": f"{MOIS_FR_LONG.get(period.month, '')} {period.year}",
            "snapshots":    snapshots_data,
        })
    
    return result
```

**Objectif** : Fournir les données KPIs pour plusieurs périodes afin de permettre la comparaison temporelle dans le frontend. Les taux (mr_rate, commit_rate) sont recalculés dynamiquement avec le nombre de développeurs actif pour chaque période.

### 5.3 Affichage dans ComparativeAnalyticsPage.jsx

**Fichier** : `dataCollection/src/frontend/src/pages/ComparativeAnalyticsPage.jsx` (Lignes 1-2636)

```javascript
// Lignes 1-10 : En-tête du fichier
/**
 * ComparativeAnalyticsPage.jsx — Dashboard de Pilotage Stratégique
 *
 * Page de Business Intelligence permettant de :
 *  - Comparer les tendances entre Sites (ex: France vs Tunisie)
 *  - Comparer les tendances entre Équipes (Teams)
 *  - Visualiser l'évolution historique des KPIs de vélocité et qualité
 *
 * Route : /analytics/comparison?project_id=X
 */

// Lignes 11-23 : Imports
import { useState, useEffect, useMemo } from "react";
import { useSearchParams, Link } from "react-router-dom";
import ReactApexChart from "react-apexcharts";
import analyticsService from "../services/analyticsService";  // Service API
// ... autres imports

// Lignes 800-870 : Navigation par onglets (Sites vs Équipes)
<div style={{ background: 'rgba(15, 23, 42, 0.6)', ... }}>
  {(user?.role === 'super_admin' || user?.role === 'site_manager' || ...) && (
    <button onClick={() => setIntelligenceView('sites')}>
      <i className="ri-building-4-line"></i>
      Sites
    </button>
  )}
  {(user?.role === 'super_admin' || user?.role === 'team_lead' || ...) && (
    <button onClick={() => setIntelligenceView('teams')}>
      <i className="ri-team-line"></i>
      Équipes
    </button>
  )}
</div>

// Lignes 876-899 : Affichage des données d'intelligence
{intelligenceView === 'sites' ? (
  intelligenceLoading ? (
    <div className="text-center py-5">
      <i className="ri-loader-4-line fs-2 text-white mb-2 d-block"></i>
      <p className="text-white mb-0">Chargement...</p>
    </div>
  ) : !intelligenceData ? (
    <div className="text-center py-5">
      <i className="ri-database-2-line fs-2 text-white mb-2 d-block"></i>
      <p>En attente de données KPI suffisantes pour l'analyse…</p>
    </div>
  ) : (
    // Affichage des cartes d'intelligence avec les KPIs
    // ...
  )}
```

**Objectif** : La page frontend consomme les données KPIs via le service `analyticsService` et les affiche dans des cartes d'intelligence avec des graphiques de tendance. Les données incluent le nombre de développeurs (`nb_developers`) qui est utilisé pour recalculer les taux à l'affichage.

### 5.4 Service API Frontend

**Fichier** : `dataCollection/src/frontend/src/services/analyticsService.js` (non montré mais implémenté)

```javascript
// Exemple de structure typique
const getMultiPeriodKPIs = async (projectId, months, siteId) => {
  const response = await fetch(`/api/kpis/multi-period?project_id=${projectId}&months=${months}&site_id=${siteId}`);
  return response.json();
};
```

**Objectif** : Service frontend qui appelle l'endpoint backend `/api/kpis/multi-period` et retourne les données KPIs pour affichage.

---

## 6. Résumé des relations entre étapes <a name="resume"></a>

### Flux de données complet

```
1. MUTATION DÉVELOPPEUR
   ↓
   developers.py (Ligne 1474) : update_developer()
   ↓
   Détection changements sensibles (site, groupe, dates RH)
   ↓
   Background task : kpi_service.recalculate_developer_history()
   ↓

2. RECALCUL HISTORIQUE
   ↓
   kpi_service.py (Ligne 111) : recalculate_developer_history()
   ↓
   kpi_aggregator.py (Ligne 305) : recalculate_developer_history()
   ↓
   Identification périodes impactées (missions + snapshots existants)
   ↓

3. GÉNÉRATION SNAPSHOTS
   ↓
   kpi_aggregator.py (Ligne 39) : generate_monthly_snapshots()
   ↓
   mission_utils.py (Ligne 39) : get_certified_developers_for_mission()
   ↓
   Certification des développeurs (RG-02 + SCD Type 2)
   ↓
   Auto-prune des snapshots obsolètes (Ligne 519)
   ↓

4. CALCUL DES KPIs
   ↓
   kpi_calculator.py (Ligne 96) : calculate_project_kpis()
   ↓
   _count_developers() (Ligne 271) : Comptage effectif
   ↓
   _count_commits_by_devs(), _count_mrs(), etc.
   ↓
   Calcul des taux normalisés (mr_rate_per_site, commit_rate_per_site)
   ↓

5. PERSISTENCE
   ↓
   kpi_aggregator.py (Ligne 671) : _upsert_with_deltas()
   ↓
   Sauvegarde dans KpiSnapshot (table de snapshots)
   ↓

6. EXPOSITION API
   ↓
   kpis.py (Ligne 570) : get_multi_period_kpis()
   ↓
   Récupération des snapshots depuis KpiSnapshot
   ↓
   Recalcul dynamique des taux avec nb_devs actuel
   ↓

7. AFFICHAGE FRONTEND
   ↓
   ComparativeAnalyticsPage.jsx (Ligne 1)
   ↓
   analyticsService.getMultiPeriodKPIs()
   ↓
   Affichage dans cartes d'intelligence avec graphiques
```

### Points clés de l'intelligence dynamique

1. **RG-02 (15 jours)** : `mission_utils.py` Ligne 20
   - Règle RH pour le comptage de l'effectif
   - Un dev est compté si offboarding_date >= 15 du mois

2. **SCD Type 2** : `developer.py` Ligne 62-78
   - Historisation des affectations (site, groupe) avec dates
   - Permet de reconstruire l'état passé du système

3. **Auto-Prune** : `kpi_aggregator.py` Ligne 519
   - Nettoyage automatique des snapshots incohérents
   - Évite la pollution des agrégats par des données obsolètes

4. **Recalcul ciblé** : `kpi_aggregator.py` Ligne 305
   - Recalcul uniquement des périodes impactées
   - Optimise les performances lors des mutations

5. **Background tasks** : `developers.py` Ligne 1514
   - Recalcul asynchrone pour ne pas bloquer l'UI
   - Permet une expérience utilisateur fluide

6. **Dénominateur dynamique** : `kpi_calculator.py` Ligne 137
   - `denom = max(nb_devs, 1)`
   - Les KPIs dépendants de l'effectif sont recalculés automatiquement

### KPIs dépendants du nombre de développeurs

Les KPIs suivants sont **directement proportionnels** au nombre de développeurs et sont donc recalculés automatiquement lors des mutations :

1. **mr_rate_per_site** (Ligne 139) : `nb_mrs / nb_devs`
   - MRs créés par développeur
   - Impact : Si un dev quitte, le taux augmente pour les devs restants

2. **commit_rate_per_site** (Ligne 142) : `nb_commits_devs / nb_devs`
   - Commits par développeur
   - Impact : Si un dev quitte, le taux augmente pour les devs restants

3. **developer_score** (Ligne 181) : Score composite
   - Dépend de mr_rate_per_site et commit_rate_per_site
   - Impact : Recalculé automatiquement via calculate_developer_score()

4. **score_rank_in_site** (Ligne 182) : Classement dans le site
   - Basé sur developer_score
   - Impact : Recalculé après chaque mutation

### Exemple concret de mutation

**Scénario** : Un développeur change de site (Site A → Site B)

1. **Mutation** : Admin modifie le développeur dans l'UI
2. **Détection** : `developers.py` Ligne 1493 détecte le changement de site
3. **Background task** : `developers.py` Ligne 1514 déclenche `recalculate_developer_history`
4. **Recalcul** : `kpi_aggregator.py` Ligne 305 identifie toutes les périodes impactées
5. **Génération** : `kpi_aggregator.py` Ligne 39 régénère les snapshots pour ces périodes
6. **Auto-prune** : `kpi_aggregator.py` Ligne 519 supprime les snapshots avec l'ancien site
7. **Impact** :
   - Site A : nb_devs diminue → mr_rate_per_site et commit_rate_per_site augmentent
   - Site B : nb_devs augmente → mr_rate_per_site et commit_rate_per_site diminuent
   - Développeur : Son snapshot individuel est mis à jour avec le nouveau site_id
8. **Affichage** : `ComparativeAnalyticsPage.jsx` affiche les nouvelles valeurs au prochain rafraîchissement

---

## Conclusion

Le système de calcul des KPIs est **intelligent et dynamique** grâce à :

1. **Architecture SCD Type 2** : Historisation complète des affectations avec dates
2. **Règle RG-02** : Comptage RH précis avec seuil de 15 jours
3. **Auto-Prune** : Nettoyage automatique des données incohérentes
4. **Recalcul ciblé** : Optimisation des performances lors des mutations
5. **Background tasks** : Traitement asynchrone pour une UX fluide
6. **Dénominateur dynamique** : Les KPIs dépendants de l'effectif sont recalculés automatiquement

Toute mutation de développeur (correction, archivage, activation, désactivation, changement de site/groupe) déclenche automatiquement une chaîne de recalculs qui garantit la cohérence des données à tous les niveaux (individuel, site, groupe, global).
