import hashlib
import json
import logging
import os
from datetime import datetime, timezone
from pathlib import Path
from typing import Optional

from sqlalchemy.exc import SQLAlchemyError
from sqlalchemy.orm import Session

from app.models.extraction_lot import (
    ExtractionLot,
    ExtractionStatusEnum,
    ExtractionTypeEnum,
)
from app.models.gitlab_config import GitLabConfig
from app.repositories.commit_repository import CommitRepository
from app.repositories.developer_repository import DeveloperRepository
from app.repositories.extraction_lot_repository import ExtractionLotRepository
from app.repositories.merge_request_repository import MergeRequestRepository
from app.repositories.period_repository import PeriodRepository
from app.repositories.project_repository import ProjectRepository
from app.services.gitlab.gitlab_client import GitLabAPIError, GitLabClient
from app.services.gitlab.gitlab_mapper import GitLabMapper

logger = logging.getLogger(__name__)

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

        from fastapi import HTTPException, status

        now    = datetime.now(timezone.utc)
        period = self.period_repo.get_or_create(db, now.year, now.month)

        if not self.period_repo.is_open(db, period.id):
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail=(
                    f"Period {period.year}/{period.month:02d} is closed. "
                    f"No REALTIME extraction allowed (RG-01)."
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
            type         = ExtractionTypeEnum.REALTIME,
            status       = ExtractionStatusEnum.running,
            period_id    = period.id,
            project_id   = project.id,
            triggered_by = triggered_by_user,
        )
        db.add(lot)
        db.flush()

        try:
            client = GitLabClient(gitlab_config)
            await self._extract_data(db, project, lot, client)

            lot.status        = ExtractionStatusEnum.completed
            lot.completed_at  = datetime.now(timezone.utc)
            lot.error_message = None   # ✅ reset si re-run
            db.commit()

            logger.info(
                f"REALTIME extraction completed — lot id={lot.id} "
                f"project={project.name}"
            )

        except (GitLabAPIError, SQLAlchemyError) as e:
            db.rollback()
            # ✅ Sauvegarde du message d'erreur
            error_msg = str(e)[:1000]
            try:
                lot.status        = ExtractionStatusEnum.failed
                lot.completed_at  = datetime.now(timezone.utc)
                lot.error_message = error_msg   # ✅ AJOUT
                db.add(lot)
                db.commit()
            except Exception:
                pass
            logger.error(
                f"REALTIME extraction failed — lot id={lot.id}: {error_msg}"
            )
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
    ) -> ExtractionLot:

        from fastapi import HTTPException, status

        project = self.project_repo.get_by_id(db, project_id)
        if not project:
            raise ValueError(f"Project id={project_id} not found")

        if self.lot_repo.monthly_exists(db, period_id, project_id):
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail=(
                    f"A MONTHLY extraction already exists for "
                    f"project_id={project_id} period_id={period_id}."
                ),
            )

        lot = ExtractionLot(
            type       = ExtractionTypeEnum.MONTHLY,
            status     = ExtractionStatusEnum.running,
            period_id  = period_id,
            project_id = project.id,
        )
        db.add(lot)
        db.flush()

        try:
            client = GitLabClient(gitlab_config)
            await self._extract_data(db, project, lot, client)

            file_path, md5     = self._generate_dump_file(db, lot)
            lot.generated_file = file_path
            lot.md5sum         = md5
            lot.status         = ExtractionStatusEnum.completed
            lot.completed_at   = datetime.now(timezone.utc)
            lot.error_message  = None   # ✅ reset
            db.flush()

            logger.info(
                f"MONTHLY extraction completed — lot id={lot.id} "
                f"project={project.name} file={file_path} md5={md5}"
            )

        except (GitLabAPIError, SQLAlchemyError) as e:
            # ✅ Sauvegarde du message d'erreur
            error_msg         = str(e)[:1000]
            lot.status        = ExtractionStatusEnum.failed
            lot.completed_at  = datetime.now(timezone.utc)
            lot.error_message = error_msg   # ✅ AJOUT
            db.flush()
            logger.error(
                f"MONTHLY extraction failed — lot id={lot.id}: {error_msg}"
            )
            raise

        return lot

    # =========================================================================
    # GENERATE DUMP FILE (RG-04)
    # =========================================================================

    def _generate_dump_file(self, db: Session, lot: ExtractionLot) -> tuple:
        from app.models.commit import Commit
        from app.models.merge_request import MergeRequest

        commits = (
            db.query(Commit)
            .filter(Commit.extraction_lot_id == lot.id)
            .all()
        )
        mrs = (
            db.query(MergeRequest)
            .filter(MergeRequest.extraction_lot_id == lot.id)
            .all()
        )

        dump = {
            "lot_id":       lot.id,
            "project_id":   lot.project_id,
            "period_id":    lot.period_id,
            "type":         lot.type.value,
            "generated_at": datetime.now(timezone.utc).isoformat(),
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
                    "gitlab_mr_id":    mr.gitlab_mr_id,
                    "title":           mr.title,
                    "state":           mr.state,
                    "is_draft":        mr.is_draft,
                    "approved":        mr.approved,
                    "merged_at":       mr.merged_at.isoformat() if mr.merged_at else None,
                    "time_to_approve": mr.time_to_approve,
                    "developer_id":    mr.developer_id,
                }
                for mr in mrs
            ],
        }

        content   = json.dumps(dump, ensure_ascii=False, indent=2)
        md5       = hashlib.md5(content.encode("utf-8")).hexdigest()
        dump_dir  = Path("dumps")
        dump_dir.mkdir(exist_ok=True)
        file_name = f"lot_{lot.id}_project_{lot.project_id}_period_{lot.period_id}.json"
        file_path = str(dump_dir / file_name)

        with open(file_path, "w", encoding="utf-8") as f:
            f.write(content)

        return file_path, md5

    # =========================================================================
    # COMMON EXTRACTION
    # =========================================================================

    async def _extract_data(self, db, project, lot, client) -> None:
        await self._extract_commits(db, project, lot, client)
        db.flush()
        await self._extract_merge_requests(db, project, lot, client)
        db.flush()

    # =========================================================================
    # COMMITS
    # =========================================================================

    async def _extract_commits(self, db, project, lot, client) -> None:
        commits  = await client.get_project_commits(project.gitlab_project_id)
        created  = skipped = 0

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

        logger.info(
            f"Commits — created:{created} skipped:{skipped} project={project.name}"
        )

    # =========================================================================
    # MERGE REQUESTS
    # =========================================================================

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

        logger.info(
            f"MRs — created:{created} skipped:{skipped} project={project.name}"
        )

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
        developer = None

        if gitlab_id is not None:
            developer = self.developer_repo.get_by_gitlab_user_id(
                db, gitlab_id, project_id
            )
            if developer:
                return developer

        if not developer and email:
            developer = self.developer_repo.get_by_email(db, email, project_id)
            if developer:
                return developer

        if not developer and username:
            developer = self.developer_repo.get_by_username(
                db, username, project_id
            )
            if developer:
                return developer

        if not developer and name:
            developer = self.developer_repo.get_by_username(
                db, name, project_id
            )
            if developer:
                return developer

        if gitlab_id is None:
            gitlab_id = _synthetic_gitlab_id(email, name or username, project_id)
            logger.warning(
                f"Author without GitLab account — "
                f"name='{name}' email='{email}' → synthetic_id={gitlab_id}"
            )
            existing = self.developer_repo.get_by_gitlab_user_id(
                db, gitlab_id, project_id
            )
            if existing:
                return existing

        mapped = GitLabMapper.map_developer(
            data={
                "id":       gitlab_id,
                "username": username or name or f"external_{abs(gitlab_id)}",
                "name":     name,
                "email":    email,
            },
            project_id=project_id,
        )

        developer = self.developer_repo.create(db, mapped)
        db.flush()
        return developer