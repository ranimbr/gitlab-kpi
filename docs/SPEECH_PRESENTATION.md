# Speech de Présentation - GitLab KPI Dashboard

---

## Introduction (2-3 minutes)

Bonjour à tous,

Aujourd'hui, je suis ravi de vous présenter le **GitLab KPI Dashboard**, un projet innovant qui transforme la manière dont nous analysons et suivons les performances de nos équipes de développement.

Ce projet est né d'un besoin simple mais crucial : **avoir une vision claire, objective et en temps réel de la productivité de nos équipes** dispersées sur plusieurs sites et projets.

---

## Contexte et Problématique (3-4 minutes)

### Le constat de départ

Dans notre environnement de développement multi-sites, nous faisions face à plusieurs défis majeurs :

- **Manque de visibilité** : Impossible d'avoir une vue consolidée des performances par site, par équipe, par développeur
- **Données disparates** : Les informations étaient éparpillées entre GitLab, les fichiers Excel et les rapports manuels
- **Subjectivité** : Les évaluations reposaient souvent sur des perceptions plutôt que sur des données factuelles
- **Perte de temps** : Les managers passaient des heures à consolider des manuellement des données

### La solution proposée

Le GitLab KPI Dashboard répond à ces défis en offrant :

- **Automatisation complète** : Extraction automatique des données depuis GitLab
- **Calculs standardisés** : Indicateurs uniformes pour tous les sites et équipes
- **Historique temporel** : Suivi de l'évolution sur plusieurs mois
- **Intelligence analytique** : Détection d'anomalies et recommandations automatiques

---

## Architecture Technique (2-3 minutes)

Notre solution repose sur une architecture moderne en 5 couches :

### 1. Frontend (React)
- Interface utilisateur intuitive et responsive
- Visualisation interactive des données
- Gestion des rôles et permissions

### 2. API REST (FastAPI)
- Endpoints sécurisés avec authentification
- Validation des requêtes
- Gestion des erreurs robuste

### 3. Services Business Logic
- Calcul des KPIs (vélocité, qualité, temps de revue)
- Gestion des développeurs avec système SCD Type 2
- Module Fab Intelligence pour l'analyse avancée

### 4. Repositories (Accès données)
- Abstraction de la base de données
- Requêtes SQL optimisées
- Gestion des transactions

### 5. Base de données (PostgreSQL)
- Stockage structuré des données
- Historique complet des mutations
- Intégrité des données garantie

---

## Base de Données - Structure et Relations (3-4 minutes)

### Schéma relationnel global

Notre base de données PostgreSQL est organisée autour de plusieurs tables interconnectées qui permettent de tracer l'historique complet des développeurs et de leurs contributions.

### Tables principales

#### 1. Table `developer` (Développeurs)
**Colonnes clés :**
- `id` : Identifiant unique (PK)
- `name` : Nom complet du développeur
- `email` : Email professionnel
- `gitlab_username` : Username GitLab
- `gitlab_user_id` : ID GitLab (pour synchronisation)
- `onboarding_date` : Date d'arrivée dans l'entreprise
- `offboarding_date` : Date de départ
- `is_active` : Statut actif/inactif
- `is_bot` : Indicateur de compte robot
- `is_validated` : Statut de validation
- `created_at` : Date de création
- `updated_at` : Date de dernière modification

**Relations :**
- Un développeur peut avoir plusieurs missions (DeveloperProject)
- Un développeur peut être affecté à plusieurs sites (DeveloperSite)
- Un développeur peut appartenir à plusieurs groupes (DeveloperGroupLink)
- Un développeur peut avoir plusieurs commits (Commit)
- Un développeur peut créer plusieurs MRs (MergeRequest)

#### 2. Table `commit` (Commits GitLab)
**Colonnes clés :**
- `id` : Identifiant unique (PK)
- `developer_id` : FK vers developer
- `project_id` : FK vers project
- `gitlab_commit_id` : ID du commit dans GitLab
- `authored_date` : Date de création du commit
- `message` : Message du commit
- `extraction_lot_id` : FK vers extraction_lot

**Relations :**
- Un commit appartient à un développeur (developer_id)
- Un commit appartient à un projet (project_id)
- Un commit fait partie d'un lot d'extraction (extraction_lot_id)

#### 3. Table `merge_request` (MRs GitLab)
**Colonnes clés :**
- `id` : Identifiant unique (PK)
- `developer_id` : FK vers developer
- `project_id` : FK vers project
- `gitlab_mr_id` : ID du MR dans GitLab
- `title` : Titre du MR
- `created_at_gitlab` : Date de création
- `merged_at` : Date de fusion
- `approved` : Statut d'approbation
- `is_draft` : Indicateur de brouillon
- `review_time_hours` : Temps de revue en heures
- `extraction_lot_id` : FK vers extraction_lot

**Relations :**
- Un MR est créé par un développeur (developer_id)
- Un MR appartient à un projet (project_id)
- Un MR fait partie d'un lot d'extraction (extraction_lot_id)

#### 4. Table `developer_project` (Missions)
**Colonnes clés :**
- `id` : Identifiant unique (PK)
- `developer_id` : FK vers developer
- `project_id` : FK vers project
- `period_id` : FK vers period (optionnel)
- `start_date` : Date de début de mission
- `end_date` : Date de fin de mission
- `is_active` : Statut actif de la mission

**Relations :**
- Une mission lie un développeur à un projet
- Une mission peut être liée à une période spécifique
- Permet de tracer l'historique des affectations par projet

#### 5. Table `developer_site` (Affectations aux Sites - SCD Type 2)
**Colonnes clés :**
- `id` : Identifiant unique (PK)
- `developer_id` : FK vers developer
- `site_id` : FK vers site
- `start_date` : Date de début d'affectation
- `end_date` : Date de fin d'affectation
- `is_primary` : Indicateur de site principal
- `is_active` : Statut actif de l'affectation

**Relations :**
- Une affectation lie un développeur à un site
- Pattern SCD Type 2 : permet de conserver l'historique complet des changements de site
- Plusieurs affectations peuvent exister pour un même développeur (historique)

#### 6. Table `developer_group_link` (Appartenance aux Groupes - SCD Type 2)
**Colonnes clés :**
- `id` : Identifiant unique (PK)
- `developer_id` : FK vers developer
- `group_id` : FK vers group
- `start_date` : Date de début d'appartenance
- `end_date` : Date de fin d'appartenance
- `is_active` : Statut actif de l'appartenance

**Relations :**
- Un lien lie un développeur à un groupe
- Pattern SCD Type 2 : historique complet des changements d'équipe
- Plusieurs liens peuvent exister pour un même développeur

#### 7. Table `period` (Périodes de temps)
**Colonnes clés :**
- `id` : Identifiant unique (PK)
- `year` : Année (ex: 2024)
- `month` : Mois (ex: 4)
- `start_date` : Date de début de période
- `end_date` : Date de fin de période

**Relations :**
- Une période regroupe les données d'un mois donné
- Utilisée pour le calcul des KPIs mensuels
- Les snapshots KPI sont liés à une période

#### 8. Table `extraction_lot` (Lots d'extraction)
**Colonnes clés :**
- `id` : Identifiant unique (PK)
- `project_id` : FK vers project
- `period_id` : FK vers period
- `extracted_at` : Date d'extraction
- `status` : Statut de l'extraction

**Relations :**
- Un lot regroupe les données extraites de GitLab à un moment donné
- Permet de tracer quelles données ont été utilisées pour quels calculs
- Assure la reproductibilité des calculs

#### 9. Table `kpi_snapshot` (Snapshots KPI)
**Colonnes clés :**
- `id` : Identifiant unique (PK)
- `project_id` : FK vers project
- `period_id` : FK vers period
- `site_id` : FK vers site (optionnel)
- `group_id` : FK vers group (optionnel)
- `developer_id` : FK vers developer (optionnel)
- `mr_rate_per_site` : MRs par développeur
- `approved_mr_rate` : Taux d'approbation
- `merged_mr_rate` : Taux de fusion
- `commit_rate_per_site` : Commits par développeur
- `avg_review_time_hours` : Temps moyen de revue
- `created_at` : Date de création du snapshot

**Relations :**
- Un snapshot peut être au niveau projet, site, groupe ou développeur
- Stocke les KPIs calculés pour une période donnée
- Permet l'analyse historique sans recalculer à chaque fois

### Relations clés entre tables

**Hiérarchie des affectations :**
```
developer → developer_project → project
developer → developer_site → site
developer → developer_group_link → group
```

**Flux de données GitLab :**
```
developer → commit → project
developer → merge_request → project
commit → extraction_lot → period
merge_request → extraction_lot → period
```

**Calcul et stockage des KPIs :**
```
developer + project + period → kpi_snapshot
site + project + period → kpi_snapshot
group + project + period → kpi_snapshot
```

### Pattern SCD Type 2 expliqué

Le système utilise le pattern **Slowly Changing Dimension Type 2** pour les tables `developer_site` et `developer_group_link`. Cela signifie :

- Chaque changement d'affectation crée un **nouvel enregistrement** avec une date de début
- L'ancien enregistrement est **clôturé** avec une date de fin
- L'historique complet est **préservé** et consultable
- Les calculs KPI peuvent utiliser l'état du développeur **à n'importe quelle date passée**

**Exemple concret :**
```
Développeur Ahmed :
- 01/01/2024 : Affecté au site Tunis (enregistrement 1)
- 01/06/2024 : Mutation vers Paris (enregistrement 2, clôture enregistrement 1)
- 01/12/2024 : Retour à Tunis (enregistrement 3, clôture enregistrement 2)
```

Pour calculer les KPIs de février 2024, le système utilise l'enregistrement 2 (Paris).
Pour calculer les KPIs de janvier 2024, le système utilise l'enregistrement 1 (Tunis).

---

## Fonctionnalités Clés (4-5 minutes)

### 1. Calcul des KPIs

Notre système calcule automatiquement plusieurs indicateurs essentiels :

- **Vélocité** : Nombre de commits et MRs par développeur
- **Qualité** : Taux d'approbation et de fusion des MRs
- **Temps de revue** : Délai moyen de review en heures
Ces KPIs sont calculés en appliquant la **règle RG-02** (règle des 15 jours) qui s'inspire des pratiques RH standard pour proratiser l'effectif.

### 2. Gestion Dynamique des Développeurs

Le système gère le cycle de vie complet des développeurs :

- **Onboarding** : Intégration automatique dès la date d'arrivée
- **Mutations** : Changements de site, d'équipe avec historique complet
- **Offboarding** : Archivage avec préservation de l'historique
- **Suspensions** : Gestion des désactivations temporaires

Tout cela grâce au pattern **SCD Type 2** (Slowly Changing Dimension) qui permet de conserver un historique précis de toutes les affectations.

### 3. Fab Intelligence - Analyse Avancée

C'est le module le plus innovant de notre solution. Il utilise des algorithmes statistiques (pas d'IA) pour :

- **Détecter les anomalies** : Identifier les sites/équipes qui performent mal ou exceptionnellement bien

- **Analyser les tendances** : Suivre l'évolution sur plusieurs mois
- **Générer des recommandations** : Proposer des actions concrètes d'amélioration

Par exemple, si le système détecte qu'un site a une vélocité en baisse de 30% sur 3 mois avec une qualité dégradée, il recommandera automatiquement des actions RH comme un audit de charge ou une formation ciblée.

### 4. Gestion des Permissions

Notre système implémente un modèle de sécurité robuste avec 4 rôles :

- **Super Admin** : Accès total à tous les projets et sites
- **Project Manager** : Vue complète sur son projet
- **Site Manager** : Vue limitée à ses sites assignés
- **Viewer** : Lecture seule sur ses sites autorisés

---

## Avantages Concurrentiels (2-3 minutes)

### Ce qui nous différencie

1. **Approche data-driven** : Décisions basées sur des données factuelles, pas sur des impressions
2. **Historique temporel** : Capacité à analyser les tendances sur plusieurs mois
3. **Intelligence intégrée** : Recommandations automatiques basées sur des règles statistiques
4. **Flexibilité** : Système adaptable à différentes organisations et structures
5. **Performance** : Calculs optimisés avec mise en cache des requêtes

### ROI attendu

- **Gain de temps** : Réduction de 80% du temps consacré à la consolidation manuelle
- **Meilleures décisions** : Identification rapide des problèmes et opportunités
- **Transparence** : Visibilité accrue pour tous les stakeholders
- **Amélioration continue** : Suivi objectif de l'impact des initiatives

---

## Démo Technique (3-4 minutes)

[À adapter selon votre démo]

Je vais теперь vous montrer une démonstration rapide du système :

1. **Vue d'ensemble** : Dashboard principal avec les KPIs par site
2. **Analyse comparative** : Comparaison entre sites sur une période
3. **Fab Intelligence** : Démonstration de la détection d'anomalies et recommandations
4. **Gestion développeurs** : Exemple de mutation avec historique

---

## Conclusion et Perspectives (2 minutes)

### Résumé

Le GitLab KPI Dashboard représente une avancée significative dans notre capacité à :

- **Mesurer** objectivement la performance
- **Analyser** les tendances et anomalies
- **Agir** avec des recommandations ciblées
- **Suivre** l'impact de nos décisions

### Prochaines étapes

- Déploiement progressif sur tous les projets
- Enrichissement des indicateurs (nouvelles métriques)
- Intégration avec d'autres outils (Jira, SonarQube)
- Développement de prédictions basées sur les tendances

### Appel à l'action

Je vous invite maintenant à essayer le dashboard et à me faire part de vos retours. Votre feedback sera précieux pour continuer à améliorer l'outil.

Merci de votre attention, je suis disponible pour répondre à vos questions.

---

## Annexes : Questions Fréquentes Anticipées

### Q : Les données sont-elles sécurisées ?
R : Oui, authentification JWT, chiffrement des mots de passe, et gestion fine des permissions par rôle.

### Q : Comment le système gère-t-il les développeurs qui changent d'équipe ?
R : Grâce au pattern SCD Type 2, chaque changement est historisé avec des dates de début/fin, permettant une analyse précise de l'impact sur les KPIs.

### Q : Fab Intelligence utilise-t-il de l'IA ?
R : Non, c'est de la logique statistique pure avec des règles mathématiques précises (Isolation Forest, corrélations, tendances).

### Q : Peut-on exporter les données ?
R : Oui, export CSV/Excel disponible pour tous les rapports.

### Q : Quelle est la fréquence de mise à jour des données ?
R : Les données sont extraites automatiquement de GitLab selon une planification configurable (quotidienne, hebdomadaire, mensuelle).

---

## Conseils pour la Présentation

### Avant la présentation
- Préparer une démo technique fonctionnelle
- Avoir des screenshots de sauvegarde en cas de problème technique
- Connaître les chiffres clés de votre organisation

### Pendant la présentation
- Parler lentement et articuler
- Utiliser des exemples concrets de votre organisation
- Inviter à l'interaction avec des questions

### Après la présentation
- Distribuer un résumé écrit
- Planifier des sessions de formation pour les utilisateurs
- Créer un canal de communication pour le support
