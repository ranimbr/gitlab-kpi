from sqlalchemy.orm import Session, joinedload
from sqlalchemy import func
from app.models.commit import Commit
from typing import List, Optional


class CommitRepository:

    def get_project_commits_paginated(
        self,
        db:         Session,
        project_id: int,
        limit:      int = 50,
        offset:     int = 0,
    ) -> List[Commit]:
        """
        [FIX] joinedload(developer) → CommitResponse.developer est populé
        ce qui permet à CommitsPage d'afficher author/site correctement.
        """
        return (
            db.query(Commit)
            .options(joinedload(Commit.developer))
            .filter(Commit.project_id == project_id)
            .order_by(Commit.authored_date.desc())
            .limit(limit)
            .offset(offset)
            .all()
        )

    def get_by_sha(
        self,
        db:         Session,
        sha:        str,
        project_id: int,
    ) -> Optional[Commit]:
        return (
            db.query(Commit)
            .filter(
                Commit.gitlab_commit_id == sha,
                Commit.project_id       == project_id,
            )
            .first()
        )

    def create(self, db: Session, data: dict) -> Commit:
        commit = Commit(**data)
        db.add(commit)
        db.flush()
        return commit