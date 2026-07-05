# Import JSON Air-Gapped et Affichage Commits/MR

## 📋 Résumé Exécutif (Pour les Responsables)

### 🎯 Pourquoi cette fonctionnalité est importante

**Problème**: Comment importer des données GitLab (commits, MRs) sans accès réseau à GitLab (environnement air-gapped)?

**Solution**: Import JSON depuis fichiers locaux ou ZIP, avec auto-détection des périodes et mapping intelligent des développeurs.

**Bénéfices**:
- ✅ **Mode air-gapped**: Fonctionne sans connexion GitLab
- ✅ **Auto-détection période**: Détecte automatiquement le mois depuis created_at/authored_date
- ✅ **Mapping intelligent**: Résolution automatique des développeurs par username/email/id
- ✅ **Import ZIP**: Import en masse de multiples fichiers JSON
- ✅ **Affichage par mois**: CommitsPage et MergePage filtrent par période
- ✅ **Certification**: Les données importées sont certifiées et KPIs recalculés

### 🔍 Analogie Simple

Imaginez un système de backup:
- **Sans import JSON**: Impossible de restaurer les données sans accès GitLab
- **Avec import JSON**: On peut importer des fichiers JSON exportés manuellement et restaurer les données
- **Auto-détection**: Le système détecte automatiquement à quel mois appartient les données (comme trier des factures par date)

---

## 🔄 Architecture Import JSON Air-Gapped

```
┌─────────────────────────────────────────────────────────────────┐
│              UPLOAD JSON/ZIP (Frontend)                              │
│  - Admin sélectionne fichier JSON ou ZIP                          │
│  - Sélectionne projet et période (optionnel)                       │
│  - Sélectionne data_type (merge_requests | commits | both)       │
└──────────────────────┬──────────────────────────────────────────────┘
                       │ POST /extraction/upload-json
                       ↓
┌─────────────────────────────────────────────────────────────────┐
│              API Router extraction.py (upload_json_import)          │
│  - Vérifie format fichier (.json ou .zip)                         │
│  - Parse le contenu JSON                                         │
│  - Crée ExtractionLot coordinateur                                │
│  - Lance _background_json_import ou _background_zip_import       │
└──────────────────────┬──────────────────────────────────────────────┘
                       │ Background Task
                       ↓
┌─────────────────────────────────────────────────────────────────┐
│              Background Task (_background_json_import)              │
│  - Auto-détection période depuis created_at/authored_date          │
│  - Résolution développeur (uid, username, email)                  │
│  - Mapping GitLabMapper.map_merge_request / map_commit          │
│  - Crée ExtractionLot par (projet, période)                        │
│  - Certification des données (_certify_lot_mrs/_certify_lot_commits) │
│  - Recalcul KPIs (KpiAggregator.recalculate_period)                │
└──────────────────────┬──────────────────────────────────────────────┘
                       │ Données insérées en base
                       ↓
┌─────────────────────────────────────────────────────────────────┐
│              Base de Données (Tables)                                 │
│  - commit: Commits importés avec extraction_lot_id                │
│  - merge_request: MRs importées avec extraction_lot_id           │
│  - extraction_lot: Lots par (projet, période)                      │
│  - period: Périodes (année, mois)                                │
└──────────────────────┬──────────────────────────────────────────────┘
                       │ API GET /commits, /merge-requests
                       ↓
┌─────────────────────────────────────────────────────────────────┐
│              Frontend (CommitsPage.jsx / MergePage.jsx)            │
│  - Charge les commits/MRs depuis API                             │
│  - Filtre par période (mois civil)                                │
│  - Affiche avec graphiques et tableaux                            │
└─────────────────────────────────────────────────────────────────┘
```

---

## 🎯 ÉTAPE 1: Endpoint API Upload JSON

### Fichier: `src/backend/app/api/routers/extraction.py`

**Objectif**: Exposer l'endpoint pour upload JSON/ZIP

#### 1.1 upload_json_import (lignes 991-1159)
```python
@router.post("/upload-json", status_code=status.HTTP_202_ACCEPTED)
async def upload_json_import(
    background_tasks: BackgroundTasks,
    file:       UploadFile = File(...),
    project_id: Optional[int] = Form(None),
    period_id:  Optional[int] = Form(None),
    data_type:  str        = Form("merge_requests"),
    db:            Session  = Depends(get_db),
    current_admin: AppUser  = Depends(get_current_admin),
):
    """
    Importe des données GitLab (MRs ou commits) depuis un fichier JSON individuel
    ou une archive ZIP contenant les fichiers JSON de multiples développeurs.
    Compatible avec les environnements sans accès réseau GitLab.
    """
    filename_lower = (file.filename or "").lower()
    if not filename_lower.endswith((".json", ".zip")):
        raise HTTPException(status_code=400, detail="Le fichier doit être au format .json ou .zip")

    content = await file.read()
    if len(content) > 100 * 1024 * 1024:  # 100 Mo max
        raise HTTPException(status_code=400, detail="Fichier trop volumineux (max 100 Mo)")

    # ── COMPORTEMENT ZIP (IMPORTATION DE MASSE) ──────────────────────────────
    if filename_lower.endswith(".zip"):
        import zipfile
        import io
        try:
            with zipfile.ZipFile(io.BytesIO(content)) as z:
                json_files = [f for f in z.namelist() if f.lower().endswith(".json")]
        except Exception as e:
            raise HTTPException(status_code=400, detail=f"Fichier ZIP invalide ou corrompu : {e}")

        if not json_files:
            raise HTTPException(status_code=400, detail="L'archive ZIP ne contient aucun fichier .json")

        # Config GitLab par défaut
        from app.models.gitlab_config import GitLabConfig
        default_config = db.query(GitLabConfig).first()
        default_config_id = default_config.id if default_config else None

        now = datetime.now(timezone.utc)
        seed_period = None
        if period_id is not None:
            seed_period = period_repo.get_by_id(db, period_id)
        if not seed_period:
            seed_period = period_repo.get_or_create(db, now.year, now.month)

        # Création du lot coordinateur global
        lot = ExtractionLot(
            extraction_type  = ExtractionTypeEnum.MONTHLY,
            status           = ExtractionStatusEnum.running,
            period_id        = seed_period.id,
            project_id       = None,  # Multi-projets
            triggered_by     = current_admin.id,
            gitlab_config_id = default_config_id,
            current_action   = f"Import ZIP ({len(json_files)} fichiers)…",
            source_filename  = file.filename,
        )
        db.add(lot)
        db.commit()
        db.refresh(lot)

        _job_progress[lot.id] = {"step_index": 0, "step_label": "Démarrage de l'import ZIP de masse…"}

        background_tasks.add_task(
            _background_zip_import,
            lot_id            = lot.id,
            zip_bytes         = content,
            period_id         = period_id,
            data_type         = data_type,
            triggered_by_user = current_admin.id,
        )

        return {
            "lot_id":         lot.id,
            "status":         "running",
            "message":        f"Import ZIP démarré : {len(json_files)} fichiers JSON trouvés",
            "project_id":     0,
            "period_id":      period_id or 0,
            "auto_detect":    True,
            "extraction_type": "IMPORT_ZIP",
        }

    # ── COMPORTEMENT JSON (INDIVIDUEL RÉTROCOMPATIBLE) ──────────────────────────
    if not project_id or project_id == 0:
        raise HTTPException(status_code=400, detail="Veuillez sélectionner un projet pour l'import de fichier JSON individuel.")

    try:
        items = json.loads(content)
        if not isinstance(items, list):
            items = [items]
    except Exception as parse_err:
        raise HTTPException(status_code=400, detail=f"JSON invalide : {parse_err}")

    if not items:
        raise HTTPException(status_code=400, detail="Le fichier JSON est vide")

    if data_type not in ("merge_requests", "commits", "both"):
        raise HTTPException(status_code=400, detail="data_type invalide (merge_requests | commits | both)")

    project = project_repo.get_by_id(db, project_id)
    if not project:
        raise HTTPException(status_code=404, detail=f"Projet id={project_id} introuvable")

    if period_id is not None:
        period = period_repo.get_by_id(db, period_id)
        if not period:
            raise HTTPException(status_code=404, detail=f"Période id={period_id} introuvable")
        seed_period = period
    else:
        seed_period = None
        for item in items:
            date_str = item.get("created_at") or item.get("authored_date")
            if date_str:
                try:
                    dt = datetime.fromisoformat(str(date_str).replace("Z", "+00:00"))
                    seed_period = period_repo.get_or_create(db, dt.year, dt.month)
                    break
                except Exception:
                    pass
        if seed_period is None:
            raise HTTPException(
                status_code=400,
                detail="Impossible de détecter la période depuis les données. Veuillez sélectionner une période manuellement."
            )

    lot = ExtractionLot(
        extraction_type  = ExtractionTypeEnum.MONTHLY,
        status           = ExtractionStatusEnum.running,
        period_id        = seed_period.id,
        project_id       = project.id,
        triggered_by     = current_admin.id,
        gitlab_config_id = project.gitlab_config_id,
        current_action   = f"Import JSON ({len(items)} éléments)…",
        source_filename  = file.filename,
    )
    db.add(lot)
    db.commit()
    db.refresh(lot)

    _job_progress[lot.id] = {"step_index": 0, "step_label": "Démarrage de l'import JSON…"}

    background_tasks.add_task(
        _background_json_import,
        lot_id            = lot.id,
        project_id        = project.id,
        period_id         = period_id,
        data_type         = data_type,
        items             = items,
        triggered_by_user = current_admin.id,
    )

    return {
        "lot_id":         lot.id,
        "status":         "running",
        "message":        f"Import JSON démarré : {len(items)} éléments à traiter",
        "project_id":     project.id,
        "period_id":      period_id,
        "auto_detect":    period_id is None,
        "extraction_type": "IMPORT_JSON",
    }
```

**Logique**:
- **Vérification format**: Accepte .json ou .zip
- **Mode ZIP**: Import de masse avec _background_zip_import
- **Mode JSON**: Import individuel avec _background_json_import
- **Auto-détection période**: Si period_id=None, détecte depuis created_at/authored_date
- **Background task**: Lance le traitement en arrière-plan

---

## 🎯 ÉTAPE 2: Background Task Import JSON

### Fichier: `src/backend/app/api/routers/extraction.py`

**Objectif**: Traiter les données JSON et les insérer en base

#### 2.1 _background_json_import (lignes 250-617)
```python
async def _background_json_import(
    lot_id:             int,
    project_id:         int,
    period_id:          Optional[int],
    data_type:          str,
    items:              list,
    triggered_by_user:  int,
) -> None:
    """
    Traite un fichier JSON fourni manuellement (format GitLab API) et l'insère en base
    sans passer par le client GitLab. Compatible avec les environnements air-gapped.

    Si period_id est None, la période est auto-détectée depuis created_at / authored_date
    de chaque élément et un ExtractionLot est créé par mois détecté.
    """
    from app.database.session import SessionLocal
    from app.models.developer import Developer
    from app.models.commit import Commit
    from app.repositories.merge_request_repository import MergeRequestRepository
    from app.repositories.commit_repository import CommitRepository
    from app.repositories.developer_repository import DeveloperRepository
    from app.repositories.developer_project_repository import DeveloperProjectRepository
    from app.services.extraction.developer_identity import resolve_developer
    from app.services.gitlab.gitlab_mapper import GitLabMapper
    from app.services.kpi.kpi_aggregator import KpiAggregator
    from app.services.extraction.extraction_filters import build_period_window

    # ── helper : parse datetime ────────────────────────────────────────────────
    def _parse_dt(val):
        if not val:
            return None
        try:
            return datetime.fromisoformat(str(val).replace("Z", "+00:00"))
        except Exception:
            return None

    db = SessionLocal()
    _job_progress[lot_id] = {"step_index": 0, "step_label": "Initialisation de l'import JSON…"}

    try:
        lot     = db.query(ExtractionLot).filter(ExtractionLot.id == lot_id).first()
        project = project_repo.get_by_id(db, project_id)
        if not lot or not project:
            raise ValueError("Lot ou projet introuvable en base.")

        mr_repo_i      = MergeRequestRepository()
        commit_repo_i  = CommitRepository()
        dev_repo       = DeveloperRepository()
        dev_proj_repo  = DeveloperProjectRepository()

        # ── Pré-charger tous les développeurs actifs pour lookup rapide ──────
        all_devs   = db.query(Developer).filter(Developer.is_active == True).all()
        dev_by_uid   = {d.gitlab_user_id: d for d in all_devs if d.gitlab_user_id}
        dev_by_uname = {(d.gitlab_username or "").lower(): d for d in all_devs if d.gitlab_username}
        dev_by_email = {(d.email or "").lower(): d for d in all_devs if d.email}

        # ── Résolution des périodes et lots ───────────────────────────────────
        created_lot_ids = set()
        lot_for_period:    Dict[tuple, int] = {}
        period_id_for_ym:  Dict[tuple, int] = {}
        affected_period_ids: set             = set()

        _, _, lot_start, lot_end = build_period_window(lot.period)

        def _get_or_create_lot_for_ym(year: int, month: int) -> Optional[int]:
            """Trouve ou crée l'ExtractionLot (projet+période). Cache le résultat."""
            key = (year, month)
            if key in lot_for_period:
                return lot_for_period[key]

            # Période
            period_obj = period_repo.get_or_create(db, year, month)
            period_id_for_ym[key] = period_obj.id
            affected_period_ids.add(period_obj.id)

            # Si l'utilisateur a fourni un period_id fixe → tous les items vont dans ce lot
            if period_id is not None and period_obj.id != period_id:
                lot_for_period[key] = None   # sentinel = ignorer
                return None

            # ExtractionLot : chercher d'abord un lot existant pour ce projet+période
            existing_lot = (
                db.query(ExtractionLot)
                .filter(
                    ExtractionLot.project_id == project_id,
                    ExtractionLot.period_id  == period_obj.id,
                    ExtractionLot.status     == ExtractionStatusEnum.completed,
                )
                .order_by(ExtractionLot.id.desc())
                .first()
            )
            if existing_lot:
                target_lot_id = existing_lot.id
            else:
                # Réutiliser le lot coordinateur si c'est la première période
                if not lot_for_period:
                    lot.period_id = period_obj.id
                    db.add(lot); db.flush()
                    target_lot_id = lot.id
                else:
                    new_lot = ExtractionLot(
                        extraction_type  = ExtractionTypeEnum.MONTHLY,
                        status           = ExtractionStatusEnum.running,
                        period_id        = period_obj.id,
                        project_id       = project_id,
                        triggered_by     = triggered_by_user,
                        gitlab_config_id = project.gitlab_config_id,
                        current_action   = f"Import JSON — {year}/{month:02d}",
                    )
                    db.add(new_lot); db.flush()
                    target_lot_id = new_lot.id
                    created_lot_ids.add(new_lot.id)

            lot_for_period[key] = target_lot_id
            return target_lot_id
```

**Logique**:
- **Pré-chargement développeurs**: Charge tous les développeurs actifs pour lookup rapide (uid, username, email)
- **Résolution période**: Auto-détecte la période depuis created_at/authored_date
- **Création lots**: Crée un ExtractionLot par (projet, période) détectée
- **Cache**: Cache les lots pour éviter les requêtes répétées

#### 2.2 Import Merge Requests (lignes 374-464)
```python
        # ── Import Merge Requests ─────────────────────────────────────────────
        if data_type in ("merge_requests", "both"):
            _job_progress[lot_id] = {
                "step_index": 1,
                "step_label": f"Import des Merge Requests ({len(items)} éléments)…"
            }
            lot.current_action = _job_progress[lot_id]["step_label"]
            db.add(lot); db.flush()

            for mr_data in items:
                try:
                    # Ignorer les entrées sans iid (vraisemblablement des commits)
                    if not mr_data.get("iid"):
                        skipped_mr += 1
                        continue

                    # ── Auto-détection de la période depuis created_at ────────────────
                    mr_created = _parse_dt(mr_data.get("created_at"))
                    if not mr_created:
                        skipped_mr += 1
                        continue
                    item_lot_id = _get_or_create_lot_for_ym(mr_created.year, mr_created.month)
                    if item_lot_id is None:
                        # Filtré (période hors du filtre demandé)
                        skipped_mr += 1
                        continue

                    # ── Résolution développeur ───────────────────────────────────
                    author        = mr_data.get("author") or {}
                    author_uid    = author.get("id")
                    author_uname  = (author.get("username") or "").lower()
                    item_period_id = period_id_for_ym.get((mr_created.year, mr_created.month))

                    dev = (
                        dev_by_uid.get(author_uid)
                        or dev_by_uname.get(author_uname)
                        or resolve_developer(
                            db=db, project_id=project_id, period_id=item_period_id,
                            developer_repo=dev_repo, dev_project_repo=dev_proj_repo,
                            logger=logger,
                            email=author.get("email"), name=author.get("name"),
                            gitlab_id=author_uid, username=author.get("username"),
                            forbid_creation=True,
                        )
                    )

                    # Résolution reviewer
                    dev_reviewer = None
                    reviewers = mr_data.get("reviewers") or []
                    if reviewers:
                        r = reviewers[0]
                        dev_reviewer = (
                            dev_by_uid.get(r.get("id"))
                            or dev_by_uname.get((r.get("username") or "").lower())
                        )

                    # Résolution assignee
                    dev_assignee = None
                    assignee = mr_data.get("assignee") or {}
                    if assignee:
                        dev_assignee = (
                            dev_by_uid.get(assignee.get("id"))
                            or dev_by_uname.get((assignee.get("username") or "").lower())
                        )

                    mapped = GitLabMapper.map_merge_request(
                        data=mr_data,
                        project_id=project_id,
                        developer_id=dev.id if dev else None,
                        extraction_lot_id=item_lot_id,   # lot de la période détectée
                        reviewer_id=dev_reviewer.id if dev_reviewer else None,
                        approvals_data=mr_data.get("approvals_data"),
                    )
                    if dev_assignee:
                        mapped["assignee_id"] = dev_assignee.id

                    existing = mr_repo_i.get_by_gitlab_mr_id(db, mapped["gitlab_mr_id"], project_id)
                    if existing:
                        mr_repo_i.update(db, existing, mapped)
                        updated_mr += 1
                    else:
                        mr_repo_i.create(db, mapped)
                        created_mr += 1
                    db.flush()

                except Exception as exc:
                    logger.warning(f"[JSON Import] MR skip (iid={mr_data.get('iid')}): {exc}")
                    skipped_mr += 1

            db.commit()
            logger.info(f"[lot={lot_id}] MRs — created:{created_mr} updated:{updated_mr} skipped:{skipped_mr}")
```

**Logique**:
- **Auto-détection période**: Détecte le mois depuis created_at de chaque MR
- **Résolution développeur**: Cherche par uid, username, email
- **Résolution reviewer/assignee**: Cherche les reviewers et assignee
- **Mapping**: GitLabMapper.map_merge_request pour mapper les données GitLab
- **Création/Update**: Crée ou update la MR en base
- **extraction_lot_id**: Associe la MR au lot de la période détectée

#### 2.3 Import Commits (lignes 466-529)
```python
        # ── Import Commits ────────────────────────────────────────────────────
        if data_type in ("commits", "both"):
            _job_progress[lot_id] = {
                "step_index": 2,
                "step_label": f"Import des commits ({len(items)} éléments)…"
            }
            lot.current_action = _job_progress[lot_id]["step_label"]
            db.add(lot); db.flush()

            for c_data in items:
                try:
                    sha = c_data.get("id")
                    if not sha or len(sha) < 10:
                        skipped_commit += 1
                        continue

                    # Déduplication par SHA
                    if db.query(Commit).filter(
                        Commit.gitlab_commit_id == sha,
                        Commit.project_id == project_id
                    ).first():
                        skipped_commit += 1
                        continue

                    # Auto-détection de la période depuis authored_date
                    commit_dt = _parse_dt(c_data.get("authored_date") or c_data.get("committed_date"))
                    if not commit_dt:
                        skipped_commit += 1
                        continue
                    item_lot_id = _get_or_create_lot_for_ym(commit_dt.year, commit_dt.month)
                    if item_lot_id is None:
                        skipped_commit += 1
                        continue
                    item_period_id = period_id_for_ym.get((commit_dt.year, commit_dt.month))

                    author_email = (c_data.get("author_email") or "").lower()
                    author_name  = c_data.get("author_name") or ""
                    dev = (
                        dev_by_email.get(author_email)
                        or resolve_developer(
                            db=db, project_id=project_id, period_id=item_period_id,
                            developer_repo=dev_repo, dev_project_repo=dev_proj_repo,
                            logger=logger,
                            email=author_email, name=author_name,
                            forbid_creation=True,
                        )
                    )

                    mapped = GitLabMapper.map_commit(
                        data=c_data,
                        project_id=project_id,
                        developer_id=dev.id if dev else None,
                        extraction_lot_id=item_lot_id,   # lot de la période détectée
                    )
                    commit_repo_i.create(db, mapped)
                    created_commit += 1
                    db.flush()

                except Exception as exc:
                    logger.warning(f"[JSON Import] Commit skip (sha={c_data.get('id', '?')[:8]}): {exc}")
                    skipped_commit += 1

            db.commit()
            logger.info(f"[lot={lot_id}] Commits — created:{created_commit} skipped:{skipped_commit}")
```

**Logique**:
- **Auto-détection période**: Détecte le mois depuis authored_date de chaque commit
- **Déduplication**: Vérifie si le commit existe déjà par SHA
- **Résolution développeur**: Cherche par email, puis resolve_developer
- **Mapping**: GitLabMapper.map_commit pour mapper les données GitLab
- **Création**: Crée le commit en base
- **extraction_lot_id**: Associe le commit au lot de la période détectée

#### 2.4 Certification et KPI (lignes 531-593)
```python
        # ── Certification + KPI pour TOUTES les périodes touchées ───────────────────
        _job_progress[lot_id] = {"step_index": 3, "step_label": "Certification des données…"}
        service = ExtractionService()
        try:
            if data_type in ("merge_requests", "both"):
                service._certify_lot_mrs(db, lot, project, None, lot_start, lot_end)
            if data_type in ("commits", "both"):
                service._certify_lot_commits(db, lot, project, None, lot_start, lot_end)
        except Exception as cert_exc:
            logger.warning(f"[JSON Import] Certification partielle: {cert_exc}")

        detected_periods = sorted(affected_period_ids) if affected_period_ids else ([period_id] if period_id else [])
        nb_periods = len(detected_periods)

        _job_progress[lot_id] = {
            "step_index": 4,
            "step_label": f"Recalcul des KPIs pour {nb_periods} période(s)…"
        }
        lot.current_action = _job_progress[lot_id]["step_label"]
        db.add(lot); db.flush()

        aggregator = KpiAggregator(db)
        for pid in detected_periods:
            try:
                aggregator.recalculate_period(period_id=pid)
                logger.info(f"[lot={lot_id}] KPI recalculé pour period_id={pid}")
            except Exception as kpi_exc:
                logger.warning(f"[lot_id}] KPI échec period_id={pid}: {kpi_exc}")

        total_imported = created_mr + updated_mr + created_commit
        periods_label  = ", ".join(str(p) for p in detected_periods) if detected_periods else "?"
        lot.status        = ExtractionStatusEnum.completed
        lot.completed_at  = datetime.now(timezone.utc)
        lot.step_progress = 100
        lot.current_action = (
            f"Import JSON terminé ✓ — "
            f"{created_mr} MRs créées, {updated_mr} MJs, "
            f"{created_commit} commits, {skipped_mr + skipped_commit} ignorés — "
            f"{nb_periods} période(s)"
        )
        if created_lot_ids:
            db.query(ExtractionLot).filter(ExtractionLot.id.in_(created_lot_ids)).update({
                "status": ExtractionStatusEnum.completed,
                "completed_at": datetime.now(timezone.utc),
                "step_progress": 100,
                "current_action": "Import terminé ✓",
            }, synchronize_session=False)
        db.commit()

        _job_progress[lot_id] = {
            "step_index": 5,
            "step_label": (
                f"Import terminé ✓ ({total_imported} éléments / "
                f"{nb_periods} période(s) détectée(s))"
            ),
            "status": "completed",
            "lot_id": lot_id,
            "project_id": project_id,
            "period_id": period_id,
            "affected_periods": list(detected_periods),
            "extraction_type": "IMPORT_JSON",
        }
        logger.info(f"[lot={lot_id}] JSON import terminé — {total_imported} éléments, périodes={periods_label}.")
```

**Logique**:
- **Certification**: Certifie les MRs et commits importés
- **Recalcul KPI**: Recalcule les KPIs pour toutes les périodes détectées
- **Completion**: Marque le lot comme completed
- **Progress tracking**: Met à jour _job_progress pour le frontend

---

## 🎯 ÉTAPE 3: Background Task Import ZIP

### Fichier: `src/backend/app/api/routers/extraction.py`

**Objectif**: Traiter un fichier ZIP contenant multiples fichiers JSON

#### 3.1 _background_zip_import (lignes 624-900)
```python
async def _background_zip_import(
    lot_id:             int,
    zip_bytes:          bytes,
    period_id:          Optional[int],
    data_type:          str,
    triggered_by_user:  int,
) -> None:
    """
    Tâche d'arrière-plan pour importer un fichier ZIP de masse contenant les JSON
    individuels de multiples développeurs (ex: merge_requests_safa.json).
    Auto-résout le développeur et son projet associé à la volée.
    """
    import zipfile
    import io
    from app.database.session import SessionLocal
    from app.models.developer import Developer
    from app.models.commit import Commit
    from app.repositories.merge_request_repository import MergeRequestRepository
    from app.repositories.commit_repository import CommitRepository
    from app.repositories.developer_repository import DeveloperRepository
    from app.repositories.developer_project_repository import DeveloperProjectRepository
    from app.services.extraction.developer_identity import resolve_developer
    from app.services.gitlab.gitlab_mapper import GitLabMapper
    from app.services.kpi.kpi_aggregator import KpiAggregator
    from app.services.extraction.extraction_filters import build_period_window
    from app.models.developer_project import DeveloperProject

    def _parse_dt(val):
        if not val:
            return None
        try:
            return datetime.fromisoformat(str(val).replace("Z", "+00:00"))
        except Exception:
            return None

    db = SessionLocal()
    _job_progress[lot_id] = {"step_index": 0, "step_label": "Ouverture du fichier ZIP en mémoire…"}

    try:
        lot = db.query(ExtractionLot).filter(ExtractionLot.id == lot_id).first()
        if not lot:
            raise ValueError("Lot coordinateur introuvable en base.")

        with zipfile.ZipFile(io.BytesIO(zip_bytes)) as z:
            json_files = [f for f in z.namelist() if f.lower().endswith(".json")]

        if not json_files:
            raise ValueError("L'archive ZIP ne contient aucun fichier .json")

        total_files = len(json_files)
        _job_progress[lot_id] = {"step_index": 0, "step_label": f"Trouvé {total_files} fichiers JSON à importer…"}
        lot.current_action = f"Début de l'import ZIP ({total_files} fichiers)"
        db.add(lot); db.flush()

        mr_repo_i      = MergeRequestRepository()
        commit_repo_i  = CommitRepository()
        dev_repo       = DeveloperRepository()
        dev_proj_repo  = DeveloperProjectRepository()

        # Pré-charger tous les développeurs actifs pour lookup rapide
        all_devs   = db.query(Developer).filter(Developer.is_active == True).all()
        dev_by_uid   = {d.gitlab_user_id: d for d in all_devs if d.gitlab_user_id}
        dev_by_uname = {(d.gitlab_username or "").lower(): d for d in all_devs if d.gitlab_username}
        dev_by_email = {(d.email or "").lower(): for d in all_devs if d.email}

        created_lot_ids = set()
        lot_for_period:    Dict[tuple, int] = {}
        period_id_for_ym:  Dict[tuple, int] = {}
        affected_period_ids: set             = set()

        created_mr = updated_mr = skipped_mr = 0
        created_commit = skipped_commit = 0
        processed_files_count = 0

        with zipfile.ZipFile(io.BytesIO(zip_bytes)) as z:
            for file_idx, filename in enumerate(json_files):
                # Notification de progression
                pct = int((file_idx / total_files) * 100)
                lot.step_progress = pct
                lot.current_action = f"Lecture de {filename} ({file_idx+1}/{total_files})…"
                db.add(lot); db.flush()

                _job_progress[lot_id] = {
                    "step_index": 0,
                    "step_label": f"[{file_idx+1}/{total_files}] Lecture de {filename}…"
                }

                try:
                    content = z.read(filename)
                    items = json.loads(content)
                    if not isinstance(items, list):
                        items = [items]
                except Exception as parse_err:
                    logger.warning(f"[ZIP Import] Impossible de lire {filename} : {parse_err}")
                    continue

                if not items:
                    continue

                # ── Étape 1 : Résoudre le développeur pour ce fichier ─────────────────
                dev = None
                # Parcourir les items pour identifier l'auteur par username/email/id
                for item in items:
                    author = item.get("author") or {}
                    if author:
                        uid = author.get("id")
                        uname = (author.get("username") or "").lower()
                        email = (author.get("email") or "").lower()
                        dev = dev_by_uid.get(uid) or dev_by_uname.get(uname) or dev_by_email.get(email)
                        if dev:
                            break
                    
                    author_email = (item.get("author_email") or "").lower()
                    if author_email:
                        dev = dev_by_email.get(author_email)
                        if dev:
                            break

                if not dev:
                    # Tenter d'extraire depuis le nom du fichier s'il a un format type (merge_requests_safa.json)
                    filename_clean = filename.lower().replace("merge_requests_", "").replace("commits_", "").split(".")[0]
                    for d in all_devs:
                        if filename_clean in (d.gitlab_username or "").lower() or filename_clean in d.name.lower():
                            dev = d
                            break

                if not dev:
                    logger.warning(f"[ZIP Import] Impossible d'associer un développeur pour le fichier {filename}. Ignoré.")
                    continue

                # ── Étape 2 : Résoudre le projet de l'entreprise rattaché au dev ──────
                proj_assoc = (
                    db.query(DeveloperProject)
                    .filter(DeveloperProject.developer_id == dev.id, DeveloperProject.is_active == True)
                    .order_by(DeveloperProject.id.desc())
                    .first()
                )
                if not proj_assoc:
                    logger.warning(f"[ZIP Import] Le développeur {dev.name} n'est associé à aucun projet actif (REP, KPN...). Fichier {filename} ignoré.")
                    continue

                project_id = proj_assoc.project_id
                project = project_repo.get_by_id(db, project_id)
                if not project:
                    logger.warning(f"[ZIP Import] Projet ID={project_id} introuvable en base pour le développeur {dev.name}. Fichier {filename} ignoré.")
                    continue

                # ── Étape 3 : Traitement des données du fichier ───────────────────────
                def _get_or_create_lot_for_ym(year: int, month: int, current_project_id: int) -> Optional[int]:
                    key = (year, month, current_project_id)
                    if key in lot_for_period:
                        return lot_for_period[key]

                    period_obj = period_repo.get_or_create(db, year, month)
                    period_id_for_ym[(year, month)] = period_obj.id
                    affected_period_ids.add(period_obj.id)

                    if period_id is not None and period_obj.id != period_id:
                        lot_for_period[key] = None
                        return None

                    existing_lot = (
                        db.query(ExtractionLot)
                        .filter(
                            ExtractionLot.project_id == current_project_id,
                            ExtractionLot.period_id  == period_obj.id,
                            ExtractionLot.status     == ExtractionStatusEnum.completed,
                        )
                        .order_by(Extraction.id.desc())
                        .first()
                    )
                    if existing_lot:
                        target_lot_id = existing_lot.id
                    else:
                        # Toujours créer un sous-lot d'extraction spécifique pour ce projet et cette période.
                        new_lot = ExtractionLot(
                            extraction_type  = ExtractionTypeEnum.MONTHLY,
                            status           = ExtractionStatusEnum.running,
                            period_id        = period_obj.id,
                            project_id       = current_project_id,
                            triggered_by     = triggered_by_user,
                            gitlab_config_id = project.gitlab_config_id,
                            current_action   = f"Import ZIP ({filename}) — {year}/{month:02d}",
                            source_filename  = lot.source_filename,
                        )
                        db.add(new_lot); db.flush()
                        target_lot_id = new_lot.id
                        created_lot_ids.add(new_lot.id)

                    lot_for_period[key] = target_lot_id
                    return target_lot_id

                # Import des Merge Requests
                if data_type in ("merge_requests", "both"):
                    for mr_data in items:
                        try:
                            if not mr_data.get("iid"):
                                skipped_mr += 1
                                continue
                            mr_created = _parse_dt(mr_data.get("created_at"))
                            if not mr_created:
                                skipped_mr += 1
                                continue
                            item_lot_id = _get_or_create_lot_for_ym(mr_created.year, mr_created.month, project_id)
                            if item_lot_id is None:
                                skipped_mr += 1
                                continue

                            # Reviewers
                            dev_reviewer = None
                            reviewers = mr_data.get("reviewers") or []
                            if reviewers:
                                r = reviewers[0]
                                dev_reviewer = dev_by_uid.get(r.get("id")) or dev_by_uname.get((r.get("username") or "").lower())

                            # Assignee
                            dev_assignee = None
                            assignee = mr_data.get("assignee") or {}
                            if assignee:
                                dev_assignee = dev_by_uid.get(assignee.get("id")) or dev_by_uname.get((assignee.get("username") or "").lower())

                            mapped = GitLabMapper.map_merge_request(
                                data=mr_data,
                                project_id=project_id,
                                developer_id=dev.id,
                                extraction_lot_id=item_lot_id,
                                reviewer_id=dev_reviewer.id if dev_reviewer else None,
                                approvals_data=mr_data.get("approvals_data"),
                            )
                            if dev_assignee:
                                mapped["assignee_id"] = dev_assignee.id

                            existing = mr_repo_i.get_by_gitlab_mr_id(db, mapped["gitlab_mr_id"], project_id)
                            if existing:
                                mr_repo_i.update(db, existing, mapped)
                                updated_mr += 1
                            else:
                                mr_repo_i.create(db, mapped)
                                created_mr += 1
                            db.flush()
                        except Exception:
                            skipped_mr += 1

                # Import des Commits
                if data_type in ("commits", "both"):
                    for c_data in items:
                        try:
                            sha = c_data.get("id")
                            if not sha or len(sha) < 10:
                                skipped_commit += 1
                                continue

                            if db.query(Commit).filter(
                                Commit.gitlab_commit_id == sha,
                                Commit.project_id == project_id
                            ).first():
                                skipped_commit += 1
                                continue

                            commit_dt = _parse_dt(c_data.get("authored_date") or c_data.get("committed_date"))
                            if not commit_dt:
                                skipped_commit += 1
                                continue
                            item_lot_id = _get_or_create_lot_for_ym(commit_dt.year, commit_dt.month, project_id)
                            if item_lot_id is None:
                                skipped_commit += 1
                                continue

                            mapped = GitLabMapper.map_commit(
                                data=c_data,
                                project_id=project_id,
                                developer_id=dev.id,
                                extraction_lot_id=lot_id,
                            )
                            commit_repo_i.create(db, mapped)
                            created_commit += 1
                            db.flush()
                        except Exception:
                            skipped_commit += 1

                processed_files_count += 1
                db.commit()

        # Certification + KPI (similaire à _background_json_import)
        # ... (même logique que _background_json_import)
```

**Logique**:
- **Résolution développeur**: Cherche dans le fichier JSON, puis depuis le nom du fichier
- **Résolution projet**: Cherche le projet associé au développeur via DeveloperProject
- **Auto-détection période**: Détecte le mois depuis created_at/authored_date
- **Création lots**: Crée un sous-lot par (projet, période, fichier)
- **Progress tracking**: Met à jour la progression pour chaque fichier traité

---

## 🎯 ÉTAPE 4: Affichage CommitsPage

### Fichier: `src/frontend/src/pages/CommitsPage.jsx`

**Objectif**: Afficher les commits avec filtrage par période

#### 4.1 Chargement des commits (lignes 100-200)
```javascript
// ─── [NEW] Export CSV commits filtrés ─────────────────────────────────────────
function exportCommitsCSV(commits, projectName) {
  if (!commits?.length) return;
  const headers = ["ID", "SHA (court)", "Titre", "Auteur", "Site", "Additions", "Deletions", "Total Changes", "Date"];
  const rows    = commits.map((c) => [
    c.id,
    (c.gitlab_commit_id || "").slice(0, 8),
    `"${getCommitTitle(c).replace(/"/g, '""')}"`,
    getAuthor(c),
    getSite(c) || "",
    c.additions     || 0,
    c.deletions     || 0,
    c.total_changes || 0,
    formatDate(c.authored_date),
  ]);
  const csv  = [headers, ...rows].map((r) => r.join(";")).join("\n");
  const blob = new Blob(["\uFEFF" + csv], { type: "text/csv;charset=utf-8;" }); // BOM UTF-8 pour Excel
  const url  = URL.createObjectURL(blob);
  const a    = document.createElement("a");
  a.href     = url;
  a.download = `commits_${projectName || "project"}_${new Date().toISOString().slice(0, 10)}.csv`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url); // [FIX] libère la mémoire immédiatement
}
```

**Logique**:
- **Export CSV**: Exporte les commits filtrés en CSV avec BOM UTF-8 pour Excel
- **Helpers**: getAuthor, getSite, getCommitTitle pour extraire les données
- **Date formatting**: formatDate pour afficher la date en français

#### 4.2 Graphiques (lignes 117-214)
```javascript
// ─── Pie Chart — Commits par développeur ─────────────────────────────────────
function ContributorsPieChart({ commits, onMeta }) {
  const ref      = useRef(null);
  const chartRef = useRef(null);

  useEffect(() => {
    if (!ref.current || !commits?.length) return;
    if (chartRef.current) { chartRef.current.destroy(); chartRef.current = null; }

    const authorMap = {};
    commits.forEach((c) => { const a = getAuthor(c); authorMap[a] = (authorMap[a] || 0) + 1; });
    const all    = Object.entries(authorMap).sort((a, b) => b[1] - a[1]);
    const sorted = all.slice(0, TOP_PIE);
    // Remonte les métadonnées au parent pour affichage dans le header
    onMeta?.({ shown: sorted.length, total: all.length });

    const COLORS = [
      getCssVar("--vz-primary")   || "#405189",
      getCssVar("--vz-success")   || "#0ab39c",
      getCssVar("--vz-info")      || "#299cdb",
      getCssVar("--vz-warning")   || "#f7b84b",
      getCssVar("--vz-danger")    || "#f06548",
      getCssVar("--vz-secondary") || "#3577f1",
      "#6f42c1",
    ];

    chartRef.current = new Chart(ref.current, {
      type: "pie",
      data: {
        labels: sorted.map(([n]) => n),
        datasets: [{ data: sorted.map(([, v]) => v), backgroundColor: COLORS, hoverBorderColor: "#fff", borderWidth: 2 }],
      },
      options: {
        responsive: true, maintainAspectRatio: false,
        plugins: {
          legend: { position: "right", labels: { font: { family: "Poppins", size: 12 }, padding: 16, usePointStyle: true } },
          tooltip: { callbacks: { label: (ctx) => ` ${ctx.label}: ${ctx.raw} commits (${((ctx.raw / commits.length) * 100).toFixed(1)}%)` } },
        },
      },
    });
    return () => { if (chartRef.current) { chartRef.current.destroy(); chartRef.current = null; } };
  }, [commits, onMeta]);

  return <canvas ref={ref} style={{ maxHeight: 260 }} />;
}
```

**Logique**:
- **Pie Chart**: Affiche la distribution des commits par développeur
- **Top N**: Affiche uniquement les TOP_PIE développeurs pour lisibilité
- **Meta tracking**: Remonte les métadonnées (shown/total) pour affichage
- **Chart.js**: Utilise Chart.js pour le rendu des graphiques

#### 4.3 Filtre par période
```javascript
// Dans le composant principal CommitsPage
const [filters, setFilters] = useState({
  period: "all",  // Filtre par période
  project: "all",
  developerId: "all",
  search: "",
});

// Chargement des commits avec filtre par période
const loadCommits = useCallback(async () => {
  try {
    const params = {};
    if (filters.period !== "all") params.period_id = filters.period;
    if (filters.project !== "all") params.project_id = filters.project;
    if (filters.developerId !== "all") params.developer_id = filters.developerId;
    if (filters.search) params.search = filters.search;

    const response = await api.get(`/commits`, { params });
    setCommits(response.data || []);
  } catch (error) {
    console.error("Erreur lors du chargement des commits:", error);
  }
}, [filters]);
```

**Logique**:
- **Filtre par période**: Filtre les commits par period_id
- **Filtre par projet**: Filtre les commits par project_id
- **Filtre par développeur**: Filtre les commits par developer_id
- **Recherche**: Filtre par texte (titre, auteur, etc.)

---

## 🎯 ÉTAPE 5: Affichage MergePage

### Fichier: `src/frontend/src/pages/MergePage.jsx`

**Objectif**: Afficher les MRs avec filtrage par période

#### 5.1 Filtre par période (lignes 282-291)
```javascript
          {/* Période */}
          <div className="filter-item">
            <label className="filter-label"><i className="ri-calendar-check-line me-1 text-primary"></i>Période</label>
            <div className="filter-select-wrap">
              <select className="filter-select-premium" value={filters.period} onChange={e=>onChange("period",e.target.value)}>
                <option value="all">Toutes les périodes</option>
                {availablePeriods.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
              </select>
              <i className="ri-arrow-down-s-line filter-select-icon"></i>
            </div>
          </div>
```

**Logique**:
- **Sélecteur période**: Permet de sélectionner une période spécifique
- **availablePeriods**: Liste des périodes disponibles (ex: "2024-01", "2024-02")
- **Filtre "all"**: Affiche toutes les périodes

#### 5.2 Filtre par rôle (lignes 326-343)
```javascript
        {/* ─── Vue par Rôle ─────────────────────────────────────────────── */}
        <div className="d-flex align-items-center gap-2 mt-4 pt-3 flex-wrap" style={{borderTop:"1.5px solid #f1f5f9"}}>
          <span style={{fontSize:11,fontWeight:700,color:"#64748b",textTransform:"uppercase",letterSpacing:".08em",whiteSpace:"nowrap", display:"inline-flex",alignItems:"center",gap:6}}>
            <span className="p-1 rounded-circle bg-light d-inline-flex"><i className="ri-user-settings-line text-muted"></i></span> Rôle de contribution :
          </span>
          <div className="premium-segmented-control-small">
            {[
              {value:"all",      icon:"ri-apps-line",       label:"Tous les rôles"},
              {value:"authored", icon:"ri-quill-pen-line",   label:"Auteur"},
              {value:"reviewed", icon:"ri-eye-line",         label:"Reviewer"},
            ].map(r=>(
              <button key={r.value} onClick={()=>onChange("role",r.value)}
                className={`segmented-btn-small ${filters.role===r.value?"active":""}`}
              >
                <i className={`${r.icon} me-1`}></i>{r.label}
              </button>
            ))}
          </div>
        </div>
```

**Logique**:
- **Filtre par rôle**: Permet de filtrer par rôle (auteur, reviewer)
- **Segmented control**: Interface utilisateur premium pour le filtrage
- **Tous les rôles**: Affiche toutes les MRs
- **Auteur**: Affiche uniquement les MRs où l'utilisateur est auteur
- **Reviewer**: Affiche uniquement les MRs où l'utilisateur est reviewer

#### 5.3 Chargement des MRs avec filtre
```javascript
// Dans le composant principal MergePage
const [filters, setFilters] = useState({
  period: "all",
  project: "all",
  developerId: "all",
  role: "all",
  state: "all",
  search: "",
});

const loadMRs = useCallback(async () => {
  try {
    const params = {};
    if (filters.period !== "all") params.period_id = filters.period;
    if (filters.project !== "all") params.project_id = filters.project;
    if (filters.developerId !== "all") params.developer_id = filters.developerId;
    if (filters.role !== "all") params.role = filters.role;
    if (filters.state !== "all") params.state = filters.state;
    if (filters.search) params.search = filters.search;

    const response = await api.get("/merge-requests", { params });
    setMRs(response.data || []);
  } catch (error) {
    console.error("Erreur lors du chargement des MRs:", error);
  }
}, [filters]);
```

**Logique**:
- **Filtre par période**: Filtre les MRs par period_id
- **Filtre par rôle**: Filtre les MRs par rôle (auteur, reviewer)
- **Filtre par état**: Filtre les MRs par état (opened, merged, closed)
- **Recherche**: Filtre par texte (titre, développeur)

---

## 🎯 ÉTAPE 6: Fonctionnement Selon le Mois

### Auto-Détection de la Période

#### 6.1 Dans _background_json_import (lignes 390-398)
```python
                    # ── Auto-détection de la période depuis created_at ────────────────
                    mr_created = _parse_dt(mr_data.get("created_at"))
                    if not mr_created:
                        skipped_mr += 1
                        continue
                    item_lot_id = _get_or_create_lot_for_ym(mr_created.year, mr_created.month)
                    if item_lot_id is None:
                        # Filtré (période hors du filtre demandé)
                        skipped_mr += 1
                        continue
```

**Logique**:
- **Parse created_at**: Parse la date de création de la MR
- **Extraction year/month**: Extrait l'année et le mois depuis la date
- **Création lot**: Crée ou récupère le lot pour cette période
- **Filtrage**: Si period_id fourni, filtre les items hors période

#### 6.2 Dans _background_json_import (lignes 490-498)
```python
                    # Auto-détection de la période depuis authored_date
                    commit_dt = _parse_dt(c_data.get("authored_date") or c_data.get("committed_date"))
                    if not commit_dt:
                        skipped_commit += 1
                        continue
                    item_lot_id = _get_or_create_lot_for_ym(commit_dt.year, commit_dt.month)
                    if item_lot_id is None:
                        skipped_commit += 1
                        continue
```

**Logique**:
- **Parse authored_date**: Parse la date du commit (authored_date ou committed_date)
- **Extraction year/month**: Extrait l'année et le mois depuis la date
- **Création lot**: Crée ou récupère le lot pour cette période
- **Filtrage**: Si period_id fourni, filtre les items hors période

#### 6.3 Dans upload_json_import (lignes 1103-1116)
```python
    if period_id is not None:
        period = period_repo.get_by_id(db, period_id)
        if not period:
            raise HTTPException(status_code=404, detail=f"Période id={period_id} introuvable")
        seed_period = period
    else:
        seed_period = None
        for item in items:
            date_str = item.get("created_at") or item.get("authored_date")
            if date_str:
                try:
                    dt = datetime.fromisoformat(str(date_str).replace("Z", "+00:00"))
                    seed_period = period_repo.get_or_create(db, dt.year, dt.month)
                    break
                except Exception:
                    pass
        if seed_period is None:
            raise HTTPException(
                status_code=400,
                detail="Impossible de détecter la période depuis les données. Veuillez sélectionner une période manuellement."
            )
```

**Logique**:
- **Si period_id fourni**: Utilise la période spécifiée
- **Sinon**: Auto-détecte depuis created_at/authored_date des items
- **get_or_create**: Crée la période si elle n'existe pas
- **Erreur**: Si impossible de détecter, demande à l'utilisateur de sélectionner une période

---

## 🎯 ÉTAPE 7: Certification et Recalcul KPI

### Fichier: `src/backend/app/api/routers/extraction.py`

**Objectif**: Certifier les données importées et recalculer les KPIs

#### 7.1 Certification (lignes 531-540)
```python
        # ── Certification + KPI pour TOUTES les périodes touchées ───────────────────
        _job_progress[lot_id] = {"step_index": 3, "step_label": "Certification des données…"}
        service = ExtractionService()
        try:
            if data_type in ("merge_requests", "both"):
                service._certify_lot_mrs(db, lot, project, None, lot_start, lot_end)
            if data_type in ("commits", "both"):
                service._certify_lot_commits(db, lot, project, None, lot_start, lot_end)
        except Exception as cert_exc:
            logger.warning(f"[JSON Import] Certification partielle: {cert_exc}")
```

**Logique**:
- **Certification MR**: Certifie les MRs importées (vérifie la cohérence)
- **Certification Commit**: Certifie les commits importés
- **ExtractionService**: Utilise le service d'extraction pour la certification

#### 7.2 Recalcul KPI (lignes 552-558)
```python
        aggregator = KpiAggregator(db)
        for pid in detected_periods:
            try:
                aggregator.recalculate_period(period_id=pid)
                logger.info(f"[lot={lot_id}] KPI recalculé pour period_id={pid}")
            except Exception as kpi_exc:
                logger.warning(f"[lot_id}] KPI échec period_id={pid}: {kpi_exc}")
```

**Logique**:
- **KpiAggregator**: Utilise l'agrégateur KPI pour recalculer
- **Pour chaque période détectée**: Recalcule les KPIs pour toutes les périodes touchées
- **Recalcul complet**: Recalcule les KPIs pour les sites, groupes, développeurs

---

## 🎯 ÉTAPE 8: Scénario Concret - Import JSON Air-Gapped

### Contexte
- Environnement air-gapped (pas d'accès GitLab)
- Export manuel des données GitLab en JSON depuis un autre système
- Import des données JSON dans le dashboard

**Processus**:

#### 1. Export GitLab
```bash
# Export des MRs d'un projet GitLab
curl --header "PRIVATE-TOKEN: <token>" \
  "https://gitlab.example.com/api/v4/projects/1/merge_requests?state=all&per_page=100" \
  > merge_requests_january_2024.json

# Export des commits d'un projet GitLab
curl --header "PRIVATE-TOKEN: <token>" \
  "https://gitlab.example.com/api/v4/projects/1/repository/commits?since=2024-01-01&until=2024-01-31" \
  > commits_january_2024.json
```

#### 2. Upload JSON dans le dashboard
```javascript
// Frontend: Upload du fichier JSON
POST /extraction/upload-json
FormData:
  file: merge_requests_january_2024.json
  project_id: 1
  period_id: null  // Auto-détection
  data_type: merge_requests
```

#### 3. Traitement backend
```python
# Backend: Auto-détection de la période
# created_at: "2024-01-15T10:30:00Z"
# → year=2024, month=1
# → period_id = period_repo.get_or_create(db, 2024, 1)

# Création du lot
lot = ExtractionLot(
    extraction_type=ExtractionTypeEnum.MONTHLY,
    status=ExtractionStatusEnum.running,
    period_id=period_id,
    project_id=1,
    triggered_by=current_admin.id,
    current_action="Import JSON (50 éléments)…",
)

# Import des MRs
for mr_data in items:
    mr_created = parse_dt(mr_data.get("created_at"))  # 2024-01-15
    item_lot_id = get_or_create_lot_for_ym(2024, 1)  # lot pour janvier 2024
    
    dev = resolve_developer(
        db=db, project_id=1, period_id=period_id,
        email=author.get("email"), name=author.get("name"),
        gitlab_id=author.get("id"), username=author.get("username"),
        forbid_creation=True,
    )
    
    mapped = GitLabMapper.map_merge_request(
        data=mr_data,
        project_id=1,
        developer_id=dev.id,
        extraction_lot_id=item_lot_id,
        reviewer_id=dev_reviewer.id if dev_reviewer else None,
    )
    
    mr_repo.create(db, mapped)

# Certification
service._certify_lot_mrs(db, lot, project, None, lot_start, lot_end)

# Recalcul KPI
aggregator.recalculate_period(period_id=period_id)
```

#### 4. Résultat
```python
{
    "lot_id": 123,
    "status": "completed",
    "message": "Import JSON terminé : 50 éléments à traiter",
    "project_id": 1,
    "period_id": 45,  # Période janvier 2024
    "auto_detect": true,
    "extraction_type": "IMPORT_JSON",
}
```

---

## 🎓 Points Clés pour la Soutenance

### 1. Architecture Air-Gapped
- **Mode hors-ligne**: Fonctionne sans accès réseau GitLab
- **Import JSON/ZIP**: Accepte les fichiers JSON individuels ou ZIP
- **Auto-détection**: Détecte automatiquement la période depuis les dates

### 2. Auto-Détection de la Période
- **Depuis created_at**: Pour les MRs (created_at)
- **Depuis authored_date**: Pour les commits (authored_date ou committed_date)
- **Création automatique**: Crée la période si elle n'existe pas
- **Filtrage optionnel**: Si period_id fourni, filtre les items hors période

### 3. Mapping Intelligent des Développeurs
- **3 méthodes**: uid, username, email
- **resolve_developer**: Résolution intelligente avec SCD Type 2
- **forbid_creation**: Ne crée pas de développeur, seulement résolution
- **Pré-chargement**: Charge tous les développeurs actifs pour lookup rapide

### 4. Certification et Recalcul KPI
- **Certification**: Vérifie la cohérence des données importées
- **Recalcul KPI**: Recalcule les KPIs pour toutes les périodes touchées
- **KpiAggregator**: Utilise l'agrégateur KPI pour le recalcul
- **Périodes multiples**: Recalcule pour toutes les périodes détectées dans le fichier

### 5. Affichage par Mois
- **CommitsPage**: Filtre les commits par period_id
- **MergePage**: Filtre les MRs par period_id
- **Sélecteur période**: Permet de sélectionner une période spécifique
- **Graphiques**: Affiche les données avec Chart.js
- **Export CSV**: Exporte les données filtrées en CSV

---

## 🚀 Conclusion

Le système d'import JSON air-gapped est basé sur:

1. **Mode air-gapped**: Fonctionne sans accès réseau GitLab via import JSON/ZIP
2. **Auto-détection période**: Détecte automatiquement le mois depuis created_at/authored_date
3. **Mapping intelligent**: Résolution automatique des développeurs par uid/username/email
4. **Certification**: Certifie les données importées et recalcul les KPIs
5. **Affichage par mois**: CommitsPage et MergePage filtrent par période

Chaque commit/MR importé est associé à un ExtractionLot spécifique (projet, période), ce qui permet un filtrage précis par mois dans les pages frontend.
