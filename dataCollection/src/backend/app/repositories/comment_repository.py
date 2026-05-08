"""
repositories/comment_repository.py


"""

from typing import List, Optional
from sqlalchemy.orm import Session
from app.models.comment import Comment
from app.repositories.base import BaseRepository


class CommentRepository(BaseRepository[Comment]):
    def __init__(self):
        super().__init__(Comment)

    def get_by_gitlab_id(self, db: Session, gitlab_id: int) -> Optional[Comment]:
        return db.query(Comment).filter(Comment.gitlab_id == gitlab_id).first()

    def create_if_not_exists(self, db: Session, data: dict) -> Comment:
        """
        Dédoublonnage par gitlab_id avant création.
        """
        existing = self.get_by_gitlab_id(db, data["gitlab_id"])
        if existing:
            return existing
        
        new_comment = Comment(**data)
        db.add(new_comment)
        db.flush()
        return new_comment
