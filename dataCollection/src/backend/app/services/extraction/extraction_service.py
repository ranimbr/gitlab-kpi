"""
services/extraction/extraction_service.py

VERSION FINALE — Classe complète + correctifs anti-doublons intégrés.

CORRECTIFS ACTIFS :
────────────────────
[FIX-DEDUP-1] _resolve_developer() : ordre de lookup strict avec normalisation
    1. gitlab_user_id  → UNIQUE global (le plus fiable)
    2. email normalisé → lower().strip()
    3. gitlab_username → lower().strip()
    4. name normalisé  → évite "Rami ABID" vs "rami abid" → 2 devs
    5. synthetic_id    → dernier recours (contributeur externe)

[FIX-DEDUP-2] Helpers de normalisation : _normalize_email / _normalize_name /
    _normalize_username — garantissent que la même personne avec des variations
    de casse ne génère pas deux Developer différents.

[FIX-DEDUP-3] _extract_commits() : pré-chargement des membres GitLab
    avant l'extraction — email officiel GitLab prioritaire sur l'email git local.

[FIX-BRANCHES] get_project_commits() dans gitlab_client retourne maintenant
    tous les commits de toutes les branches. ExtractionService consomme
    cette liste sans modification supplémentaire.
"""
import hashlib
import json
import logging
from datetime import datetime, timezone
from pathlib import Path
from typing import Dict, List, Optional

from sqlalchemy.exc import SQLAlchemyError
from sqlalchemy.orm import Session

from app.core.config import get_settings
from app.models.extraction_lot import ExtractionLot, ExtractionStatusEnum, ExtractionTypeEnum
from app.models.gitlab_config import GitLabConfig
from app.models.developer import Developer
from app.repositories.audit_log_repository import AuditLogRepository
from app.repositories.commit_repository import CommitRepository
from app.repositories.developer_repository import DeveloperRepository
from app.repositories.developer_project_repository import DeveloperProjectRepository
from app.repositories.extraction_lot_repository import ExtractionLotRepository
from app.repositories.developer_site_repository import DeveloperSiteRepository
from app.repositories.merge_request_repository import MergeRequestRepository
from app.repositories.comment_repository import CommentRepository
from app.repositories.period_repository import PeriodRepository
from app.repositories.project_repository import ProjectRepository
from app.services.gitlab.gitlab_client import GitLabAPIError, GitLabClient
from app.services.gitlab.gitlab_mapper import GitLabMapper

logger   = logging.getLogger(__name__)
settings = get_settings()

BOT_PATTERNS = [
    "bot", "merge", "ci", "auto", "robot", "pipeline",
    "automation", "deploy", "dependabot", "renovate",
    "github-actions", "gitlab-ci",
]


# =============================================================================
# [FIX-DEDUP-2] HELPERS DE NORMALISATION (module-level)
# =============================================================================

def _normalize_email(email: Optional[str]) -> Optional[str]:
    """'Rami.Abid@Telnet.TN ' → 'rami.abid@telnet.tn'"""
    if not email:
        return None
    return email.lower().strip()


def _normalize_name(name: Optional[str]) -> Optional[str]:
    """'Rami ABID' / '  rami abid  ' → 'rami abid'"""
    if not name:
        return None
    return " ".join(name.lower().strip().split())


def _normalize_username(username: Optional[str]) -> Optional[str]:
    """'RamiAbid' → 'ramiabid'"""
    if not username:
        return None
    return username.lower().strip()


def _is_bot(username: Optional[str], name: Optional[str]) -> bool:
    candidates = [(username or "").lower(), (name or "").lower()]
    return any(p in c for c in candidates for p in BOT_PATTERNS)


def _synthetic_gitlab_id(email: Optional[str], name: Optional[str]) -> int:
    """
    ID synthétique déterministe pour les contributeurs externes.
    [FIX-DEDUP] Utilise les valeurs NORMALISÉES → même ID pour
    'Rami ABID' et 'rami abid'.
    """
    norm_email = _normalize_email(email) or ""
    norm_name  = _normalize_name(name)  or ""
    key        = f"external:{norm_email}:{norm_name}"
    digest     = hashlib.sha256(key.encode()).hexdigest()[:12]
    return -abs(int(digest, 16)) % (2 ** 31)


# =============================================================================
# SERVICE PRINCIPAL
# =============================================================================

class ExtractionService:

    def __init__(self):
        self.project_repo     = ProjectRepository()
        self.developer_repo   = DeveloperRepository()
        self.dev_project_repo = DeveloperProjectRepository()
        self.commit_repo      = CommitRepository()
        self.mr_repo          = MergeRequestRepository()
        self.comment_repo     = CommentRepository()
        self.lot_repo         = ExtractionLotRepository()
        self.audit_repo       = AuditLogRepository()

    # =========================================================================
    # REALTIME EXTRACTION
    # =========================================================================

    async def run_realtime_extraction(
        self,
        db:                Session,
        gitlab_project_id: int,
        gitlab_config:     GitLabConfig,
        triggered_by_user: int,
    ) -> ExtractionLot:
        from fastapi import HTTPException, status as http_status

        now    = datetime.now(timezone.utc)
        period = self.period_repo.get_or_create(db, now.year, now.month)

        if not self.period_repo.is_open(db, period.id):
            raise HTTPException(
                status_code=http_status.HTTP_409_CONFLICT,
                detail=f"Period {period.year}/{period.month:02d} is closed (RG-01).",
            )

        project = self.project_repo.get_by_gitlab_id(db, gitlab_project_id)
        if not project:
            client       = GitLabClient(gitlab_config)
            project_data = await client.get_project(gitlab_project_id)
            if not project_data:
                raise HTTPException(
                    status_code=404,
                    detail=f"GitLab project id={gitlab_project_id} not found",
                )
            mapped                     = GitLabMapper.map_project(project_data)
            mapped["gitlab_config_id"] = gitlab_config.id
            project                    = self.project_repo.create(db, mapped)
            db.flush()

        lot = ExtractionLot(
            extraction_type=ExtractionTypeEnum.REALTIME,
            status=ExtractionStatusEnum.running,
            period_id=period.id,
            project_id=project.id,
            triggered_by=triggered_by_user,
        )
        db.add(lot)
        db.flush()

        self.audit_repo.log(
            db=db, user_id=triggered_by_user, action="LAUNCH_EXTRACTION",
            entity_type="ExtractionLot", entity_id=lot.id,
            new_value={"extraction_type": "REALTIME", "project_id": project.id},
        )

        try:
            client = GitLabClient(gitlab_config)
            await self._extract_data(db, project, lot, client)

            relinked = self._relink_commits_to_developers(db, project.id)
            if relinked > 0:
                logger.info(f"Re-linked {relinked} commits — project={project.name}")

            self._update_project_last_commit(db, project.id)

            lot.status        = ExtractionStatusEnum.completed
            lot.completed_at  = datetime.now(timezone.utc)
            lot.error_message = None
            db.commit()
            logger.info(f"REALTIME extraction completed — lot={lot.id} project={project.name}")

        except (GitLabAPIError, SQLAlchemyError) as e:
            db.rollback()
            error_msg = str(e)[:1000]
            try:
                lot.status        = ExtractionStatusEnum.failed
                lot.completed_at  = datetime.now(timezone.utc)
                lot.error_message = error_msg
                db.add(lot)
                db.commit()
            except Exception:
                pass
            logger.error(f"REALTIME extraction failed — lot={lot.id}: {error_msg}")
            raise

        return lot

    # =========================================================================
    # MONTHLY EXTRACTION
    # =========================================================================

    async def run_monthly_extraction(
        self,
        db:            Session,
        project_id:    int,
        period_id:     int,
        gitlab_config: GitLabConfig,
        is_backfill:   bool = False,
    ) -> ExtractionLot:
        from fastapi import HTTPException, status as http_status

        project = self.project_repo.get_by_id(db, project_id)
        if not project:
            raise ValueError(f"Project id={project_id} not found")

        existing_lot = self.lot_repo.get_monthly(db, period_id, project_id)

        if existing_lot and not is_backfill:
            raise HTTPException(
                status_code=http_status.HTTP_409_CONFLICT,
                detail=(
                    f"A MONTHLY extraction already exists for "
                    f"project_id={project_id} period_id={period_id}. "
                    f"Use is_backfill=True to recalculate."
                ),
            )

        if existing_lot and is_backfill:
            lot              = existing_lot
            lot.status       = ExtractionStatusEnum.running
            lot.completed_at = lot.error_message = None
            db.flush()
        else:
            lot = ExtractionLot(
                extraction_type=ExtractionTypeEnum.MONTHLY,
                status=ExtractionStatusEnum.running,
                period_id=period_id,
                project_id=project.id,
            )
            db.add(lot)
            db.flush()

        try:
            client = GitLabClient(gitlab_config)
            await self._extract_data(db, project, lot, client)

            relinked = self._relink_commits_to_developers(db, project.id)
            if relinked > 0:
                logger.info(f"Re-linked {relinked} commits — project={project.name}")

            self._update_project_last_commit(db, project.id)

            file_path, md5     = self._generate_dump_file(db, lot)
            lot.generated_file = file_path
            lot.md5sum         = md5
            lot.status         = ExtractionStatusEnum.completed
            lot.completed_at   = datetime.now(timezone.utc)
            lot.error_message  = None
            db.flush()

        except (GitLabAPIError, SQLAlchemyError) as e:
            error_msg         = str(e)[:1000]
            lot.status        = ExtractionStatusEnum.failed
            lot.completed_at  = datetime.now(timezone.utc)
            lot.error_message = error_msg
            db.flush()
            logger.error(f"MONTHLY extraction failed — lot={lot.id}: {error_msg}")
            raise

        return lot

    # =========================================================================
    # EXTRACT DATA
    # =========================================================================

    async def _extract_data(
        self, 
        db: Session, 
        project, 
        lot, 
        client, 
        developer_ids: Optional[List[int]] = None, 
        fast_mode: bool = False
    ) -> None:
        await self._extract_commits(db, project, lot, client, developer_ids=developer_ids, fast_mode=fast_mode)
        db.flush()
        await self._extract_merge_requests(db, project, lot, client, developer_ids=developer_ids, fast_mode=fast_mode)
        db.flush()

    # =========================================================================
    # [FIX-DEDUP-3] EXTRACT COMMITS — avec pré-chargement des membres
    # =========================================================================

    async def _extract_commits(
        self, 
        db, 
        project, 
        lot, 
        client, 
        developer_ids: Optional[List[int]] = None, 
        fast_mode: bool = False
    ) -> None:
        """
        [FIX-DEDUP-3] Pré-charge les membres avec emails officiels GitLab
        avant d'extraire les commits.
        """
        members_map: Dict[int, dict] = {}
        # On charge les membres sauf si extraction ultra-ciblée (1 seul dev)
        if not developer_ids or len(developer_ids) > 1:
            try:
                members_map = await client.get_project_members_with_emails(project.gitlab_project_id)
                logger.info(f"Pre-loaded {len(members_map)} members for project={project.name}")
            except Exception as e:
                logger.warning(f"Could not pre-load members: {e}")

        # 🎯 STRATÉGIE SENIOR : Extraction groupée par auteurs si possible
        # GitLab API ne permet pas une liste d'auteurs dans un seul appel. 
        # Si developer_ids est fourni, on peut soit boucler, soit tout récupérer et filtrer.
        # Pour une équipe CSV (4 devs), boucler est plus précis.
        
        target_devs = []
        if developer_ids:
            target_devs = db.query(Developer).filter(Developer.id.in_(developer_ids)).all()

        author_filters = [None]
        if target_devs:
            author_filters = []
            for d in target_devs:
                # [SENIOR FIX]: On utilise le "Nom" au lieu de l'Email pour l'API GitLab.
                # Pourquoi ? L'email local du dev est souvent un email corporate (ex: telnet.tn),
                # alors que ses commits open-source utilisent son email perso ou public.
                # Le paramètre 'author' de l'API GitLab matche parfaitement sur le 'name'.
                f = d.name or d.gitlab_username
                if f: author_filters.append(f)
            
        if not author_filters: author_filters = [None]

        # Filtre temporel
        since = until = None
        if lot.period:
            import calendar
            try:
                year, month = lot.period.year, lot.period.month
                since = f"{year}-{month:02d}-01T00:00:00Z"
                last_day = calendar.monthrange(year, month)[1]
                until = f"{year}-{month:02d}-{last_day:02d}T23:59:59Z"
            except Exception as e:
                logger.warning(f"Calcul période échoué: {e}")

        all_commits_data = []
        for a_filter in author_filters:
            commits = await client.get_project_commits(
                project.gitlab_project_id, 
                author=a_filter,
                since=since,
                until=until
            )
            all_commits_data.extend(commits)

        # Déduplication des commits reçus (si plusieurs filtres matchent le même commit)
        seen_shas = set()
        unique_commits = []
        for c in all_commits_data:
            if c["id"] not in seen_shas:
                seen_shas.add(c["id"])
                unique_commits.append(c)

        created = skipped = 0
        for commit_data in unique_commits:
            sha = commit_data.get("id")
            if not sha or self.commit_repo.get_by_sha(db, sha, project.id):
                skipped += 1
                continue

            gitlab_id    = commit_data.get("author_id")
            author_email = commit_data.get("author_email")
            author_name  = commit_data.get("author_name")
            author_username = commit_data.get("author_username")

            # [STRICT TEAM ISOLATION]
            # Si targeting mode, on ignore tout ce qui ne matche pas un de nos devs
            if target_devs:
                is_match = False
                matched_dev = None
                for t_dev in target_devs:
                    if (gitlab_id and gitlab_id == t_dev.gitlab_user_id) or \
                       (_normalize_email(author_email) == _normalize_email(t_dev.email)) or \
                       (_normalize_username(author_username) == _normalize_username(t_dev.gitlab_username)) or \
                       (author_name and t_dev.name and author_name.lower() == t_dev.name.lower()):
                        is_match = True
                        matched_dev = t_dev
                        break
                
                if not is_match:
                    skipped += 1
                    continue

            # [SENIOR FIX] Si la logique ciblée a déjà trouvé le dev, on l'utilise directement !
            # Cela évite que `_resolve_developer` n'échoue lamentablement car l'email Git
            # public du développeur ne correspond pas à son email d'entreprise en base.
            if target_devs and matched_dev:
                developer = matched_dev
            else:
                # Résolution/Création
                # Si on est en mode "Team Only", on interdit la création de nouveaux profils
                developer = self._resolve_developer(
                    db=db,
                    project_id=project.id,
                    email=author_email,
                    name=author_name,
                    gitlab_id=gitlab_id,
                    username=author_username,
                    members_map=members_map,
                    # Senior: si mode ciblé, on ne crée pas de "bruit"
                    forbid_creation=bool(developer_ids) 
                )

            if not developer:
                skipped += 1
                continue
            mapped = GitLabMapper.map_commit(
                data=commit_data,
                project_id=project.id,
                developer_id=developer.id,
                extraction_lot_id=lot.id,
            )
            self.commit_repo.create(db, mapped)
            created += 1

        db.commit()

    async def _extract_merge_requests(
        self, 
        db, 
        project, 
        lot, 
        client, 
        developer_ids: Optional[List[int]] = None, 
        fast_mode: bool = False
    ) -> None:
        import calendar
        
        target_usernames = []
        if developer_ids:
            target_devs = db.query(Developer).filter(Developer.id.in_(developer_ids)).all()
            target_usernames = [d.gitlab_username for d in target_devs if d.gitlab_username]

        # Filtre temporel
        updated_after = updated_before = None
        try:
            period = lot.period
            year, month = period.year, period.month
            updated_after  = f"{year}-{month:02d}-01T00:00:00Z"
            last_day       = calendar.monthrange(year, month)[1]
            updated_before = f"{year}-{month:02d}-{last_day:02d}T23:59:59Z"
            
            # ✅ [SENIOR] : Bornes pour le filtrage Temporel
            from datetime import timezone
            lot_start = datetime(year, month, 1, tzinfo=timezone.utc)
            lot_end   = datetime(year, month, last_day, 23, 59, 59, tzinfo=timezone.utc)
        except Exception as e:
            logger.warning(f"Calcul période MR échoué: {e}")

        mrs_dict = {}
        
        # Si multi-targeting, on boucle sur les usernames pour Author/Reviewer/Assignee
        usernames_to_fetch = target_usernames if target_usernames else [None]

        for username in usernames_to_fetch:
            roles = [{"author_username": username}, {"reviewer_username": username}, {"assignee_username": username}] \
                    if username else [{"author_username": None}]
            
            for role_params in roles:
                try:
                    fetched = await client.get_project_merge_requests(
                        project.gitlab_project_id, 
                        updated_after=updated_after,
                        updated_before=updated_before,
                        **role_params
                    )
                    for m in fetched: mrs_dict[m["iid"]] = m
                except Exception as e:
                    logger.error(f"Error MR role {role_params}: {e}")

        mrs = list(mrs_dict.values())
        created = updated = skipped = 0

        for mr_data in mrs:
            existing_mr = self.mr_repo.get_by_gitlab_mr_id(db, mr_data["iid"], project.id)
            
            author = mr_data.get("author") or {}
            # Strict isolation : ignore si pas dans la team cible
            if developer_ids:
                is_match = False
                for t_id in developer_ids:
                    t_dev = db.query(Developer).filter(Developer.id == t_id).first()
                    # Check author, reviewer, or assignee match
                    if (author.get("id") == t_dev.gitlab_user_id) or \
                       (author.get("username") == t_dev.gitlab_username):
                        is_match = True; break
                    
                    # Reviewers
                    for r in (mr_data.get("reviewers") or []):
                        if r.get("username") == t_dev.gitlab_username:
                            is_match = True; break
                    if is_match: break
                    
                    # Assignees
                    for a in (mr_data.get("assignees") or [mr_data.get("assignee")]):
                        if a and a.get("username") == t_dev.gitlab_username:
                            is_match = True; break
                    if is_match: break
                
                if not is_match:
                    skipped += 1
                    continue

            author_data = mr_data.get("author") or {}
            reviewers_list = mr_data.get("reviewers") or []
            assignees_list = mr_data.get("assignees") or [mr_data.get("assignee")]
            primary_reviewer_data = reviewers_list[0] if reviewers_list else {}
            primary_assignee_data = assignees_list[0] if assignees_list and assignees_list[0] else {}

            # Resolution des entités locales
            dev_author = self._resolve_developer(
                db=db, project_id=project.id,
                email=author_data.get("email"), name=author_data.get("name"),
                gitlab_id=author_data.get("id"), username=author_data.get("username"),
                forbid_creation=bool(developer_ids)
            )
            
            dev_reviewer = None
            if primary_reviewer_data:
                dev_reviewer = self._resolve_developer(
                    db=db, project_id=project.id,
                    email=primary_reviewer_data.get("email"), name=primary_reviewer_data.get("name"),
                    gitlab_id=primary_reviewer_data.get("id"), username=primary_reviewer_data.get("username"),
                    forbid_creation=bool(developer_ids)
                )

            dev_assignee = None
            if primary_assignee_data:
                dev_assignee = self._resolve_developer(
                    db=db, project_id=project.id,
                    email=primary_assignee_data.get("email"), name=primary_assignee_data.get("name"),
                    gitlab_id=primary_assignee_data.get("id"), username=primary_assignee_data.get("username"),
                    forbid_creation=bool(developer_ids)
                )

            # [SENIOR LOGIC] On ne skip QUE si aucun acteur n'est local
            if not dev_author and not dev_reviewer and not dev_assignee:
                skipped += 1
                continue

            # [SENIOR LOGIC] — DEEP EXTRACTION
            # Le listing MR ne renvoie pas commits_count. On fetch le détail complet + les commits.
            try:
                full_mr_data = await client.get_merge_request_detail(project.gitlab_project_id, mr_data["iid"])
                if full_mr_data:
                    mr_data.update(full_mr_data)
                
                # [SENIOR LOGIC] — HIGH PRECISION TEMPORAL FILTERING
                # 1. Commits : Only those by author AND within this period
                mr_commits = await client.get_merge_request_commits(project.gitlab_project_id, mr_data["iid"])
                
                author_data = full_mr_data.get("author", {})
                a_name = author_data.get("name")
                a_email = author_data.get("email")
                a_username = author_data.get("username")
                
                # ✅ [SENIOR] Target-centric filtering
                target_ids, target_names, target_emails, target_usernames = [], [], [], []
                if developer_ids:
                    target_devs = db.query(Developer).filter(Developer.id.in_(developer_ids)).all()
                    target_ids = [d.gitlab_user_id for d in target_devs if d.gitlab_user_id]
                    target_names = [d.name for d in target_devs if d.name]
                    target_emails = [d.email for d in target_devs if d.email]
                    target_usernames = [d.gitlab_username for d in target_devs if d.gitlab_username]
                else: # Fallback to MR Author
                    if author_data.get("id"): target_ids.append(author_data.get("id"))
                    if a_name: target_names.append(a_name)
                    if a_email: target_emails.append(a_email)
                    if a_username: target_usernames.append(a_username)

                def is_in_period(dt_str: str) -> bool:
                    try:
                        dt = datetime.fromisoformat(dt_str.replace("Z", "+00:00"))
                        return lot_start <= dt <= lot_end
                    except: return False
                    
                def is_target_author_commit(c: dict) -> bool:
                    return (c.get("author_name") in target_names) or (c.get("author_email") in target_emails)
                    
                def is_target_author_note(n: dict) -> bool:
                    n_auth = n.get("author", {})
                    return (n_auth.get("id") in target_ids) or (n_auth.get("username") in target_usernames)

                filtered_commits = [
                    c for c in mr_commits 
                    if (not (c.get("title", "").lower().startswith("merge branch"))) and
                    is_target_author_commit(c) and
                    is_in_period(c.get("authored_date", ""))
                ]
                mr_data["commits_count"] = len(filtered_commits)

                # 2. Comments (Notes) : Only those by TARGET developers AND within this period
                mr_notes = await client.get_merge_request_notes(project.gitlab_project_id, mr_data["iid"])
                filtered_notes = [
                    n for n in mr_notes
                    if not n.get("system", False) and 
                    is_target_author_note(n) and
                    is_in_period(n.get("created_at", ""))
                ]
                mr_data["user_notes_count"] = len(filtered_notes)

            except Exception as e:
                logger.warning(f"Could not fetch/filter MR detail/commits/notes for !{mr_data['iid']}: {e}")

            # Approvals
            approvals_data = await client.get_merge_request_approvals(project.gitlab_project_id, mr_data["iid"])

            # Map Data
            mapped = GitLabMapper.map_merge_request(
                data=mr_data, project_id=project.id,
                developer_id=dev_author.id if dev_author else None, 
                extraction_lot_id=lot.id,
                approvals_data=approvals_data,
                reviewer_id=dev_reviewer.id if dev_reviewer else None
            )
            # Ajout manuel de l'assignee_id si le mapper ne le prend pas encore (le modèle le supporte)
            if dev_assignee:
                mapped["assignee_id"] = dev_assignee.id

            current_mr = None
            if existing_mr:
                current_mr = self.mr_repo.update(db, existing_mr, mapped)
                updated += 1
            else:
                current_mr = self.mr_repo.create(db, mapped)
                created += 1

            # Notes / Comments
            try:
                notes = await client.get_merge_request_notes(project.gitlab_project_id, mr_data["iid"])
                for note in notes:
                    if note.get("system"): continue
                    n_author = note.get("author") or {}
                    commenter = self._resolve_developer(
                        db=db, project_id=project.id,
                        email=n_author.get("email"), name=n_author.get("name"),
                        gitlab_id=n_author.get("id"), username=n_author.get("username"),
                        forbid_creation=bool(developer_ids)
                    )
                    if commenter:
                        self.comment_repo.create_if_not_exists(db, {
                            "gitlab_id": note.get("id"), "body": note.get("body"),
                            "created_at": note.get("created_at"), "developer_id": commenter.id,
                            "merge_request_id": current_mr.id
                        })
            except Exception: pass
            db.commit()

        logger.info(f"MRs — created:{created} updated:{updated} skipped:{skipped} project={project.name}")

    # =========================================================================
    # [FIX-DEDUP-1] RESOLVE DEVELOPER — lookup strict avec normalisation
    # =========================================================================

    def _resolve_developer(
        self,
        db:          Session,
        project_id:  int,
        email:       Optional[str]            = None,
        name:        Optional[str]            = None,
        gitlab_id:   Optional[int]            = None,
        username:    Optional[str]            = None,
        members_map: Optional[Dict[int, dict]] = None,
        forbid_creation: bool = False,
    ):
        """
        Recherche ou crée un Developer — VERSION ANTI-DOUBLONS.

        [FIX-DEDUP-1] Ordre de lookup strict avec normalisation à chaque étape.
        [FIX-DEDUP-2] Valeurs normalisées avant comparaison ET avant création.
        """
        # Normalisation des inputs AVANT tout lookup
        norm_email    = _normalize_email(email)
        norm_name     = _normalize_name(name)
        norm_username = _normalize_username(username)

        # ── 1. Lookup par gitlab_user_id (UNIQUE global — le plus fiable) ────
        if gitlab_id is not None and gitlab_id > 0:
            dev = self.developer_repo.get_by_gitlab_user_id(db, gitlab_id)
            if dev:
                self.dev_project_repo.add(db, dev.id, project_id)
                # Enrichir l'email si manquant
                if norm_email and not dev.email:
                    self.developer_repo.update(db, dev, {"email": norm_email})
                return dev

        # ── 2. Lookup par email normalisé ─────────────────────────────────────
        if norm_email:
            dev = self.developer_repo.get_by_email(db, norm_email)
            if dev:
                self.dev_project_repo.add(db, dev.id, project_id)
                # Enrichir gitlab_user_id si maintenant connu
                if gitlab_id and gitlab_id > 0 and not dev.gitlab_user_id:
                    self.developer_repo.update(db, dev, {"gitlab_user_id": gitlab_id})
                return dev

        # ── 3. Lookup par gitlab_username normalisé ───────────────────────────
        if norm_username:
            dev = self.developer_repo.get_by_gitlab_username(db, norm_username)
            if dev:
                self.dev_project_repo.add(db, dev.id, project_id)
                updates = {}
                if norm_email and not dev.email:
                    updates["email"] = norm_email
                if gitlab_id and gitlab_id > 0 and not dev.gitlab_user_id:
                    updates["gitlab_user_id"] = gitlab_id
                if updates:
                    self.developer_repo.update(db, dev, updates)
                return dev

        # ── 4. [FIX-DEDUP] Lookup par nom normalisé ───────────────────────────
        # Évite que "Rami ABID" et "rami abid" créent 2 Developer distincts.
        if norm_name:
            dev = self.developer_repo.get_by_username(db, norm_name)
            if dev is None:
                # Essai avec le nom original (certains repos stockent le nom tel quel)
                dev = self.developer_repo.get_by_username(db, name or "")
            if dev:
                self.dev_project_repo.add(db, dev.id, project_id)
                updates = {}
                if norm_email and not dev.email:
                    updates["email"] = norm_email
                if gitlab_id and gitlab_id > 0 and not dev.gitlab_user_id:
                    updates["gitlab_user_id"] = gitlab_id
                if norm_username and not dev.gitlab_username:
                    updates["gitlab_username"] = norm_username
                if updates:
                    self.developer_repo.update(db, dev, updates)
                return dev

        # ── 5. Contributeur externe → synthetic_id déterministe normalisé ─────
        if gitlab_id is None or gitlab_id <= 0:
            synthetic_id = _synthetic_gitlab_id(norm_email, norm_name)
            existing     = self.developer_repo.get_by_gitlab_user_id(db, synthetic_id)
            if existing:
                self.dev_project_repo.add(db, existing.id, project_id)
                return existing
            gitlab_id = synthetic_id
            logger.warning(
                f"External contributor — name='{name}' email='{email}' "
                f"→ synthetic_id={synthetic_id}"
            )

        # ── 6. [STRICT] Création du nouveau Developer ──────────────────────────
        if forbid_creation:
            # En mode Team Isolation, on ne crée pas de profils pour les "inconnus"
            logger.debug(f"Skipping creation for unknown developer (Strict Team Mode) — email={email}")
            return None

        detected_bot = _is_bot(norm_username, norm_name)
        if detected_bot:
            logger.info(f"Bot detected — username='{username}' name='{name}'")

        # [FIX-DEDUP] Stocker les valeurs NORMALISÉES en base
        mapped = GitLabMapper.map_developer(
            data={
                "id":       gitlab_id,
                "username": norm_username or norm_name or f"external_{abs(gitlab_id)}",
                "name":     norm_name or name,
                "email":    norm_email,
            },
        )
        mapped["is_validated"] = False
        mapped["is_bot"]       = detected_bot
        mapped["source"]       = "gitlab_extraction"
        mapped["auto_created"] = True
        if norm_username:
            mapped["gitlab_username"] = norm_username

        developer = self.developer_repo.create(db, mapped)
        db.flush()

        self.dev_project_repo.add(db, developer.id, project_id)
        db.flush()

        logger.info(
            f"Developer created — name='{developer.name}' "
            f"username='{developer.gitlab_username}' "
            f"is_bot={developer.is_bot} project_id={project_id}"
        )
        return developer

    # =========================================================================
    # RE-LINKAGE
    # =========================================================================

    def _relink_commits_to_developers(self, db: Session, project_id: int) -> int:
        """
        Re-lie les commits sans developer_id aux Developer existants.
        Heuristique safe : 1 seul dev validé dans le projet → lui attribuer
        tous les commits orphelins.
        """
        from app.models.commit import Commit
        from app.models.developer import Developer
        from app.models.developer_project import DeveloperProject

        commits_without_dev = (
            db.query(Commit)
            .filter(Commit.project_id == project_id, Commit.developer_id.is_(None))
            .all()
        )
        if not commits_without_dev:
            return 0

        developers = (
            db.query(Developer)
            .join(
                DeveloperProject,
                (DeveloperProject.developer_id == Developer.id) &
                (DeveloperProject.project_id   == project_id) &
                (DeveloperProject.is_active.is_(True)),
            )
            .filter(
                Developer.is_validated.is_(True),
                Developer.is_bot.is_(False),
                Developer.is_active.is_(True),
            )
            .all()
        )

        if len(developers) == 1:
            single_dev = developers[0]
            for commit in commits_without_dev:
                commit.developer_id = single_dev.id
            db.flush()
            logger.info(
                f"Re-linked {len(commits_without_dev)} orphan commits "
                f"to '{single_dev.name}'"
            )
            return len(commits_without_dev)

        return 0

    # =========================================================================
    # HELPERS
    # =========================================================================

    def _update_project_last_commit(self, db: Session, project_id: int) -> None:
        last_date = self.commit_repo.get_last_commit_date(db, project_id)
        if last_date:
            self.project_repo.update_last_commit_date(db, project_id, last_date)

    def _generate_dump_file(self, db: Session, lot: ExtractionLot) -> tuple:
        from app.models.commit import Commit
        from app.models.merge_request import MergeRequest

        commits = db.query(Commit).filter(Commit.extraction_lot_id == lot.id).all()
        mrs     = db.query(MergeRequest).filter(MergeRequest.extraction_lot_id == lot.id).all()

        dump = {
            "lot_id":           lot.id,
            "project_id":       lot.project_id,
            "period_id":        lot.period_id,
            "extraction_type":  lot.extraction_type.value,
            "generated_at":     datetime.now(timezone.utc).isoformat(),
            "commits": [
                {
                    "sha":             c.gitlab_commit_id,
                    "title":           c.title,
                    "authored_date":   c.authored_date.isoformat(),
                    "additions":       c.additions,
                    "deletions":       c.deletions,
                    "total_changes":   c.total_changes,
                    "is_merge_commit": c.is_merge_commit,
                    "developer_id":    c.developer_id,
                }
                for c in commits
            ],
            "merge_requests": [
                {
                    "gitlab_mr_id":      mr.gitlab_mr_id,
                    "title":             mr.title,
                    "state":             mr.state.value if hasattr(mr.state, "value") else mr.state,
                    "is_draft":          mr.is_draft,
                    "approved":          mr.approved,
                    "review_time_hours": mr.review_time_hours,
                    "source_branch":     mr.source_branch,
                    "target_branch":     mr.target_branch,
                    "developer_id":      mr.developer_id,
                    "reviewer_id":       mr.reviewer_id,
                }
                for mr in mrs
            ],
        }

        content = json.dumps(dump, ensure_ascii=False, indent=2)
        md5     = hashlib.md5(content.encode("utf-8")).hexdigest()

        dump_dir  = Path(settings.DUMP_DIR)
        dump_dir.mkdir(parents=True, exist_ok=True)
        file_name = f"lot_{lot.id}_project_{lot.project_id}_period_{lot.period_id}.json"
        file_path = str(dump_dir / file_name)

        with open(file_path, "w", encoding="utf-8") as f:
            f.write(content)

        return file_path, md5