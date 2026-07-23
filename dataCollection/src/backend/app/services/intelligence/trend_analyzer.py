"""
Analyse de tendances multi-périodes pour le moteur d'intelligence statistique.

Ce module complète AnomalyDetector (détection ponctuelle) avec une analyse
longitudinale : une anomalie persistante sur N mois est bien plus significative
qu'un pic isolé.
"""
from typing import Dict, List, Any, Optional
from sqlalchemy.orm import Session
from app.models.kpi_snapshot import KpiSnapshot
from .percentile_calculator import PercentileCalculator, FALLBACK_THRESHOLDS


# ── Seuils métier (fallbacks si pas assez de données) ─────────────────────────
# ✅ UNIFICATION : Utiliser les mêmes seuils que le frontend (Option 1)
FALLBACK_VELOCITY_LOW_THRESHOLD    = 3.0   # MRs/dev considéré faible (frontend: 3.0)
FALLBACK_REVIEW_TIME_HIGH_THRESHOLD = 48.0  # heures — au-dessus : goulot (frontend: 48h)
FALLBACK_QUALITY_LOW_THRESHOLD     = 0.7   # taux d'approbation — en dessous : risque qualité (frontend: 70% = 0.7)
DECLINING_MIN_PERIODS     = 2     # nb de périodes consécutives en déclin pour alerter


class TrendAnalyzer:
    """
    Analyse l'évolution des KPIs site par site sur plusieurs mois.

    Inputs  : site_histories = Dict[site_id -> List[KpiSnapshot]]
              (trié du plus ancien au plus récent)
    Outputs : tendances, alertes, score de santé, recommandations RH
    
    Les seuils sont calculés dynamiquement via PercentileCalculator si db et project_id sont fournis.
    """

    def __init__(self, db: Optional[Session] = None, project_id: Optional[int] = None, site_ids: Optional[List[int]] = None, group_ids: Optional[List[int]] = None):
        """
        Initialise le TrendAnalyzer avec des seuils dynamiques ou fallbacks.
        
        Args:
            db: Session de base de données (optionnel)
            project_id: ID du projet (optionnel)
            site_ids: IDs des sites à analyser (optionnel, pour filtrer les comparaisons inter-sites)
            group_ids: IDs des groupes à analyser (optionnel, pour filtrer les comparaisons inter-équipes)
        """
        self.db = db
        self.project_id = project_id
        self.site_ids = site_ids
        self.group_ids = group_ids
        # ✅ FIX: Ajouter dev_repo pour le recalcul dynamique
        from app.repositories.developer_repository import DeveloperRepository
        self.dev_repo = DeveloperRepository()
        print(f"[DEBUG TrendAnalyzer __init__] db={db is not None}, project_id={project_id}, site_ids={site_ids}, group_ids={group_ids}")
        self.thresholds = self._get_dynamic_thresholds() if db and project_id else self._get_fallback_thresholds()
        print(f"[DEBUG TrendAnalyzer __init__] thresholds={self.thresholds}")

    # ── Méthode principale ────────────────────────────────────────────────────

    def _get_dynamic_thresholds(self) -> Dict[str, float]:
        """Calcule les seuils dynamiques via PercentileCalculator."""
        calculator = PercentileCalculator(self.db)
        thresholds = calculator.calculate_dynamic_thresholds(self.project_id, min_periods=1)  # Réduit à 1 pour permettre le calcul avec moins de données
        return {
            "velocity_low": thresholds["velocity_low"],
            "review_time_high": thresholds["review_time_high"],
            "quality_low": thresholds["quality_low"],
            "using_fallback": thresholds["using_fallback"],
        }

    def _get_fallback_thresholds(self) -> Dict[str, float]:
        """Retourne les seuils de fallback hardcodés."""
        return {
            "velocity_low": FALLBACK_VELOCITY_LOW_THRESHOLD,
            "review_time_high": FALLBACK_REVIEW_TIME_HIGH_THRESHOLD,
            "quality_low": FALLBACK_QUALITY_LOW_THRESHOLD,
            "using_fallback": True,
        }

    def analyze(self, site_histories: Dict[int, List[KpiSnapshot]]) -> Dict[str, Any]:
        """
        Analyse complète multi-périodes pour tous les sites ou équipes.
        Context-aware: détecte automatiquement si les données sont par site ou par équipe.

        Returns:
            {
                "site_trends": {entity_id: {...}},  # ou "team_trends" pour les équipes
                "alerts":      [...],
                "health_scores": {entity_id: int},
                "rh_recommendations": [...],
                "summary": str
            }
        """
        site_trends:     Dict[int, Dict] = {}
        all_alerts:      List[Dict]      = []
        health_scores:   Dict[int, int]  = {}
        rh_recommendations: List[Dict]  = []

        # Détecter si c'est une analyse d'équipes ou de sites
        is_team_analysis = False
        for entity_id, history in site_histories.items():
            if history and bool(history[-1].group_id is not None):
                is_team_analysis = True
                break

        for entity_id, history in site_histories.items():
            if not history:
                continue

            # Context-aware: détecter si c'est une équipe (group) ou un site
            is_group = bool(history[-1].group_id is not None)
            if is_group:
                # Accéder au nom via la relationship group
                entity_name = getattr(history[-1].group, "name", f"Équipe {entity_id}") if history[-1].group else f"Équipe {entity_id}"
            else:
                # Accéder au nom via la relationship site
                entity_name = getattr(history[-1].site, "name", f"Site {entity_id}") if history[-1].site else f"Site {entity_id}"
            n = len(history)

            # ── Filtrer les snapshots sans données réelles ─────────────────
            # Un snapshot avec mr_rate_per_site IS NULL signifie qu'il n'y a
            # pas encore eu de collecte pour ce mois → on l'exclut des calculs
            # de tendance pour ne pas biaiser la moyenne avec des zéros artificiels.
            # On exclut aussi les snapshots où toutes les KPIs principales (MR rate,
            # approval rate, commit rate) sont à 0.0, ce qui correspond à une absence
            # d'activité enregistrée (ex: mois en cours non clôturé / sans collecte).
            # ✅ FIX: Utiliser total_mrs_created au lieu de mr_rate_per_site stocké
            def has_data(snap) -> bool:
                """Retourne True si le snapshot contient au moins une métrique KPI renseignée et non-nulle."""
                mr_rate = snap.total_mrs_created  # ✅ Utiliser total_mrs_created
                app_rate = snap.approved_mr_rate
                comm_rate = snap.commit_rate_per_site

                if mr_rate is None and app_rate is None and comm_rate is None:
                    return False

                mr_val = mr_rate or 0.0
                app_val = app_rate or 0.0
                comm_val = comm_rate or 0.0

                if mr_val == 0.0 and app_val == 0.0 and comm_val == 0.0:
                    return False

                return True

            history_with_data = [s for s in history if has_data(s)]
            latest_missing = bool(not has_data(history[-1]))  # Dernier mois sans données?

            # Si aucun snapshot n'a de données, passer ce site
            if not history_with_data:
                continue

            # ✅ FIX: Recalculer dynamiquement comme analytics_service pour cohérence
            # Utiliser total_mrs_created / nb_devs au lieu de mr_rate_per_site stocké
            vel_values = []
            for s in history_with_data:
                nb_devs = self.dev_repo.count_active_for_period(
                    self.db, self.project_id, s.period_id, s.site_id, s.group_id
                )
                vel = round(float(s.total_mrs_created or 0) / nb_devs, 2) if nb_devs > 0 else 0.0
                vel_values.append(vel)
            
            vel_trend     = self._compute_trend(vel_values)
            rev_trend     = self._compute_trend([s.avg_review_time_hours   or 0.0 for s in history_with_data])
            qual_trend    = self._compute_trend([s.approved_mr_rate        or 0.0 for s in history_with_data])
            commit_trend  = self._compute_trend([s.commit_rate_per_site    or 0.0 for s in history_with_data])

            # ── Valeur actuelle (dernier mois AVEC données) ───────────────
            latest = history_with_data[-1]
            
            # ✅ FIX: Recalculer dynamiquement comme analytics_service pour cohérence
            # Utiliser total_mrs_created / nb_devs au lieu de mr_rate_per_site stocké
            nb_devs = self.dev_repo.count_active_for_period(
                self.db, self.project_id, latest.period_id, latest.site_id, latest.group_id
            )
            current_velocity    = round(float(latest.total_mrs_created or 0) / nb_devs, 2) if nb_devs > 0 else 0.0
            current_review_time = latest.avg_review_time_hours or 0.0
            current_quality     = latest.approved_mr_rate      or 0.0

            # ── Alertes de tendance ────────────────────────────────────────
            alerts = self._detect_trend_alerts(
                entity_id, entity_name, history_with_data,
                vel_trend, rev_trend, qual_trend,
                latest_missing=latest_missing
            )
            all_alerts.extend(alerts)

            # ── Score de santé (0-100) ─────────────────────────────────────
            score = self._compute_health_score(
                current_velocity, current_review_time, current_quality,
                vel_trend, rev_trend, qual_trend
            )
            health_scores[entity_id] = score

            # ── Recommandations RH ─────────────────────────────────────────
            rh_recs = self._generate_rh_recommendations(
                entity_id, entity_name, score,
                latest, vel_trend, rev_trend, qual_trend, n,
                entity_type="group" if self.group_ids else "site"
            )
            rh_recommendations.extend(rh_recs)

            site_trends[entity_id] = {
                "site_name":      entity_name,
                "n_periods":      len(history_with_data),
                "latest_missing": latest_missing,  # True = dernier mois sans données
                "velocity_trend": vel_trend,
                "review_trend":   rev_trend,
                "quality_trend":  qual_trend,
                "commit_trend":   commit_trend,
                "health_score":   score,
                "alerts":         alerts,
            }

        # ── Recommandations inter-sites (best-practice sharing) ───────────
        bp_recs = self._detect_best_practice_sharing(site_trends, health_scores)
        rh_recommendations.extend(bp_recs)

        # Retourner "team_trends" si c'est une analyse d'équipes, sinon "site_trends"
        trends_key = "team_trends" if is_team_analysis else "site_trends"

        return {
            trends_key:           site_trends,
            "alerts":             all_alerts,
            "health_scores":      health_scores,
            "rh_recommendations": rh_recommendations,
            "summary":            self._global_summary(health_scores, all_alerts),
        }

    # ── Calcul de tendance ─────────────────────────────────────────────────────

    def _compute_trend(self, values: List[float]) -> Dict[str, Any]:
        """
        Retourne la direction et la force de la tendance sur la série.

        direction : "improving" | "declining" | "stable"
        consecutive_declining : int   (nb de mois consécutifs en déclin)
        delta_pct             : float (variation % entre premier et dernier)
        """
        if len(values) < 2:
            return {"direction": "stable", "consecutive_declining": 0, "delta_pct": 0.0}

        first, last = values[0], values[-1]
        delta_pct = ((last - first) / first * 100) if first != 0 else 0.0

        # Compter les décroissances consécutives (en partant de la fin)
        consecutive_declining = 0
        for i in range(len(values) - 1, 0, -1):
            if bool(values[i] < values[i - 1]):
                consecutive_declining += 1
            else:
                break

        if delta_pct <= -10:
            direction = "declining"
        elif delta_pct >= 10:
            direction = "improving"
        else:
            direction = "stable"

        return {
            "direction":             direction,
            "consecutive_declining": consecutive_declining,
            "delta_pct":             round(delta_pct, 1),
            "values":                [round(v, 2) for v in values],
        }

    # ── Alertes de tendance ────────────────────────────────────────────────────

    def _detect_trend_alerts(
        self,
        entity_id:   int,
        entity_name: str,
        history:   List[KpiSnapshot],
        vel_trend:  Dict,
        rev_trend:  Dict,
        qual_trend: Dict,
        latest_missing: bool = False,
    ) -> List[Dict]:
        """
        Détecte les alertes de tendance.
        
        latest_missing=True signifie que le dernier mois calendaire n'a pas
        encore de données collectée (ex: mois en cours pas encore clôturé).
        Dans ce cas, on ajoute une alerte informationnelle au lieu des alertes
        critiques qui seraient des faux positifs.
        """
        alerts = []

        # ── Alerte données manquantes (mois en cours non clôturé) ────────
        if latest_missing:
            alerts.append({
                "site_id":   entity_id,
                "site_name": entity_name,
                "metric":    "data",
                "type":      "missing_data",
                "severity":  "info",
                "detail":    (
                    f"Données non disponibles pour la période en cours. "
                    f"L'analyse est basée sur les {len(history)} période(s) précédente(s)."
                ),
            })
            # Avec données manquantes, on analyse seulement les tendances historiques
            # et on n'émet PAS d'alertes critical_low basées sur des valeurs à zéro.

        # Vélocité en déclin sur 2+ mois
        if vel_trend["consecutive_declining"] >= DECLINING_MIN_PERIODS:
            alerts.append({
                "site_id":   entity_id,
                "site_name": entity_name,
                "metric":    "velocity",
                "type":      "persistent_decline",
                "severity":  "high" if vel_trend["consecutive_declining"] >= 3 else "medium",
                "detail":    (
                    f"Vélocité en déclin depuis {vel_trend['consecutive_declining']} mois "
                    f"({vel_trend['delta_pct']:+.1f}%)"
                ),
            })

        # Temps de revue en hausse sur 2+ mois
        if rev_trend["consecutive_declining"] >= DECLINING_MIN_PERIODS:
            # Pour review_time, "déclin" des valeurs = amélioration
            # On cherche une HAUSSE → on inverse : dernier > avant-dernier
            vals = rev_trend["values"]
            consecutive_rising = 0
            for i in range(len(vals) - 1, 0, -1):
                if bool(vals[i] > vals[i - 1]):
                    consecutive_rising += 1
                else:
                    break
            if bool(consecutive_rising >= DECLINING_MIN_PERIODS):
                alerts.append({
                    "site_id":   entity_id,
                    "site_name": entity_name,
                    "metric":    "review_time",
                    "type":      "persistent_bottleneck",
                    "severity":  "high" if consecutive_rising >= 3 else "medium",
                    "detail":    (
                        f"Temps de revue en hausse depuis {consecutive_rising} mois "
                        f"({rev_trend['delta_pct']:+.1f}%)"
                    ),
                })

        # ── Alertes valeurs critiques (uniquement si données disponibles) ──
        # Si latest_missing=True, on skip ces alertes pour éviter les faux
        # positifs dus à des valeurs NULL interprétées comme zéro.
        if not latest_missing:
            latest = history[-1]
            if (latest.mr_rate_per_site or 0) < self.thresholds["velocity_low"]:
                alerts.append({
                    "site_id":   entity_id,
                    "site_name": entity_name,
                    "metric":    "velocity",
                    "type":      "critical_low",
                    "severity":  "high",
                    "detail":    f"Vélocité critique : {latest.mr_rate_per_site:.2f} MRs/dev (seuil: {self.thresholds['velocity_low']:.2f})",
                })

            if (latest.avg_review_time_hours or 0) > self.thresholds["review_time_high"]:
                alerts.append({
                    "site_id":   entity_id,
                    "site_name": entity_name,
                    "metric":    "review_time",
                    "type":      "critical_high",
                    "severity":  "high",
                    "detail":    f"Temps de revue critique : {latest.avg_review_time_hours:.1f}h (seuil: {self.thresholds['review_time_high']:.1f}h)",
                })

            if (latest.approved_mr_rate or 0) < self.thresholds["quality_low"]:
                alerts.append({
                    "site_id":   entity_id,
                    "site_name": entity_name,
                    "metric":    "quality",
                    "type":      "critical_low",
                    "severity":  "high",
                    "detail":    f"Qualité critique : {latest.approved_mr_rate*100:.1f}% d'approbation (seuil: {self.thresholds['quality_low']*100:.0f}%)",
                })

        return alerts

    # ── Score de santé ─────────────────────────────────────────────────────────

    def _compute_health_score(
        self,
        velocity:    float,
        review_time: float,
        quality:     float,
        vel_trend:   Dict,
        rev_trend:   Dict,
        qual_trend:  Dict,
    ) -> int:
        """
        Score de santé 0-100 basé sur les KPIs actuels + tendances.
        
        ✅ UNIFICATION : Utiliser la même formule que le frontend (Option 1)
        Formule : (Vélocité × 40%) + (Qualité × 40%) + (Revue × 20%)
        
        ✅ FIX: Détecter les données manquantes (tous les métriques à 0)
        Si toutes les métriques sont à 0, retourner None pour indiquer données insuffisantes
        """
        # ✅ FIX: Détecter si toutes les métriques sont à 0 (données manquantes)
        if velocity == 0 and review_time == 0 and quality == 0:
            return None  # Indiquer données insuffisantes
        
        # Normaliser la qualité si elle est en 0-1
        normalized_quality = quality * 100 if quality <= 1.0 else quality
        
        # Score de vélocité (40% du total) : 6.0 = 100%
        v_score = min(100, (velocity / 6.0) * 100)
        
        # Score de qualité (40% du total) : 100% = 100%
        q_score = normalized_quality
        
        # Score de revue (20% du total) : 0h = 100%, 72h = 0%
        r_score = max(0, 100 - (review_time / 72.0) * 100)
        
        # Score final (moyenne pondérée)
        final_score = (v_score * 0.4) + (q_score * 0.4) + (r_score * 0.2)
        
        return max(0, min(100, round(final_score)))

    # ── Recommandations RH ─────────────────────────────────────────────────────

    def _generate_rh_recommendations(
        self,
        entity_id:    int,
        entity_name:  str,
        score:      int,
        latest:     Any,
        vel_trend:  Dict,
        rev_trend:  Dict,
        qual_trend: Dict,
        n_periods:  int,
        entity_type: str = "site",  # "site" ou "group"
    ) -> List[Dict]:
        recs = []

        # Extraire les métriques actuelles
        velocity = latest.mr_rate_per_site or 0.0
        review_time = latest.avg_review_time_hours or 0.0
        quality = latest.approved_mr_rate or 0.0
        commit_rate = latest.commit_rate_per_site or 0.0
        merged_rate = latest.merged_mr_rate or 0.0

        # 1. Diagnostic de complexité (Commit Rate élevé vs MR Rate faible)
        # Permet de repérer les MR complexes nécessitant d'être divisées en sous-tâches.
        if commit_rate > 5.0 and velocity < 1.2:
            rec = {
                "category":  "Process · Organisation",
                "site_name": entity_name,
                "icon":      "ri-split-cells-vertical",
                "color":     "#f59e0b",
                "priority":  "moyenne",
                "message":   (
                    f"{entity_name} : Activité de commits élevée ({commit_rate:.1f}/dev) mais peu de MRs créées ({velocity:.1f}/dev). "
                    "Suggère des tickets trop complexes. Recommandation : Diviser les tâches en plus petits livrables."
                ),
            }
            # Ajouter site_id ou group_id selon le type d'entité
            if entity_type == "site":
                rec["site_id"] = entity_id
            elif entity_type == "group":
                rec["group_id"] = entity_id
            recs.append(rec)

        # 2. Diagnostic de blocage de livraison (Approbations élevées vs Fusions faibles)
        # Indique le taux de fusion par rapport aux approbations (code validé mais non intégré).
        if quality > 0.7 and merged_rate < 0.4:
            rec = {
                "category":  "Process · Livraison",
                "site_name": entity_name,
                "icon":      "ri-git-pull-request-line",
                "color":     "#ef4444",
                "priority":  "haute",
                "message":   (
                    f"{entity_name} : Taux d'approbation élevé ({quality*100:.0f}%) mais faible taux de fusion ({merged_rate*100:.0f}%). "
                    "Le code est validé mais n'est pas intégré. Recommandation : Inspecter le pipeline CI/CD ou les conflits de branches."
                ),
            }
            if entity_type == "site":
                rec["site_id"] = entity_id
            elif entity_type == "group":
                rec["group_id"] = entity_id
            recs.append(rec)

        # 3. Diagnostic de surcharge / goulot de relecture (Temps de relecture élevé)
        if review_time > self.thresholds["review_time_high"]:
            # Si direction == "improving" (hausse du temps de revue, c'est-à-dire dégradation pour l'utilisateur)
            is_getting_worse = rev_trend["direction"] == "improving"
            rec = {
                "category":  "Process · Revue",
                "site_name": entity_name,
                "icon":      "ri-time-line",
                "color":     "#ef4444" if is_getting_worse else "#f59e0b",
                "priority":  "haute" if is_getting_worse else "moyenne",
                "message":   (
                    f"{entity_name} : Temps de relecture élevé ({review_time:.1f}h). "
                    "Indique un goulot d'étranglement. Recommandation : Affecter temporairement des reviewers supplémentaires ou adopter des revues asynchrones."
                ),
            }
            if entity_type == "site":
                rec["site_id"] = entity_id
            elif entity_type == "group":
                rec["group_id"] = entity_id
            recs.append(rec)

        # 4. Diagnostic de qualité critique (Taux d'approbation faible)
        if quality < self.thresholds["quality_low"]:
            is_declining = qual_trend["direction"] == "declining"
            rec = {
                "category":  "RH · Formation / Mutation",
                "site_name": entity_name,
                "icon":      "ri-exchange-line",
                "color":     "#ef4444",
                "priority":  "haute" if is_declining else "moyenne",
                "message":   (
                    f"{entity_name} : Taux d'approbation critique ({quality*100:.1f}%) "
                    f"{'en dégradation' if is_declining else 'stable'}. "
                    "Identifier les profils en difficulté. Envisager formation ciblée ou renfort."
                ),
            }
            if entity_type == "site":
                rec["site_id"] = entity_id
            elif entity_type == "group":
                rec["group_id"] = entity_id
            recs.append(rec)

        # 5. Diagnostic de sous-effectif ou vélocité faible
        if velocity < self.thresholds["velocity_low"]:
            is_declining = vel_trend["direction"] == "declining"
            rec = {
                "category":  "RH · Recrutement",
                "site_name": entity_name,
                "icon":      "ri-user-add-line",
                "color":     "#ef4444" if is_declining else "#f59e0b",
                "priority":  "haute" if is_declining else "moyenne",
                "message":   (
                    f"{entity_name} : Vélocité faible ({velocity:.2f} MRs/dev) "
                    f"{'en déclin' if is_declining else 'stable'}. "
                    "Envisager un recrutement ou une redistribution de charge entre les sites."
                ),
            }
            if entity_type == "site":
                rec["site_id"] = entity_id
            elif entity_type == "group":
                rec["group_id"] = entity_id
            recs.append(rec)

        return recs

    # ── Partage de bonnes pratiques ────────────────────────────────────────────

    def _detect_best_practice_sharing(
        self,
        site_trends:   Dict[int, Dict],
        health_scores: Dict[int, int],
    ) -> List[Dict]:
        """Identifie les sites les plus performants et recommande le partage."""
        print(f"[DEBUG _detect_best_practice_sharing] self.site_ids={self.site_ids}, self.group_ids={self.group_ids}")
        print(f"[DEBUG _detect_best_practice_sharing] health_scores keys={list(health_scores.keys())}")
        print(f"[DEBUG _detect_best_practice_sharing] site_trends keys={list(site_trends.keys())}")
        
        # Filtrer par site_ids si fourni (pour site_manager multi-sites)
        if self.site_ids:
            print(f"[DEBUG _detect_best_practice_sharing] Filtering by site_ids={self.site_ids}")
            health_scores = {k: v for k, v in health_scores.items() if k in self.site_ids}
            site_trends = {k: v for k, v in site_trends.items() if k in self.site_ids}
            print(f"[DEBUG _detect_best_practice_sharing] After filtering: health_scores keys={list(health_scores.keys())}, site_trends keys={list(site_trends.keys())}")
        
        # Filtrer par group_ids si fourni (pour team_lead multi-équipes)
        if self.group_ids:
            print(f"[DEBUG _detect_best_practice_sharing] Filtering by group_ids={self.group_ids}")
            health_scores = {k: v for k, v in health_scores.items() if k in self.group_ids}
            site_trends = {k: v for k, v in site_trends.items() if k in self.group_ids}
            print(f"[DEBUG _detect_best_practice_sharing] After filtering: health_scores keys={list(health_scores.keys())}, site_trends keys={list(site_trends.keys())}")

        if len(health_scores) < 2:
            print(f"[DEBUG _detect_best_practice_sharing] Less than 2 sites, returning empty")
            return []

        sorted_sites = sorted(health_scores.items(), key=lambda x: x[1], reverse=True)
        best_site_id, best_score   = sorted_sites[0]
        worst_site_id, worst_score = sorted_sites[-1]

        if best_score - worst_score < 20:
            return []  # Écart insuffisant pour justifier une recommandation

        best_name  = site_trends[best_site_id]["site_name"]
        worst_name = site_trends[worst_site_id]["site_name"]

        print(f"[DEBUG _detect_best_practice_sharing] Best: {best_name} ({best_score}), Worst: {worst_name} ({worst_score})")

        return [{
            "category":  "Best Practice · Transfert",
            "site_name": f"{best_name} → {worst_name}",
            "icon":      "ri-share-forward-line",
            "color":     "#10b981",
            "priority":  "basse",
            "message":   (
                f"Écart de performance significatif : {best_name} (score {best_score}/100) "
                f"vs {worst_name} (score {worst_score}/100). "
                f"Organiser un partage de bonnes pratiques entre les deux sites."
            ),
        }]

    # ── Résumé global ─────────────────────────────────────────────────────────

    def _global_summary(self, health_scores: Dict[int, int], alerts: List[Dict]) -> str:
        if not health_scores:
            return "Données insuffisantes pour l'analyse multi-périodes."

        avg_score    = sum(health_scores.values()) / len(health_scores)
        high_alerts  = [a for a in alerts if a.get("severity") == "high"]
        critical_sites = [sid for sid, s in health_scores.items() if s < 40]

        if critical_sites:
            return (
                f"CRITIQUE : {len(critical_sites)} site(s) en situation critique "
                f"(score < 40). {len(high_alerts)} alerte(s) haute priorité. Action immédiate requise."
            )
        if high_alerts:
            return (
                f"ATTENTION : {len(high_alerts)} alerte(s) haute priorité détectée(s). "
                f"Score moyen inter-sites : {avg_score:.0f}/100."
            )
        if alerts:
            return (
                f"Surveillance recommandée : {len(alerts)} alerte(s) mineure(s). "
                f"Score moyen inter-sites : {avg_score:.0f}/100."
            )
        return f"Performance globale satisfaisante. Score moyen inter-sites : {avg_score:.0f}/100."
