# Limitations de l'IA : Pourquoi nous ne pouvons pas l'introduire pour le moment

## Résumé Exécutif

Ce document explique les raisons techniques et pragmatiques pour lesquelles l'intégration de l'IA (Machine Learning / Deep Learning) n'est pas envisageable à court terme dans le dashboard KPI GitLab de Telnet Holding.

---

## 1. Volume de Données Insuffisant

### 1.1 Problème Fondamental

**Règle d'or du Machine Learning** : 
- Pour un modèle basique : **10,000+ exemples**
- Pour un modèle performant : **100,000+ à 1,000,000+ exemples**
- Pour le deep learning : **millions d'exemples**

**Notre réalité actuelle** :
- Période de collecte : **6 mois maximum**
- Nombre de développeurs : **~50-100 développeurs**
- Nombre de sites : **5-10 sites**
- Snapshots KPI mensuels : **~500-1000 enregistrements**

**Calcul** :
```
100 développeurs × 6 mois × 5 sites = 3,000 snapshots maximum
3,000 << 10,000 (minimum pour ML basique)
```

### 1.2 Conséquences

Avec 3,000 exemples :
- **Overfitting garanti** : Le modèle apprendrait par cœur les données existantes
- **Généralisation impossible** : Échec sur de nouveaux développeurs/sites
- **Instabilité** : Petites variations = résultats radicalement différents
- **Pas de validation fiable** : Impossible de séparer train/test/val

---

## 2. Dimensionnalité vs Données

### 2.1 Curse of Dimensionality

**Variables KPI disponibles** :
- Velocity (MRs/dev)
- Review time (heures)
- Quality (taux d'approbation)
- Commit rate
- Merge rate
- Code churn
- + 20+ autres métriques GitLab

**Ratio données / variables** :
```
3,000 données / 30 variables = 100 données par variable
Recommandation ML : 100-1000+ données par variable minimum
```

### 2.2 Problème de Sparsity

Avec 30 variables et 3,000 exemples :
- L'espace de features est **trop grand**
- Les données sont **trop dispersées**
- Impossible d'apprendre des patterns significatifs

---

## 3. Nature des Données : Time Series vs Cross-Sectional

### 3.1 Problème Temporel

**Nos données** : Time series mensuelles (6 mois)

**Problème** :
- 6 points temporels par développeur = **trop court**
- Les modèles de time series nécessitent **50-100+ points**
- Impossible de capturer :
  - Saisonnalité
  - Cycles longs
  - Tendances structurelles

### 3.2 Problème Cross-Sectional

**Approche alternative** : Traiter comme cross-sectional (un snapshot par développeur)

**Problème** :
- Perte de l'information temporelle
- Un seul point par développeur = **pas de pattern**
- Impossible de modéliser l'évolution

---

## 4. Qualité et Consistance des Données

### 4.1 Données Manquantes

**Problèmes observés** :
- Mois en cours non clôturés (NULL values)
- Développeurs récents (historique incomplet)
- Sites nouveaux (pas assez de données)
- Projets pilotes (données parcellaires)

**Impact ML** :
- Les modèles ML **ne tolèrent pas les données manquantes**
- Imputation = introduction de biais
- Suppression = réduction drastique du volume

### 4.2 Variabilité Métier

**Facteurs non capturés** :
- Changements d'équipe
- Nouveaux projets
- Restructurations organisationnelles
- Pics saisonniers (vacances, fin d'année)
- Contexte externe (deadlines clients)

**Impact** :
- Le modèle ne peut pas "comprendre" le contexte
- Faux positifs/négatifs garantis
- Recommandations incohérentes

---

## 5. Problème de Ground Truth

### 5.1 Absence de Labels

**Pour le supervised learning**, il faut des labels :
- "Ce développeur est performant" → label = 1
- "Ce développeur est en difficulté" → label = 0

**Notre réalité** :
- **Pas de labels explicites**
- Pas d'évaluations RH systématiques
- Pas de définition consensuelle de "performance"
- Subjectivité inhérente à l'évaluation

### 5.2 Conséquences

Sans labels :
- **Supervised learning impossible**
- Unsupervised learning = clusters non interprétables
- Reinforcement learning = pas de reward function claire

---

## 6. Interprétabilité et Acceptation

### 6.1 Boîte Noire vs Règles Explicites

**Notre approche actuelle** :
```python
if velocity < Q1:
    recommandation = "Recrutement nécessaire"
```
- **100% transparent**
- **Justifiable**
- **Modifiable**

**Approche ML typique** :
```python
prediction = black_box_model(features)
# Pourquoi ? → Impossible à expliquer
```
- **Boîte noire**
- **Difficile à justifier**
- **Rejet par les managers**

### 6.2 Acceptation Métier

**Exigences RH/Legal** :
- Recommandations **justifiables**
- Pas de discrimination cachée
- Traçabilité des décisions
- Possibilité de contestation

**ML = difficile à défendre** :
- "Pourquoi le modèle recommande le licenciement ?"
- "C'est ce que dit le modèle" → **inacceptable en entreprise**

---

## 7. Maintenance et Coût

### 7.1 Coût de Développement

**Approche statistique actuelle** :
- Développement : **2-3 semaines**
- Maintenance : **minime**
- Expertise requise : **statistiques basiques**

**Approche ML** :
- Développement : **3-6 mois**
- Data engineering : **1-2 mois**
- MLOps : **1-2 mois**
- Expertise requise : **data scientist senior**

### 7.2 Coût d'Exploitation

**Infrastructure ML** :
- GPU/TPU pour entraînement
- Stockage distribué
- Pipeline de données complexe
- Monitoring de modèle
- Retraînement régulier

**ROI négatif** :
- Coût >> Bénéfice pour notre volume de données

---

## 8. Alternatives Viables

### 8.1 Ce que nous faisons DÉJÀ (et qui fonctionne)

✅ **Statistiques descriptives**
- Percentiles (Q1, Q3)
- Moyennes mobiles
- Écarts-types

✅ **Règles métier explicites**
- If/else documentées
- Seuils dynamiques
- Recommandations transparentes

✅ **ML classique léger**
- Isolation Forest (outliers)
- Algorithme standard
- Pas d'entraînement personnalisé

### 8.2 Ce que nous POURRIONS faire (avec plus de données)

**À 1-2 ans (si collecte continue)** :
- 50,000+ snapshots
- 5+ ans d'historique
- Labels RH systématiques

**Alors envisager** :
- Modèles de time series (Prophet, ARIMA)
- Clustering pour profils de développeurs
- Classification de performance

**Mais pas maintenant** - données insuffisantes.

---

## 9. Roadmap Réaliste

### Phase 1 (Actuel) - Statistiques & Règles
- ✅ Seuils dynamiques (percentiles)
- ✅ Analyse de tendances
- ✅ Recommandations if/else
- ✅ Score de santé déterministe

### Phase 2 (6-12 mois) - Enrichissement Données
- 🔄 Collecte continue
- 🔄 Labels RH manuels
- 🔄 Feedback loop (recommandations acceptées/rejetées)
- 🔄 A/B testing des règles

### Phase 3 (2-3 ans) - ML Léger
- ⏳ 50,000+ snapshots
- ⏳ Labels systématiques
- ⏳ Modèles de clustering
- ⏳ Classification supervisée

### Phase 4 (5+ ans) - Deep Learning (si pertinent)
- ⏳ 500,000+ snapshots
- ⏳ Besoin identifié
- ⏳ ROI démontré

---

## 10. Conclusion

### Réponse à la question "Pourquoi pas d'IA ?"

**Réponse courte** :
> "Nous n'avons pas assez de données. Le ML nécessite 10,000+ exemples minimum, nous en avons 3,000. Avec ce volume, tout modèle ML serait instable, non généralisable et injustifiable."

**Réponse détaillée** :
1. **Volume insuffisant** : 3,000 vs 10,000+ requis
2. **Dimensionnalité** : 30 variables pour 3,000 données = curse of dimensionality
3. **Time series trop courtes** : 6 mois vs 50-100+ requis
4. **Pas de labels** : Impossible de faire du supervised learning
5. **Interprétabilité** : ML = boîte noire, inacceptable pour RH
6. **Coût** : Développement ML = 6 mois vs 3 semaines pour règles
7. **ROI négatif** : Coût >> bénéfice pour notre contexte

### Notre approche est OPTIMALE pour notre contexte

- **Statistiques descriptives** : adaptées à notre volume
- **Règles explicites** : justifiables et modifiables
- **Seuils dynamiques** : adaptation automatique par projet
- **Transparence totale** : pas de boîte noire

**C'est de l'intelligence STATISTIQUE, pas de l'IA. Et c'est exactement ce dont nous avons besoin.**

---

## Annexes

### A. Références Académiques

**Règle empirique ML** :
- "10 examples per feature" - *Rule of thumb in ML*
- Source : *The Elements of Statistical Learning*, Hastie et al.

**Time series requirements** :
- Minimum 50 observations for ARIMA
- Minimum 100 for seasonal models
- Source : *Forecasting: Principles and Practice*, Hyndman & Athanasopoulos

### B. Calculs Détaillés

**Volume actuel** :
```
Développeurs : 80
Sites : 7
Périodes : 6
Snapshots : 80 × 7 × 6 = 3,360
```

**Volume requis (conservatif)** :
```
Minimum ML : 10,000 exemples
Recommandé : 50,000+ exemples
Deep learning : 1,000,000+ exemples
```

**Gap** :
```
3,360 / 10,000 = 33.6% du minimum
3,360 / 50,000 = 6.7% du recommandé
```

### C. Comparaison Approches

| Critère | Statistiques Actuelles | ML (si possible) |
|---------|----------------------|-----------------|
| Données requises | 100+ | 10,000+ |
| Développement | 2-3 semaines | 3-6 mois |
| Maintenance | Minimale | Continue |
| Interprétabilité | 100% | 10-50% |
| Justifiabilité | Excellente | Difficile |
| Coût | Bas | Élevé |
| ROI | Positif | Négatif (actuel) |

---

**Document préparé pour** : Réunion avec encadrement Telnet Holding  
**Date** : 19 juin 2026  
**Auteur** : Équipe technique Dashboard KPI  
**Version** : 1.0
