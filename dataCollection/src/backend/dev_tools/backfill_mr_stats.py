import asyncio
import logging
from sqlalchemy.orm import Session
from app.database.session import SessionLocal
from app.models.merge_request import MergeRequest
from app.models.gitlab_config import GitLabConfig
from app.services.gitlab.gitlab_client import GitLabClient
from app.services.gitlab.gitlab_mapper import GitLabMapper
from app.repositories.project_repository import ProjectRepository

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger("backfill")

async def backfill_mrs():
    db = SessionLocal()
    try:
        # 1. Fetch all MRs with their periods (joined for speed)
        from app.models.extraction_lot import ExtractionLot
        from app.models.period import Period
        from datetime import datetime, timezone
        import calendar

        mrs = db.query(MergeRequest).join(ExtractionLot).join(Period).all()
        logger.info(f"Found {len(mrs)} MRs to check with temporal filtering.")

        # Group by project
        project_ids = list(set(mr.project_id for mr in mrs))
        project_repo = ProjectRepository()
        
        for p_id in project_ids:
            project = project_repo.get_by_id(db, p_id)
            if not project or not project.gitlab_config:
                continue
            
            client = GitLabClient(project.gitlab_config)
            project_mrs = [m for m in mrs if m.project_id == p_id]
            logger.info(f"Processing {len(project_mrs)} MRs for project {project.name}")

            for mr in project_mrs:
                logger.info(f"  Updating MR !{mr.gitlab_mr_id} (Period: {mr.extraction_lot.period.year}/{mr.extraction_lot.period.month})...")
                try:
                    # 1. Bounds check
                    p = mr.extraction_lot.period
                    lot_start = datetime(p.year, p.month, 1, tzinfo=timezone.utc)
                    last_day = calendar.monthrange(p.year, p.month)[1]
                    lot_end = datetime(p.year, p.month, last_day, 23, 59, 59, tzinfo=timezone.utc)

                    def is_in_period(dt_str: str) -> bool:
                        try:
                            dt = datetime.fromisoformat(dt_str.replace("Z", "+00:00"))
                            return lot_start <= dt <= lot_end
                        except: return False

                    # Fetch Detail
                    detail = await client.get_merge_request_detail(project.gitlab_project_id, mr.gitlab_mr_id)
                    author_data = detail.get("author", {})
                    a_name = author_data.get("name")
                    a_email = author_data.get("email")
                    a_username = author_data.get("username")
                    
                    # ✅ [SENIOR] Target-centric logic
                    target_ids, target_names, target_emails, target_usernames = [], [], [], []
                    
                    # Instead of the lot developer_ids (we don't have them in backfill), 
                    # we can use the local developer this MR is mapped to.
                    from app.models.developer import Developer
                    tracked_dev_id = mr.developer_id or mr.reviewer_id
                    if tracked_dev_id:
                        t_dev = db.query(Developer).filter(Developer.id == tracked_dev_id).first()
                        if t_dev:
                            if t_dev.gitlab_user_id: target_ids.append(t_dev.gitlab_user_id)
                            if t_dev.name: target_names.append(t_dev.name)
                            if t_dev.email: target_emails.append(t_dev.email)
                            if t_dev.gitlab_username: target_usernames.append(t_dev.gitlab_username)
                    
                    if not target_ids and not target_names:
                        # Fallback to MR Author
                        if author_data.get("id"): target_ids.append(author_data.get("id"))
                        if a_name: target_names.append(a_name)
                        if a_email: target_emails.append(a_email)
                        if a_username: target_usernames.append(a_username)

                    def is_target_author_commit(c: dict) -> bool:
                        return (c.get("author_name") in target_names) or (c.get("author_email") in target_emails)
                        
                    def is_target_author_note(n: dict) -> bool:
                        n_auth = n.get("author", {})
                        return (n_auth.get("id") in target_ids) or (n_auth.get("username") in target_usernames)

                    # 2. Filter Commits
                    mr_commits = await client.get_merge_request_commits(project.gitlab_project_id, mr.gitlab_mr_id)
                    filtered_commits = [
                        c for c in mr_commits 
                        if (not (c.get("title", "").lower().startswith("merge branch"))) and
                        is_target_author_commit(c) and
                        is_in_period(c.get("authored_date", ""))
                    ]
                    detail["commits_count"] = len(filtered_commits)

                    # 3. Filter Notes (Comments)
                    mr_notes = await client.get_merge_request_notes(project.gitlab_project_id, mr.gitlab_mr_id)
                    filtered_notes = [
                        n for n in mr_notes
                        if not n.get("system", False) and 
                        is_target_author_note(n) and
                        is_in_period(n.get("created_at", ""))
                    ]
                    detail["user_notes_count"] = len(filtered_notes)
                    
                    # 4. Fetch Approvals
                    approvals = await client.get_merge_request_approvals(project.gitlab_project_id, mr.gitlab_mr_id)
                    
                    if detail:
                        mapped = GitLabMapper.map_merge_request(
                            data=detail, project_id=p_id,
                            developer_id=mr.developer_id, extraction_lot_id=mr.extraction_lot_id,
                            approvals_data=approvals, reviewer_id=mr.reviewer_id
                        )
                        for key, value in mapped.items():
                            setattr(mr, key, value)
                except Exception as e:
                    logger.error(f"    Failed MR !{mr.gitlab_mr_id}: {e}")
            
            db.commit()
            
            db.commit()
            logger.info(f"Finished project {project.name}")

    finally:
        db.close()

if __name__ == "__main__":
    asyncio.run(backfill_mrs())
