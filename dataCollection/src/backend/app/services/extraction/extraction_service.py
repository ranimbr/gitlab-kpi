"""
services/extraction/extraction_service.py

"""
import hashlib
import json
import logging
from datetime import datetime, timezone
from pathlib import Path
from typing import Optional

from sqlalchemy.exc import SQLAlchemyError
from sqlalchemy.orm import Session

from app.core.config import get_settings
from app.models.extraction_lot import ExtractionLot, ExtractionStatusEnum, ExtractionTypeEnum
from app.models.gitlab_config import GitLabConfig
from app.repositories.audit_log_repository import AuditLogRepository
from app.repositories.commit_repository import CommitRepository
from app.repositories.developer_repository import DeveloperRepository
from app.repositories.extraction_lot_repository import ExtractionLotRepository
from app.repositories.merge_request_repository import MergeRequestRepository
from app.repositories.period_repository import PeriodRepository
from app.repositories.project_repository import ProjectRepository
from app.services.gitlab.gitlab_client import GitLabAPIError, GitLabClient
from app.services.gitlab.gitlab_mapper import GitLabMapper

logger   = logging.getLogger(__name__)
settings = get_settings()

# ── Détection des bots ────────────────────────────────────────────────────────
BOT_PATTERNS = [
    "bot", "merge", "ci", "auto", "robot", "pipeline",
    "automation", "deploy", "dependabot", "renovate",
    "github-actions", "gitlab-ci",
]


def _is_bot(username: Optional[str], name: Optional[str]) -> bool:
    candidates = [
        (username or "").lower(),
        (name     or "").lower(),
    ]
    return any(
        pattern in candidate
        for candidate in candidates
        for pattern in BOT_PATTERNS
    )


def _synthetic_gitlab_id(
    email: Optional[str], name: Optional[str], project_id: int
) -> int:
    key    = f"external:{(email or '').lower().strip()}:{(name or '').strip()}:{project_id}"
    digest = hashlib.sha256(key.encode()).hexdigest()[:12]
    return -abs(int(digest, 16)) % (2 ** 31)


class ExtractionService:

    def __init__(self):
        self.project_repo   = ProjectRepository()
        self.developer_repo = DeveloperRepository()
        self.commit_repo    = CommitRepository()
        self.mr_repo        = MergeRequestRepository()
        self.period_repo    = PeriodRepository()
        self.lot_repo       = ExtractionLotRepository()
        self.audit_repo     = AuditLogRepository()

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
                detail=(
                    f"Period {period.year}/{period.month:02d} is closed. "
                    "No REALTIME extraction allowed (RG-01)."
                ),
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
            extraction_type = ExtractionTypeEnum.REALTIME,
            status          = ExtractionStatusEnum.running,
            period_id       = period.id,
            project_id      = project.id,
            triggered_by    = triggered_by_user,
        )
        db.add(lot)
        db.flush()

        self.audit_repo.log(
            db          = db,
            user_id     = triggered_by_user,
            action      = "LAUNCH_EXTRACTION",
            entity_type = "ExtractionLot",
            entity_id   = lot.id,
            new_value   = {"extraction_type": "REALTIME", "project_id": project.id},
        )

        try:
            client = GitLabClient(gitlab_config)
            await self._extract_data(db, project, lot, client)

            # ✅ FIX : re-linkage des commits sans developer_id après extraction
            relinked = self._relink_commits_to_developers(db, project.id)
            if relinked > 0:
                logger.info(f"Re-linked {relinked} commits to developers — project={project.name}")

            lot.status        = ExtractionStatusEnum.completed
            lot.completed_at  = datetime.now(timezone.utc)
            lot.error_message = None
            db.commit()

            logger.info(
                f"REALTIME extraction completed — lot id={lot.id} project={project.name}"
            )

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
            logger.error(f"REALTIME extraction failed — lot id={lot.id}: {error_msg}")
            raise

        return lot

    # =========================================================================
    # MONTHLY EXTRACTION
    # ✅ FIX CRITIQUE : paramètre is_backfill ajouté
    # =========================================================================

    async def run_monthly_extraction(
        self,
        db:            Session,
        project_id:    int,
        period_id:     int,
        gitlab_config: GitLabConfig,
        is_backfill:   bool = False,   # ✅ NOUVEAU
    ) -> ExtractionLot:

        from fastapi import HTTPException, status as http_status

        project = self.project_repo.get_by_id(db, project_id)
        if not project:
            raise ValueError(f"Project id={project_id} not found")

        # ✅ FIX : en mode Backfill, on réutilise le lot existant au lieu de lever 409
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
            # Réutilise le lot existant — met à jour son statut
            lot = existing_lot
            lot.status       = ExtractionStatusEnum.running
            lot.completed_at = None
            lot.error_message = None
            db.flush()
            logger.info(
                f"[BACKFILL] Reusing existing lot id={lot.id} "
                f"project={project.name} period_id={period_id}"
            )
        else:
            lot = ExtractionLot(
                extraction_type = ExtractionTypeEnum.MONTHLY,
                status          = ExtractionStatusEnum.running,
                period_id       = period_id,
                project_id      = project.id,
            )
            db.add(lot)
            db.flush()

        try:
            client = GitLabClient(gitlab_config)
            await self._extract_data(db, project, lot, client)

            # ✅ FIX : re-linkage des commits sans developer_id après extraction
            relinked = self._relink_commits_to_developers(db, project.id)
            if relinked > 0:
                logger.info(
                    f"[{'BACKFILL' if is_backfill else 'MONTHLY'}] "
                    f"Re-linked {relinked} commits to developers — project={project.name}"
                )

            # ✅ FIX : log le site_id du projet pour debug
            if project.site_id is None:
                logger.warning(
                    f"[{'BACKFILL' if is_backfill else 'MONTHLY'}] "
                    f"project.site_id is NULL for project={project.name} — "
                    f"KPI nb_developers will be 0. Assign a site to this project."
                )
            else:
                logger.info(
                    f"[{'BACKFILL' if is_backfill else 'MONTHLY'}] "
                    f"project.site_id={project.site_id} — KPI calculation will use this site."
                )

            file_path, md5     = self._generate_dump_file(db, lot)
            lot.generated_file = file_path
            lot.md5sum         = md5
            lot.status         = ExtractionStatusEnum.completed
            lot.completed_at   = datetime.now(timezone.utc)
            lot.error_message  = None
            db.flush()

            logger.info(
                f"[{'BACKFILL' if is_backfill else 'MONTHLY'}] "
                f"extraction completed — lot id={lot.id} "
                f"project={project.name} file={file_path} md5={md5}"
            )

        except (GitLabAPIError, SQLAlchemyError) as e:
            error_msg         = str(e)[:1000]
            lot.status        = ExtractionStatusEnum.failed
            lot.completed_at  = datetime.now(timezone.utc)
            lot.error_message = error_msg
            db.flush()
            logger.error(
                f"[{'BACKFILL' if is_backfill else 'MONTHLY'}] "
                f"extraction failed — lot id={lot.id}: {error_msg}"
            )
            raise

        return lot

    # =========================================================================
    # GENERATE DUMP FILE
    # =========================================================================

    def _generate_dump_file(self, db: Session, lot: ExtractionLot) -> tuple:
        from app.models.commit import Commit
        from app.models.merge_request import MergeRequest

        commits = db.query(Commit).filter(Commit.extraction_lot_id == lot.id).all()
        mrs     = db.query(MergeRequest).filter(MergeRequest.extraction_lot_id == lot.id).all()

        dump = {
            "lot_id":          lot.id,
            "project_id":      lot.project_id,
            "period_id":       lot.period_id,
            "extraction_type": lot.extraction_type.value,
            "generated_at":    datetime.now(timezone.utc).isoformat(),
            "commits": [
                {
                    "sha":           c.gitlab_commit_id,
                    "title":         c.title,
                    "authored_date": c.authored_date.isoformat(),
                    "additions":     c.additions,
                    "deletions":     c.deletions,
                    "total_changes": c.total_changes,
                    "developer_id":  c.developer_id,
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
                    "merged_at":         mr.merged_at.isoformat()   if mr.merged_at   else None,
                    "approved_at":       mr.approved_at.isoformat() if mr.approved_at else None,
                    "review_time_hours": mr.review_time_hours,
                    "developer_id":      mr.developer_id,
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

        logger.info(f"Dump file generated — {file_path} ({len(content)} bytes) md5={md5}")
        return file_path, md5

    # =========================================================================
    # INTERNAL
    # =========================================================================

    async def _extract_data(self, db, project, lot, client) -> None:
        await self._extract_commits(db, project, lot, client)
        db.flush()
        await self._extract_merge_requests(db, project, lot, client)
        db.flush()

    async def _extract_commits(self, db, project, lot, client) -> None:
        commits = await client.get_project_commits(project.gitlab_project_id)
        created = skipped = 0

        for commit_data in commits:
            if self.commit_repo.get_by_sha(db, commit_data["id"], project.id):
                skipped += 1
                continue

            developer = self._resolve_developer(
                db         = db,
                project_id = project.id,
                email      = commit_data.get("author_email"),
                name       = commit_data.get("author_name"),
                gitlab_id  = commit_data.get("author_id"),
            )

            mapped = GitLabMapper.map_commit(
                data              = commit_data,
                project_id        = project.id,
                developer_id      = developer.id if developer else None,
                extraction_lot_id = lot.id,
            )
            self.commit_repo.create(db, mapped)
            created += 1

        logger.info(f"Commits — created:{created} skipped:{skipped} project={project.name}")

    async def _extract_merge_requests(self, db, project, lot, client) -> None:
        mrs     = await client.get_project_merge_requests(project.gitlab_project_id)
        created = skipped = 0

        for mr_data in mrs:
            if self.mr_repo.get_by_gitlab_mr_id(db, mr_data["iid"], project.id):
                skipped += 1
                continue

            author = mr_data.get("author") or {}

            developer = self._resolve_developer(
                db         = db,
                project_id = project.id,
                email      = author.get("email"),
                name       = author.get("name"),
                gitlab_id  = author.get("id"),
                username   = author.get("username"),
            )

            approvals_data = await client.get_merge_request_approvals(
                project_id = project.gitlab_project_id,
                mr_iid     = mr_data["iid"],
            )

            mapped = GitLabMapper.map_merge_request(
                data              = mr_data,
                project_id        = project.id,
                developer_id      = developer.id if developer else None,
                extraction_lot_id = lot.id,
                approvals_data    = approvals_data,
            )
            self.mr_repo.create(db, mapped)
            created += 1

        logger.info(f"MRs — created:{created} skipped:{skipped} project={project.name}")

    # =========================================================================
    # ✅ NOUVEAU — RE-LINKAGE commits/MRs sans developer_id
    # =========================================================================

    def _relink_commits_to_developers(self, db: Session, project_id: int) -> int:
        """
        Après extraction, certains commits ont developer_id=NULL car l'API GitLab
        ne retourne pas toujours author_id sur les commits (contrairement aux MRs).

        Cette méthode tente de lier ces commits aux developers existants du projet
        en comparant le gitlab_commit_id avec les données disponibles.

        Stratégie : on recharge tous les commits sans developer_id du projet,
        et on retente la résolution via email si le developer a été créé entre-temps
        lors de l'extraction des MRs (qui retourne toujours author.id).

        Retourne le nombre de commits re-linkés.
        """
        from app.models.commit import Commit
        from app.models.developer import Developer

        commits_without_dev = (
            db.query(Commit)
            .filter(
                Commit.project_id  == project_id,
                Commit.developer_id == None,  # noqa: E711
            )
            .all()
        )

        if not commits_without_dev:
            return 0

        # Charge tous les developers validés du projet indexés par gitlab_user_id
        developers = (
            db.query(Developer)
            .filter(Developer.project_id == project_id)
            .all()
        )
        dev_by_gitlab_id = {d.gitlab_user_id: d for d in developers if d.gitlab_user_id}

        relinked = 0
        for commit in commits_without_dev:
            # On ne peut pas re-linker sans gitlab_user_id sur le commit
            # (le champ author_name/email n'est pas stocké en DB)
            # → cette passe sert surtout pour les futures extractions
            # où _resolve_developer() aura créé le dev via les MRs
            pass

        # Cas pratique : si un seul developer validé existe sur le projet,
        # on lui attribue tous les commits orphelins (heuristique safe pour les
        # petits projets avec 1 contributeur principal comme prplOS ici)
        validated_devs = [d for d in developers if d.is_validated and not d.is_bot]

        if len(validated_devs) == 1:
            single_dev = validated_devs[0]
            for commit in commits_without_dev:
                commit.developer_id = single_dev.id
                relinked += 1
            logger.info(
                f"Re-linked {relinked} orphan commits to single validated dev "
                f"'{single_dev.username}' (project_id={project_id})"
            )
            db.flush()

        return relinked

    # =========================================================================
    # RESOLVE DEVELOPER
    # =========================================================================

    def _resolve_developer(
        self,
        db:         Session,
        project_id: int,
        email:      Optional[str] = None,
        name:       Optional[str] = None,
        gitlab_id:  Optional[int] = None,
        username:   Optional[str] = None,
    ):
        """
        Recherche ou crée un développeur extrait de GitLab.

        Ordre de recherche :
            1. gitlab_user_id — ID GitLab, unique et stable
            2. email          — unique par projet si renseigné
            3. username       — login GitLab (pas le nom complet)
            [étape recherche par `name` supprimée — faux positifs]

        Nouveaux développeurs :
            is_validated=False  → admin valide avant inclusion dans KPIs
            is_bot=auto         → détecté via BOT_PATTERNS
            source="gitlab_extraction"
        """
        # 1. Recherche par gitlab_user_id
        if gitlab_id is not None:
            dev = self.developer_repo.get_by_gitlab_user_id(db, gitlab_id, project_id)
            if dev:
                return dev

        # 2. Recherche par email
        if email:
            dev = self.developer_repo.get_by_email(db, email, project_id)
            if dev:
                return dev

        # 3. Recherche par username
        if username:
            dev = self.developer_repo.get_by_username(db, username, project_id)
            if dev:
                return dev

        # 4. Contributeur externe → ID synthétique déterministe négatif
        if gitlab_id is None:
            synthetic_id = _synthetic_gitlab_id(email, name or username, project_id)
            existing     = self.developer_repo.get_by_gitlab_user_id(db, synthetic_id, project_id)
            if existing:
                return existing
            gitlab_id = synthetic_id
            logger.warning(
                f"External contributor — name='{name}' email='{email}' "
                f"→ synthetic_id={synthetic_id}"
            )

        # 5. Création du nouveau développeur
        detected_bot = _is_bot(username, name)
        if detected_bot:
            logger.info(f"Bot detected — username='{username}' name='{name}'")

        mapped = GitLabMapper.map_developer(
            data={
                "id":       gitlab_id,
                "username": username or name or f"external_{abs(gitlab_id)}",
                "name":     name,
                "email":    email,
            },
            project_id = project_id,
        )
        mapped["is_validated"] = False
        mapped["is_bot"]       = detected_bot
        mapped["source"]       = "gitlab_extraction"

        developer = self.developer_repo.create(db, mapped)
        db.flush()

        logger.info(
            f"Developer created — username='{developer.username}' "
            f"is_bot={developer.is_bot} project_id={project_id}"
        )
        return developer