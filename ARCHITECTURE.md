# GitLab KPI Dashboard — Architecture Technique

## Vue d'ensemble

Système d'analyse de performance basé sur l'extraction de données GitLab.
Conçu pour permettre au manager de tracker l'activité d'un ou plusieurs développeurs
à travers des projets GitLab, avec agrégation mensuelle et visualisation de KPIs.

---

## Stack Technique

| Couche       | Technologie          | Rôle                              |
|--------------|----------------------|-----------------------------------|
| Backend      | FastAPI (Python 3.11)| API REST + orchestration          |
| ORM          | SQLAlchemy 1.4+      | Modèles + requêtes                |
| Migrations   | Alembic              | Versioning schéma DB              |
| Base de données | PostgreSQL 15     | Persistance + requêtes analytiques|
| Extraction   | GitLab REST API v4   | Source de données                 |
| Frontend     | React 18             | Dashboard de visualisation        |
| Auth         | JWT (HS256)          | Authentification utilisateurs     |
| Scheduling   | APScheduler          | Génération mensuelle automatique  |
| Déploiement  | Docker + Compose     | Conteneurisation                  |

---

## Architecture en Couches

```
┌───────────────────────────────────────────────────────────┐
│                    FRONTEND (React)                        │
│  ExtractionPage / DashboardKPI / DeveloperProfilePage      │
└────────────────────────┬──────────────────────────────────┘
                         │  HTTP REST (axios)
┌────────────────────────▼──────────────────────────────────┐
│                API LAYER (FastAPI)                          │
│  /api/v1/extraction  /api/v1/analytics  /api/v1/admin      │
│  Authentication JWT → get_current_user()                   │
└────────────────────────┬──────────────────────────────────┘
                         │
         ┌───────────────┴───────────────┐
         │                               │
┌────────▼────────┐             ┌────────▼─────────┐
│ EXTRACTION      │             │ KPI CALCULATION   │
│ ExtractionService│             │ KpiCalculator     │
│ GitLabClient    │             │ KpiAggregator     │
│ GitLabMapper    │             │ ThresholdService  │
└────────┬────────┘             └────────┬──────────┘
         │                               │
┌────────▼───────────────────────────────▼──────────┐
│               REPOSITORY LAYER                     │
│  CommitRepo / MergeRequestRepo / DeveloperRepo     │
│  KpiSnapshotRepository / ...                       │
└────────────────────────┬──────────────────────────┘
                         │
┌────────────────────────▼──────────────────────────┐
│              POSTGRESQL DATABASE                   │
│  developer / commit / merge_request / kpi_snapshot │
│  extraction_lot / site / developer_site / ...      │
└───────────────────────────────────────────────────┘
```

---

## Modèle de données — Entités clés

### Developer
```
id | gitlab_user_id | email | gitlab_username | name | is_active | is_bot
```
La déduplication est assurée par `_resolve_developer()` avec lookup prioritaire :
`gitlab_user_id > email > username > name > synthetic_id (hash)`

### ExtractionLot
```
id | developer_id | project_id | gitlab_config_id | lot_type | status | created_at
```
Unité atomique d'extraction. Chaque lot = une extraction = un historique traçable.

### KpiSnapshot
```
id | project_id | period_id | site_id | group_id | developer_id
   | mr_rate_per_site | approved_mr_rate | merged_mr_rate
   | commit_rate_per_site | avg_review_time_hours
   | developer_score | score_rank_in_site
   | delta_* (variations mois/mois)
```
Index unique : `COALESCE` sur les champs nullables pour gérer les niveaux d'agrégation.

---

## Modes d'Extraction

### Mode "Par Projet"
- **Périmètre** : un seul repository GitLab
- **Usage** : "Qu'est-ce qui a été livré dans ce projet ce mois ?"
- **Filtre optionnel** : restreindre à certains développeurs

### Mode "Par Équipe"
- **Périmètre** : un ou plusieurs développeurs, tous projets
- **Usage** : "Quel est le profil de performance de Dev X ?"
- **Strict Mode** : interdit la création de nouveaux profils (anti-bruit)

---

## Formule de Score Développeur

```
score = 0.25 × commit_score
      + 0.25 × mr_score
      + 0.30 × approved_rate
      + 0.20 × review_score

commit_score  = min(commits / COMMIT_NORMALIZATION, 1.0)
mr_score      = min(mrs / MR_NORMALIZATION, 1.0)
review_score  = 1 / (1 + avg_review_hours / REVIEW_REF_HOURS)  ← sigmoïde inverse
```

| Constante            | Valeur par défaut | Signification                     |
|----------------------|-------------------|-----------------------------------|
| COMMIT_NORMALIZATION | 10                | 10 commits/mois = score max       |
| MR_NORMALIZATION     | 5                 | 5 MRs/mois = score max            |
| REVIEW_REF_HOURS     | 24                | 24h review → score_review = 0.5   |

---

## Endpoints Clés

| Méthode | Route                              | Description                        |
|---------|------------------------------------|------------------------------------|
| POST    | `/api/v1/extraction/by-project`    | Lance extraction par projet        |
| POST    | `/api/v1/extraction/by-team`       | Lance extraction par équipe        |
| GET     | `/api/v1/extraction/jobs/{lot_id}` | Status d'un job d'extraction       |
| GET     | `/api/v1/analytics/{project_id}/latest` | Derniers KPIs d'un projet    |
| GET     | `/api/v1/analytics/{project_id}/history` | Historique mensuel          |
| GET     | `/api/v1/analytics/developer/{id}/heatmap` | Heatmap d'activité       |
| GET     | `/api/v1/analytics/team/velocity`  | Vélocité hebdomadaire équipe       |
| GET     | `/health`                          | Health check DB + version          |

---

## Décisions d'Architecture

### Pourquoi KpiSnapshot avec NULLs ?
Un snapshot peut représenter 4 niveaux d'agrégation :
- **Global projet** : `site_id=NULL, group_id=NULL, developer_id=NULL`
- **Par site** : `site_id=N, group_id=NULL, developer_id=NULL`
- **Par groupe** : `site_id=N, group_id=M, developer_id=NULL`
- **Par développeur** : `site_id=N, group_id=M, developer_id=D`

L'index unique utilise `COALESCE(field, -1)` pour garantir l'unicité malgré les NULLs.

### Pourquoi séparer Extraction et Calcul KPI ?
- L'extraction est **impure** : dépend d'une API externe, peut échouer
- Le calcul KPI est **pur** : données en base, reproductible, testable
- Cette séparation permet de recalculer les KPIs sans re-extraire

### Pourquoi M2M Project↔Site et Developer↔Site ?
Un développeur peut appartenir à plusieurs sites (ex: Dev mobile + Dev backend).
Un projet peut être rattaché à plusieurs sites selon la période.
→ Flexibilité organisationnelle sans duplication de données.

---

## Lancement rapide

```bash
# Backend
cd dataCollection/src/backend
pip install -r requirements.txt
uvicorn app.main:app --reload

# Frontend
cd dataCollection/src/frontend
npm install && npm run dev

# Docker (tout-en-un)
docker compose up --build
```

---

## Tests

```bash
# Tous les tests
pytest tests/ -v

# Avec couverture
pytest tests/ --cov=app --cov-report=html

# Test spécifique
pytest tests/test_kpi_calculator.py -v
```

---

*Document maintenu par l'équipe PFE — dernière mise à jour : Avril 2026*
