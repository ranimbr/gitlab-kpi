"""
Backfill script to update commits_count for existing MRs from GitLab API.
Run this after fixing the extraction bug to populate historical data.
"""
import asyncio
import sys
from sqlalchemy import create_engine, text
from sqlalchemy.orm import sessionmaker
from app.core.config import Settings
from app.services.gitlab.gitlab_client import GitLabClient
from app.models.merge_request import MergeRequest
from app.models.project import Project


async def backfill_commits_count():
    """Update commits_count for all MRs that have 0 or NULL value."""
    settings = Settings()
    
    # Database connection
    engine = create_engine(
        f"postgresql://{settings.POSTGRES_USER}:{settings.POSTGRES_PASSWORD}@{settings.POSTGRES_HOST}:{settings.POSTGRES_PORT}/gitlab_kpi1"
    )
    Session = sessionmaker(bind=engine)
    db = Session()
    
    # GitLab client
    gitlab_client = GitLabClient(
        gitlab_url=settings.GITLAB_URL,
        gitlab_token=settings.GITLAB_TOKEN
    )
    
    try:
        # Find all MRs with commits_count = 0 or NULL
        mrs_to_update = db.query(MergeRequest).filter(
            (MergeRequest.commits_count == 0) | (MergeRequest.commits_count.is_(None)),
            MergeRequest.is_draft.is_(False)
        ).all()
        
        print(f"Found {len(mrs_to_update)} MRs to update")
        
        if not mrs_to_update:
            print("No MRs need updating. Exiting.")
            return
        
        # Group by project to minimize GitLab API calls
        from collections import defaultdict
        mrs_by_project = defaultdict(list)
        for mr in mrs_to_update:
            mrs_by_project[mr.project_id].append(mr)
        
        updated_count = 0
        error_count = 0
        
        for project_id, mrs in mrs_by_project.items():
            project = db.query(Project).filter(Project.id == project_id).first()
            if not project:
                print(f"⚠️  Project {project_id} not found, skipping {len(mrs)} MRs")
                error_count += len(mrs)
                continue
            
            print(f"\n📦 Processing project: {project.name} (ID: {project_id}) - {len(mrs)} MRs")
            
            for mr in mrs:
                try:
                    # Fetch MR detail from GitLab API
                    mr_detail = await gitlab_client.get_merge_request_detail(
                        project.gitlab_project_id, 
                        mr.gitlab_mr_id
                    )
                    
                    if mr_detail and mr_detail.get("commits_count") is not None:
                        mr.commits_count = mr_detail["commits_count"]
                        db.commit()
                        updated_count += 1
                        print(f"  ✅ MR !{mr.gitlab_mr_id}: {mr.commits_count} commits")
                    else:
                        print(f"  ⚠️  MR !{mr.gitlab_mr_id}: No commits_count in API response")
                        error_count += 1
                        
                except Exception as e:
                    print(f"  ❌ MR !{mr.gitlab_mr_id}: Error - {str(e)}")
                    error_count += 1
                    db.rollback()
        
        print(f"\n{'='*60}")
        print(f"Backfill complete:")
        print(f"  ✅ Updated: {updated_count} MRs")
        print(f"  ❌ Errors:  {error_count} MRs")
        print(f"{'='*60}")
        
    except Exception as e:
        print(f"Fatal error: {str(e)}")
        db.rollback()
    finally:
        db.close()
        engine.dispose()


if __name__ == "__main__":
    asyncio.run(backfill_commits_count())
