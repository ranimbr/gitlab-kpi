"""
services/admin/developer_service.py — v5 Enterprise-grade

MODIFICATIONS v5 :
──────────────────────────────────────────────────────────────────
AJOUT gestion complète de la colonne "group" du CSV :
    Avant v5 : la colonne "group" était ignorée silencieusement.
               Seul default_group_id était utilisé.
    v5        : lookup du groupe par nom (case-insensitive).
               Si introuvable → create_missing_groups ou warning.

AJOUT create_missing_groups (bool) :
    Si True  → DeveloperGroupRepository.create_from_import() appelé.
    Si False → nom inconnu ajouté à unknown_groups_names (retourné
               dans la réponse pour action UI).

AJOUT tracking unknown_groups / created_groups :
    Même logique que unknown_sites / unknown_projects.

Toutes les corrections v4 conservées.
"""
import csv
import io
import logging
from typing import List, Optional, Set, Dict

from fastapi import HTTPException, status
from sqlalchemy.orm import Session

from app.models.developer import Developer
from app.models.developer_import_log import ImportStatusEnum
from app.repositories.audit_log_repository import AuditLogRepository
from app.repositories.developer_import_log_repository import DeveloperImportLogRepository
from app.repositories.developer_project_repository import DeveloperProjectRepository
from app.repositories.developer_repository import DeveloperRepository, DeveloperGroupRepository
from app.repositories.developer_site_repository import DeveloperSiteRepository
from app.repositories.site_repository import SiteRepository
from app.repositories.project_repository import ProjectRepository
from app.schemas.developer import DeveloperCreate, DeveloperUpdate, DeveloperValidate

logger = logging.getLogger(__name__)

REQUIRED_COLUMNS = {"name", "email", "gitlab_username"}


class DeveloperService:

    def __init__(self):
        self.dev_repo        = DeveloperRepository()
        self.dev_proj_repo   = DeveloperProjectRepository()
        self.dev_site_repo   = DeveloperSiteRepository()
        self.import_log_repo = DeveloperImportLogRepository()
        self.site_repo       = SiteRepository()
        self.project_repo    = ProjectRepository()
        self.group_repo      = DeveloperGroupRepository()
        self.audit_repo      = AuditLogRepository()

    # =========================================================================
    # CRÉATION MANUELLE
    # =========================================================================

    def create_developer(
        self,
        db:         Session,
        payload:    DeveloperCreate,
        created_by: Optional[int] = None,
        ip_address: Optional[str] = None,
    ) -> Developer:
        # ✅ LOGIQUE SENIOR : Upsert interactif
        # Si le développeur existe déjà (email ou username), on le met à jour
        # au lieu de retourner une erreur 409. Cela permet de "ré-affecter" 
        # un développeur existant via le modal d'ajout.
        existing = None
        if payload.email:
            existing = self.dev_repo.get_by_email(db, payload.email)
        
        if not existing and payload.gitlab_username:
            existing = self.dev_repo.get_by_gitlab_username(db, payload.gitlab_username)

        if existing:
            logger.info("create_developer: Doublon détecté (%s), passage en mode UPDATE (Upsert)", existing.email or existing.gitlab_username)
            from app.schemas.developer import DeveloperUpdate
            # Conversion du payload Create en Update
            update_payload = DeveloperUpdate(**payload.model_dump(exclude_unset=True))
            return self.update_developer(
                db=db, developer_id=existing.id, payload=update_payload,
                updated_by=created_by, ip_address=ip_address
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
            "auto_created":    False,
            "source":          "manual",
            "created_by":      created_by,
        }

        developer = self.dev_repo.create(db, dev_data, group_ids=payload.group_ids)
        db.flush()

        for site_assoc in payload.sites:
            self.dev_site_repo.add(db, developer.id, site_assoc.site_id, site_assoc.is_primary)
        for proj_assoc in payload.projects:
            self.dev_proj_repo.add(db, developer.id, proj_assoc.project_id)

        self.audit_repo.log(
            db=db, user_id=created_by, action="CREATE_DEVELOPER",
            entity_type="Developer", entity_id=developer.id,
            new_value={"name": developer.name, "email": developer.email, "source": "manual"},
            ip_address=ip_address,
        )

        db.commit()
        db.refresh(developer)
        return developer

    # =========================================================================
    # VALIDATION ADMIN
    # =========================================================================

    def validate_developer(
        self,
        db:           Session,
        developer_id: int,
        payload:      DeveloperValidate,
        validated_by: Optional[int] = None,
        ip_address:   Optional[str] = None,
    ) -> Developer:
        developer = self.dev_repo.get_by_id(db, developer_id)
        if not developer:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Développeur introuvable.")

        old_value  = {"is_validated": developer.is_validated, "is_bot": developer.is_bot}
        update_data = {"is_validated": payload.is_validated}
        if payload.is_bot     is not None: update_data["is_bot"]     = payload.is_bot

        self.dev_repo.update(db, developer, update_data)
        
        if payload.group_ids is not None:
            self.dev_repo.sync_groups(db, developer, payload.group_ids)

        if payload.sites is not None:
            self.dev_site_repo.sync(
                db, developer_id,
                [{"site_id": s.site_id, "is_primary": s.is_primary} for s in payload.sites],
            )
        if payload.projects is not None:
            self.dev_proj_repo.sync(db, developer_id, [p.project_id for p in payload.projects])

        self.audit_repo.log(
            db=db, user_id=validated_by, action="UPDATE_DEVELOPER",
            entity_type="Developer", entity_id=developer_id,
            old_value=old_value,
            new_value={"is_validated": payload.is_validated, "is_bot": payload.is_bot},
            ip_address=ip_address,
        )
        db.commit()
        db.refresh(developer)
        return developer

    # =========================================================================
    # MISE À JOUR
    # =========================================================================

    def update_developer(
        self,
        db:           Session,
        developer_id: int,
        payload:      DeveloperUpdate,
        updated_by:   Optional[int] = None,
        ip_address:   Optional[str] = None,
    ) -> Developer:
        developer = self.dev_repo.get_by_id(db, developer_id)
        if not developer:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Développeur introuvable.")

        update_data = payload.model_dump(exclude_unset=True, exclude={"sites", "projects", "group_ids"})
        if update_data:
            self.dev_repo.update(db, developer, update_data)
        
        if payload.group_ids is not None:
            self.dev_repo.sync_groups(db, developer, payload.group_ids)
        if payload.sites is not None:
            self.dev_site_repo.sync(
                db, developer_id,
                [{"site_id": s.site_id, "is_primary": s.is_primary} for s in payload.sites],
            )
        if payload.projects is not None:
            self.dev_proj_repo.sync(db, developer_id, [p.project_id for p in payload.projects])

        self.audit_repo.log(
            db=db, user_id=updated_by, action="UPDATE_DEVELOPER",
            entity_type="Developer", entity_id=developer_id,
            new_value=update_data, ip_address=ip_address,
        )
        db.commit()
        db.refresh(developer)
        return developer

    # =========================================================================
    # FUSION DE DOUBLONS (MERGE)
    # =========================================================================

    def merge_developers(
        self,
        db: Session,
        canonical_id: int,
        duplicate_id: int,
        merged_by: Optional[int] = None,
        ip_address: Optional[str] = None,
    ) -> Developer:
        """
        Fusionne le profil doublon dans le profil principal.
        Transfère les Commits, MergeRequests et KpiSnapshots pour éviter la perte de données.
        """
        from app.models.commit import Commit
        from app.models.merge_request import MergeRequest
        from app.models.kpi_snapshot import KpiSnapshot
        from fastapi import HTTPException, status

        if canonical_id == duplicate_id:
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Impossible de fusionner un profil avec lui-même.")

        canonical = self.dev_repo.get_by_id(db, canonical_id)
        duplicate = self.dev_repo.get_by_id(db, duplicate_id)

        if not canonical:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Profil principal introuvable.")
        if not duplicate:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Profil doublon introuvable.")

        try:
            # 1. Transfert des Commits
            db.query(Commit).filter(Commit.developer_id == duplicate_id).update(
                {"developer_id": canonical_id}, synchronize_session=False
            )

            # 2. Transfert des Merge Requests (Auteur et Reviewer)
            db.query(MergeRequest).filter(MergeRequest.developer_id == duplicate_id).update(
                {"developer_id": canonical_id}, synchronize_session=False
            )
            db.query(MergeRequest).filter(MergeRequest.reviewer_id == duplicate_id).update(
                {"reviewer_id": canonical_id}, synchronize_session=False
            )
            
            # 2.1 Transfert des CommitMergeRequest et Alert
            from app.models.commit_merge_request import CommitMergeRequest
            from app.models.alert import Alert
            
            db.query(CommitMergeRequest).filter(CommitMergeRequest.developer_id == duplicate_id).update(
                {"developer_id": canonical_id}, synchronize_session=False
            )
            db.query(Alert).filter(Alert.developer_id == duplicate_id).update(
                {"developer_id": canonical_id}, synchronize_session=False
            )

            # 3. Transfert des KpiSnapshots (Gestion des conflits d'Index Unique)
            dup_snapshots = db.query(KpiSnapshot).filter(KpiSnapshot.developer_id == duplicate_id).all()
            for ds in dup_snapshots:
                existing = db.query(KpiSnapshot).filter(
                    KpiSnapshot.project_id == ds.project_id,
                    KpiSnapshot.period_id == ds.period_id,
                    KpiSnapshot.developer_id == canonical_id
                ).first()
                if existing:
                    # Le canonical a déjà un snapshot pour ce projet/période. On gère la collision.
                    existing.total_commits += ds.total_commits
                    existing.total_mrs_created += ds.total_mrs_created
                    existing.total_mrs_approved += ds.total_mrs_approved
                    existing.total_mrs_merged += ds.total_mrs_merged
                    existing.review_time_hours += ds.review_time_hours
                    existing.nb_commits_per_project += ds.nb_commits_per_project
                    db.delete(ds)
                else:
                    ds.developer_id = canonical_id

            # 4. Transfert des affectations Sites et Projets
            dup_sites = self.dev_site_repo.get_by_developer(db, duplicate_id)
            for ds in dup_sites:
                if not self.dev_site_repo.exists(db, canonical_id, ds.site_id):
                    self.dev_site_repo.add(db, canonical_id, ds.site_id, is_primary=False)
                db.delete(ds) # Suppression de l'ancienne liaison

            dup_projs = self.dev_proj_repo.get_by_developer(db, duplicate_id)
            for dp in dup_projs:
                if not self.dev_proj_repo.exists(db, canonical_id, dp.project_id):
                    self.dev_proj_repo.add(db, canonical_id, dp.project_id)
                db.delete(dp)

            # 5. Audit Log
            self.audit_repo.log(
                db=db, user_id=merged_by, action="MERGE_DEVELOPER",
                entity_type="Developer", entity_id=canonical_id,
                old_value={"duplicate_id_merged": duplicate_id, "duplicate_email": duplicate.email},
                new_value={"status": "merged"}, ip_address=ip_address,
            )

            # 6. Suppression finale du profil doublon
            db.delete(duplicate)
            db.commit()

            db.refresh(canonical)
            return canonical

        except Exception as e:
            db.rollback()
            logger.error("Erreur fusion devs %s -> %s: %s", duplicate_id, canonical_id, str(e))
            raise HTTPException(
                status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
                detail="Erreur interne lors de la fusion. Les données n'ont pas été modifiées."
            )

    # =========================================================================
    # IMPORT CSV / EXCEL — Enterprise v5
    # =========================================================================

    def import_from_file(
        self,
        db:                      Session,
        file_content:            bytes,
        file_name:               str,
        imported_by:             Optional[int] = None,
        default_site_id:         Optional[int] = None,
        default_group_id:        Optional[int] = None,
        default_gitlab_config_id: Optional[int] = None,
        dry_run:                 bool = False,
        create_missing_sites:    bool = False,
        create_missing_projects: bool = False,
        create_missing_groups:   bool = False,
    ) -> dict:
        """
        Import enterprise complet.

        Gestion des 3 types d'entités manquantes :
            Sites    → create_missing_sites    / unknown_sites    / created_sites
            Projets  → create_missing_projects / unknown_projects / created_projects
            Groupes  → create_missing_groups   / unknown_groups   / created_groups

        La colonne "group" du CSV est résolue par nom (case-insensitive).
        Si le groupe n'est pas trouvé :
            create_missing_groups=True  → groupe créé automatiquement
            create_missing_groups=False → warning non bloquant, dev créé sans groupe
        """
        file_type = "xlsx" if file_name.lower().endswith((".xlsx", ".xls")) else "csv"

        import_log = self.import_log_repo.create_log(
            db, file_name=file_name, imported_by=imported_by, file_type=file_type
        )
        db.flush()

        try:
            rows = self._parse_file(file_content, file_type)
        except HTTPException:
            raise
        except Exception as e:
            self.import_log_repo.fail(db, import_log, str(e))
            db.commit()
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=f"Erreur de lecture du fichier : {e}",
            )

        # ── Pré-chargement O(1) des référentiels ────────────────────────────
        all_sites    = {s.name.lower().strip(): s for s in self.site_repo.get_all(db)}
        all_groups   = {g.name.lower().strip(): g for g in self.group_repo.get_all(db)}
        
        logger.info("Import: %d sites et %d groupes chargés en cache.", len(all_sites), len(all_groups))
        
        # Projets : double indexation (Nom et ID GitLab)
        _projects_all = self.project_repo.get_all(db, active_only=False)
        all_projects_by_name = {p.name.lower(): p for p in _projects_all}
        all_projects_by_id   = {p.gitlab_project_id: p for p in _projects_all if p.gitlab_project_id}

        # ── Collecteurs ───────────────────────────────────────────────────────
        success_list   : List[dict] = []
        error_list     : List[dict] = []
        duplicate_list : List[dict] = []

        unknown_sites_names    : Set[str] = set()
        unknown_projects_data  : Dict[str, Optional[int]] = {}
        unknown_groups_names   : Set[str] = set()
        created_sites_names    : Set[str] = set()
        created_projects_names : Set[str] = set()
        created_groups_names   : Set[str] = set()

        for row_num, row in enumerate(rows, start=2):
            # ✅ DIAGNOSTIC SENIOR : On log les clés une seule fois
            if row_num == 2:
                logger.info("Import DEBUG: Clés détectées dans le CSV: %s", list(row.keys()))

            # ✅ LOGIQUE RESILIENTE (Senior) : On cherche avec une tolérance maximale
            def get_val(keys):
                keys_lower = [k.lower().strip() for k in keys]
                for row_k, val in row.items():
                    rk_clean = str(row_k).lower().strip()
                    if rk_clean in keys_lower:
                        return (str(val) or "").strip()
                return ""

            name     = get_val(["name", "nom", "full_name"])
            email    = get_val(["email", "mail", "courriel"]).lower()
            username = get_val(["gitlab_username", "username", "identifiant", "user"])
            
            # Détection flexible de la colonne Groupe
            group_csv_raw = get_val(["group", "groups", "groupe", "groupes", "equipe", "équipe", "team"])

            # ── Validation champs obligatoires ────────────────────────────────
            if not name or not email or not username:
                logger.warning("Import Ligne %d: Champs manquants (Nom=%s, Email=%s, User=%s)", row_num, name, email, username)
                error_list.append({
                    "row": row_num, "status": "error",
                    "name": name or None, "email": email or None,
                    "reason": "Champs obligatoires manquants (name, email, gitlab_username)",
                })
                continue

            logger.info("Import Ligne %d: Analyse dev %s (%s) | Groupe CSV: '%s'", row_num, name, username, group_csv_raw)

            # ── Détection Existant (UPSERT) ───────────────────────────────────
            existing_dev = None
            if self.dev_repo.get_by_email(db, email):
                existing_dev = self.dev_repo.get_by_email(db, email)
            elif self.dev_repo.get_by_gitlab_username(db, username):
                existing_dev = self.dev_repo.get_by_gitlab_username(db, username)

            if dry_run:
                # En dry-run : on analyse les entités même sans créer le dev
                # pour remonter unknown_sites/projects/groups dans le rapport
                self._analyze_dry_run_row(
                    row, all_sites, all_projects_by_name, all_groups,
                    unknown_sites_names, unknown_projects_data, unknown_groups_names,
                )
                if existing_dev:
                    success_list.append({
                        "row": row_num, "status": "updated",
                        "name": name, "email": email,
                        "reason": f"Sera mis à jour (ID {existing_dev.id})",
                    })
                else:
                    success_list.append({
                        "row": row_num, "status": "success",
                        "name": name, "email": email,
                        "reason": "Création prévue",
                    })
                continue

            row_warnings: List[str] = []

            # ── Résolution des sites ──────────────────────────────────────────
            site_names     = [s.strip() for s in (row.get("sites") or "").split(",") if s.strip()]
            resolved_sites : List[dict] = []

            for i, sname in enumerate(site_names):
                site = all_sites.get(sname.lower())
                if site is None:
                    if create_missing_sites:
                        site = self.site_repo.create_from_import(db, sname)
                        all_sites[sname.lower()] = site
                        created_sites_names.add(sname)
                        logger.info("Import: site '%s' créé (ligne %d)", sname, row_num)
                    else:
                        unknown_sites_names.add(sname)
                        row_warnings.append(
                            f"Site '{sname}' introuvable — dev mis à jour sans ce site."
                        )
                        logger.warning("Import: site '%s' introuvable (ligne %d)", sname, row_num)
                        continue
                resolved_sites.append({
                    "site": site,
                    "is_primary": (i == 0 and not resolved_sites),
                })

            # ── Résolution des projets ────────────────────────────────────────
            project_items     = [p.strip() for p in (row.get("projects") or "").split(",") if p.strip()]
            resolved_projects : List[object] = []

            for pitem in project_items:
                # Analyse syntaxe "Nom:ID" (ex: "Frontend:1234")
                parts = pitem.rsplit(":", 1)
                pname = parts[0].strip()
                p_gitlab_id = int(parts[1].strip()) if len(parts) > 1 and parts[1].strip().isdigit() else None

                # 1. Tentative par ID GitLab (Le plus fiable)
                proj = None
                if p_gitlab_id and p_gitlab_id in all_projects_by_id:
                    proj = all_projects_by_id[p_gitlab_id]
                
                # 2. Tentative par Nom si non trouvé par ID
                if proj is None:
                    proj = all_projects_by_name.get(pname.lower())
                
                if proj is None:
                    if create_missing_projects:
                        proj = self.project_repo.create_from_import(
                            db, 
                            pname, 
                            gitlab_project_id=p_gitlab_id, 
                            gitlab_config_id=default_gitlab_config_id
                        )
                        all_projects_by_name[pname.lower()] = proj
                        created_projects_names.add(pname)
                        logger.info("Import: projet '%s' créé avec ID%s (ligne %d)", pname, p_gitlab_id, row_num)
                    else:
                        if pname not in unknown_projects_data or (unknown_projects_data[pname] is None and p_gitlab_id):
                            unknown_projects_data[pname] = p_gitlab_id
                            
                        row_warnings.append(
                            f"Projet '{pname}' introuvable — dev mis à jour sans ce projet."
                        )
                        logger.warning("Import: projet '%s' introuvable (ligne %d)", pname, row_num)
                        continue
                else:
                    # ✅ LOGIQUE AMÉLIORÉE : Réparation des projets orphelins (sans config)
                    updates = {}
                    
                    # 1. Update ID GitLab si fourni dans CSV et manquant en base
                    if p_gitlab_id is not None and getattr(proj, "gitlab_project_id", None) is None:
                        updates["gitlab_project_id"] = p_gitlab_id
                    
                    # 2. Update Config GitLab si fournie via l'UI et manquante en base
                    if default_gitlab_config_id and getattr(proj, "gitlab_config_id", None) is None:
                        updates["gitlab_config_id"] = default_gitlab_config_id
                    
                    if updates:
                        self.project_repo.update(db, proj.id, updates)
                resolved_projects.append(proj)

            # ── Résolution des groupes ────────────────────────────────────────
            groups_csv = [g.strip() for g in group_csv_raw.split(",") if g.strip()]
            resolved_group_ids: List[int] = []

            for gname in groups_csv:
                gname_clean = gname.lower().strip()
                group = all_groups.get(gname_clean)
                
                if group is None:
                    if create_missing_groups:
                        # On cherche un site_id pour le groupe (le premier trouvé ou default)
                        site_id_for_group = resolved_sites[0]["site"].id if resolved_sites else default_site_id
                        if not site_id_for_group:
                            # Fallback ultime sur n'importe quel site existant
                            first_s = db.query(Site).first()
                            site_id_for_group = first_s.id if first_s else None
                            
                        group = self.group_repo.create_from_import(db, gname, site_id=site_id_for_group)
                        db.flush() # Pour avoir l'ID
                        all_groups[gname_clean] = group
                        created_groups_names.add(gname)
                        logger.info("Import: groupe '%s' CRÉÉ et indexé (ligne %d)", gname, row_num)
                    else:
                        unknown_groups_names.add(gname)
                        row_warnings.append(f"Groupe '{gname}' introuvable (auto-création OFF).")
                        logger.warning("Import: groupe '%s' introuvable et non créé (ligne %d)", gname, row_num)
                if group:
                    resolved_group_ids.append(group.id)

            # Fallback sur default_group_id si aucun groupe résolu
            if not resolved_group_ids and default_group_id:
                resolved_group_ids = [default_group_id]

            # ── UPSERT du développeur ─────────────────────────────────────────
            try:
                if existing_dev:
                    developer_id = existing_dev.id
                    
                    # Mise à jour des groupes
                    if resolved_group_ids:
                        self.dev_repo.sync_groups(db, existing_dev, resolved_group_ids)
                        
                    # Ajout des sites (sans écraser)
                    if resolved_sites:
                        for rs in resolved_sites:
                            self.dev_site_repo.add(
                                db, developer_id, rs["site"].id, is_primary=rs["is_primary"]
                            )
                    elif default_site_id:
                        self.dev_site_repo.add(db, developer_id, default_site_id, is_primary=False)
                        
                    # Ajout des projets (sans écraser)
                    for proj in resolved_projects:
                        self.dev_proj_repo.add(db, developer_id, proj.id)
                        
                    db.flush()
                    
                    row_result: dict = {
                        "row":    row_num,
                        "status": "updated",
                        "name":   name,
                        "email":  email,
                        "reason": "Mise à jour réussie (affectations ajoutées)."
                    }
                    if row_warnings:
                        row_result["warnings"] = row_warnings
                    
                    success_list.append(row_result)
                    
                else:
                    # Création standard
                    dev_data = {
                        "gitlab_username": username,
                        "name":            name,
                        "email":           email,
                        "is_active":       True,
                        "is_validated":    True,
                        "is_bot":          False,
                        "auto_created":    False,
                        "source":          "csv_import",
                        "created_by":      imported_by,
                    }

                    developer = self.dev_repo.create(db, dev_data, group_ids=resolved_group_ids)
                    db.flush()

                    if resolved_sites:
                        for rs in resolved_sites:
                            self.dev_site_repo.add(
                                db, developer.id, rs["site"].id, is_primary=rs["is_primary"]
                            )
                    elif default_site_id:
                        self.dev_site_repo.add(db, developer.id, default_site_id, is_primary=True)

                    for proj in resolved_projects:
                        self.dev_proj_repo.add(db, developer.id, proj.id)

                    row_result: dict = {
                        "row":    row_num,
                        "status": "success",
                        "name":   name,
                        "email":  email,
                    }
                    if row_warnings:
                        row_result["warnings"] = row_warnings

                    success_list.append(row_result)

            except Exception as e:
                db.rollback()
                error_list.append({
                    "row": row_num, "status": "error",
                    "name": name, "email": email, "reason": str(e),
                })

        # ── Finalisation ──────────────────────────────────────────────────────
        self.import_log_repo.complete(
            db, import_log,
            total_rows      = len(rows),
            success_count   = len(success_list),
            error_count     = len(error_list),
            duplicate_count = len(duplicate_list),
            report_data     = {
                "success":    success_list,
                "errors":     error_list,
                "duplicates": duplicate_list,
            },
        )

        if not dry_run:
            db.commit()
        else:
            db.rollback()

        logger.info(
            "Import %s— total=%d success=%d errors=%d duplicates=%d | "
            "unknown[sites=%s projects=%s groups=%s] "
            "created[sites=%s projects=%s groups=%s]",
            "[DRY-RUN] " if dry_run else "",
            len(rows), len(success_list), len(error_list), len(duplicate_list),
            sorted(unknown_sites_names),    list(unknown_projects_data.keys()),  sorted(unknown_groups_names),
            sorted(created_sites_names),    sorted(created_projects_names),  sorted(created_groups_names),
        )

        return {
            "lot_id":            import_log.id,
            "status":            ImportStatusEnum.completed.value,
            "file_name":         file_name,
            "total_rows":        len(rows),
            "success_count":     len(success_list),
            "error_count":       len(error_list),
            "duplicate_count":   len(duplicate_list),
            "dry_run":           dry_run,
            "rows":              (success_list + error_list + duplicate_list) if len(rows) <= 100 else None,
            "unknown_sites":     sorted(list(unknown_sites_names))    or None,
            "unknown_projects":  unknown_projects_data or None,
            "unknown_groups":    sorted(list(unknown_groups_names))   or None,
            "created_sites":     sorted(created_sites_names)    or None,
            "created_projects":  sorted(created_projects_names) or None,
            "created_groups":    sorted(created_groups_names)   or None,
        }

    # =========================================================================
    # HELPER PRIVÉ — Analyse dry-run (sans créer le dev)
    # =========================================================================

    def _analyze_dry_run_row(
        self,
        row:                   dict,
        all_sites:             dict,
        all_projects:          dict,
        all_groups:            dict,
        unknown_sites_names:   Set[str],
        unknown_projects_data: Dict[str, Optional[int]],  # ✅ FIX: Dict {nom: gitlab_id}
        unknown_groups_names:  Set[str],
    ) -> None:
        """
        ✅ NOUVEAU : en dry-run, analyse les entités de chaque ligne
        pour remonter les inconnues dans le rapport SANS créer quoi que ce soit.
        Permet à l'admin de voir TOUS les conflits avant l'import réel.
        """
        for sname in [s.strip() for s in (row.get("sites") or "").split(",") if s.strip()]:
            if all_sites.get(sname.lower()) is None:
                unknown_sites_names.add(sname)

        for pitem in [p.strip() for p in (row.get("projects") or "").split(",") if p.strip()]:
            # Analyse syntaxe "Nom:ID"
            p_parts = pitem.rsplit(":", 1)
            pname = p_parts[0].strip()
            p_gitlab_id = int(p_parts[1].strip()) if len(p_parts) > 1 and p_parts[1].strip().isdigit() else None

            if all_projects.get(pname.lower()) is None:
                if pname not in unknown_projects_data or (unknown_projects_data[pname] is None and p_gitlab_id):
                    unknown_projects_data[pname] = p_gitlab_id

        groups_csv = [g.strip() for g in (row.get("group") or "").split(",") if g.strip()]
        for gname in groups_csv:
            if all_groups.get(gname.lower()) is None:
                unknown_groups_names.add(gname)

    # =========================================================================
    # VALIDATION EN-TÊTES
    # =========================================================================

    def _validate_headers(self, headers: set) -> None:
        missing = REQUIRED_COLUMNS - {h.lower().strip() for h in headers}
        if missing:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=(
                    f"Colonnes obligatoires manquantes : {', '.join(sorted(missing))}. "
                    f"Téléchargez le template via GET /developers/import/template."
                ),
            )

    # =========================================================================
    # PARSE FICHIER
    # =========================================================================

    def _parse_file(self, content: bytes, file_type: str) -> List[dict]:
        if file_type == "csv":
            # ✅ SENIOR : Chaîne de décodage robuste (UTF8 -> CP1252 -> Latin1)
            text = None
            for enc in ["utf-8-sig", "cp1252", "latin-1"]:
                try:
                    text = content.decode(enc)
                    logger.info("Import: Fichier décodé avec succès en %s", enc)
                    break
                except UnicodeDecodeError:
                    continue
            
            if not text:
                raise HTTPException(status_code=400, detail="Encodage du fichier non supporté (utilisez UTF-8)")
                
            # Détection auto du délimiteur (virgule ou point-virgule)
            try:
                dialect = csv.Sniffer().sniff(text[:1024]) if "," in text or ";" in text else "excel"
            except:
                dialect = "excel" # Fallback
                
            reader = csv.DictReader(io.StringIO(text), dialect=dialect)
            
            if reader.fieldnames:
                # On normalise les headers dès la lecture
                return [
                    {str(k).lower().strip(): v for k, v in row.items() if k}
                    for row in reader
                ]
            return []
        else:
            try:
                import openpyxl
                wb      = openpyxl.load_workbook(io.BytesIO(content), read_only=True)
                ws      = wb.active
                raw     = list(ws.iter_rows(values_only=True))
                if not raw:
                    return []
                headers = [str(h).strip().lower() if h else "" for h in raw[0]]
                self._validate_headers(set(headers))
                return [
                    {headers[i]: str(cell).strip() if cell is not None else ""
                     for i, cell in enumerate(row)}
                    for row in raw[1:]
                ]
            except HTTPException:
                raise
            except ImportError:
                raise HTTPException(
                    status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
                    detail="openpyxl non installé — utilisez le format CSV.",
                )