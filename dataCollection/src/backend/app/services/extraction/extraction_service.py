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
from app.repositories.audit_log_repository import AuditLogRepository
from app.repositories.commit_repository import CommitRepository
from app.repositories.developer_repository import DeveloperRepository
from app.repositories.developer_project_repository import DeveloperProjectRepository
from app.repositories.extraction_lot_repository import ExtractionLotRepository
from app.repositories.merge_request_repository import MergeRequestRepository
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
        self.period_repo      = PeriodRepository()
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

    async def _extract_data(self, db, project, lot, client, developer_id: Optional[int] = None) -> None:
        await self._extract_commits(db, project, lot, client, developer_id=developer_id)
        db.flush()
        await self._extract_merge_requests(db, project, lot, client, developer_id=developer_id)
        db.flush()

    # =========================================================================
    # [FIX-DEDUP-3] EXTRACT COMMITS — avec pré-chargement des membres
    # =========================================================================

    async def _extract_commits(self, db, project, lot, client, developer_id: Optional[int] = None) -> None:
        """
        [FIX-DEDUP-3] Pré-charge les membres avec emails officiels GitLab
        avant d'extraire les commits, pour éviter les doublons causés par
        l'email git local ≠ email GitLab officiel.

        [FIX-BRANCHES] get_project_commits() retourne maintenant les commits
        de TOUTES les branches (fix dans gitlab_client.py).
        """
        # Pré-charger les membres avec leurs emails officiels
        try:
            members_map: Dict[int, dict] = await client.get_project_members_with_emails(
                project.gitlab_project_id
            )
            logger.info(
                f"Pre-loaded {len(members_map)} members for project={project.name}"
            )
        except Exception as e:
            logger.warning(
                f"Could not pre-load members for project={project.name}: {e} "
                f"— falling back to commit author data"
            )
            members_map = {}

        commits = await client.get_project_commits(project.gitlab_project_id)
        created = skipped = 0

        target_dev = None
        if developer_id:
            target_dev = self.developer_repo.get_by_id(db, developer_id)

        for commit_data in commits:
            sha = commit_data.get("id")
            if not sha:
                continue

            if self.commit_repo.get_by_sha(db, sha, project.id):
                skipped += 1
                continue

            # [FILTRE DÉVELOPPEUR]
            gitlab_id    = commit_data.get("author_id")
            author_email = commit_data.get("author_email")
            author_name  = commit_data.get("author_name")
            author_username = commit_data.get("author_username")

            if target_dev:
                is_match = False
                if gitlab_id and gitlab_id == target_dev.gitlab_user_id:
                    is_match = True
                elif _normalize_email(author_email) == _normalize_email(target_dev.email):
                    is_match = True
                elif _normalize_username(author_username) == _normalize_username(target_dev.gitlab_username):
                    is_match = True
                
                if not is_match:
                    skipped += 1
                    continue

            # [FIX-DEDUP-3] Résoudre l'email via members_map en priorité
            gitlab_id    = commit_data.get("author_id")
            author_email = commit_data.get("author_email")
            author_name  = commit_data.get("author_name")

            # Si le gitlab_id est dans la members_map, prendre l'email officiel
            if gitlab_id and gitlab_id in members_map:
                official_email = members_map[gitlab_id].get("email")
                if official_email:
                    author_email = official_email

            developer = self._resolve_developer(
                db=db,
                project_id=project.id,
                email=author_email,
                name=author_name,
                gitlab_id=gitlab_id,
                username=commit_data.get("author_username"),
                members_map=members_map,
            )

            mapped = GitLabMapper.map_commit(
                data=commit_data,
                project_id=project.id,
                developer_id=developer.id if developer else None,
                extraction_lot_id=lot.id,
            )
            self.commit_repo.create(db, mapped)
            created += 1

        logger.info(
            f"Commits — created:{created} skipped:{skipped} "
            f"project={project.name} (all branches)"
        )

    async def _extract_merge_requests(self, db, project, lot, client, developer_id: Optional[int] = None) -> None:
        mrs = await client.get_project_merge_requests(project.gitlab_project_id)
        created = skipped = 0
        target_dev = None
        if developer_id:
            target_dev = self.developer_repo.get_by_id(db, developer_id)

        for mr_data in mrs:
            if self.mr_repo.get_by_gitlab_mr_id(db, mr_data["iid"], project.id):
                skipped += 1
                continue

            author    = mr_data.get("author") or {}
            mr_author_id = author.get("id")
            mr_author_email = author.get("email")
            mr_author_username = author.get("username")

            if target_dev:
                is_match = False
                if mr_author_id and mr_author_id == target_dev.gitlab_user_id:
                    is_match = True
                elif _normalize_email(mr_author_email) == _normalize_email(target_dev.email):
                    is_match = True
                elif _normalize_username(mr_author_username) == _normalize_username(target_dev.gitlab_username):
                    is_match = True
                
                if not is_match:
                    skipped += 1
                    continue

            developer = self._resolve_developer(
                db=db, project_id=project.id,
                email=mr_author_email, name=author.get("name"),
                gitlab_id=mr_author_id, username=mr_author_username,
            )

            # Résoudre le relecteur si présent
            reviewer_id = None
            reviewers   = mr_data.get("reviewers") or []
            if reviewers:
                reviewer_data = reviewers[0]
                reviewer = self._resolve_developer(
                    db=db, project_id=project.id,
                    email=reviewer_data.get("email"),
                    name=reviewer_data.get("name"),
                    gitlab_id=reviewer_data.get("id"),
                    username=reviewer_data.get("username"),
                )
                reviewer_id = reviewer.id if reviewer else None

            approvals_data = await client.get_merge_request_approvals(
                project_id=project.gitlab_project_id, mr_iid=mr_data["iid"]
            )

            mapped = GitLabMapper.map_merge_request(
                data=mr_data,
                project_id=project.id,
                developer_id=developer.id if developer else None,
                extraction_lot_id=lot.id,
                approvals_data=approvals_data,
                reviewer_id=reviewer_id,
            )
            self.mr_repo.create(db, mapped)
            created += 1

        logger.info(f"MRs — created:{created} skipped:{skipped} project={project.name}")

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

        # ── 6. Création du nouveau Developer ──────────────────────────────────
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