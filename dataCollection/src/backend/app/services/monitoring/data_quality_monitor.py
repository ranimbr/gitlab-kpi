"""
Data Quality Monitoring Service

Monitors data quality issues and generates alerts for:
- MRs with commits_count = 0 (indicates extraction bug)
- MRs with missing required fields
- Commits without proper developer matching
"""

import logging
from datetime import datetime, timedelta
from sqlalchemy import func, and_
from sqlalchemy.orm import Session

from app.models.merge_request import MergeRequest
from app.models.commit import Commit
from app.models.developer import Developer

logger = logging.getLogger(__name__)


class DataQualityMonitor:
    
    def __init__(self, db: Session):
        self.db = db
    
    def check_mr_commits_count_quality(self, project_id: int = None, days: int = 30) -> dict:
        """
        Check for MRs with commits_count = 0 or NULL.
        This indicates a potential extraction bug affecting KPI #8 (avg_commits_per_mr).
        
        Returns:
            dict: {
                "total_mrs_checked": int,
                "mrs_with_zero_commits": int,
                "mrs_with_null_commits": int,
                "affected_mrs": list,
                "severity": "low|medium|high"
            }
        """
        since_date = datetime.now() - timedelta(days=days)
        
        query = self.db.query(MergeRequest).filter(
            MergeRequest.created_at_gitlab >= since_date,
            MergeRequest.is_draft.is_(False)
        )
        
        if project_id:
            query = query.filter(MergeRequest.project_id == project_id)
        
        total_mrs = query.count()
        
        # MRs with commits_count = 0
        zero_commits = query.filter(MergeRequest.commits_count == 0).all()
        
        # MRs with commits_count NULL (should not happen after constraint)
        null_commits = query.filter(MergeRequest.commits_count.is_(None)).all()
        
        affected_mrs = []
        for mr in zero_commits + null_commits:
            affected_mrs.append({
                "id": mr.id,
                "gitlab_mr_id": mr.gitlab_mr_id,
                "title": mr.title,
                "project_id": mr.project_id,
                "created_at": mr.created_at_gitlab.isoformat() if mr.created_at_gitlab else None,
                "commits_count": mr.commits_count,
                "issue": "zero" if mr.commits_count == 0 else "null"
            })
        
        # Determine severity based on percentage affected
        affected_count = len(affected_mrs)
        if total_mrs > 0:
            affected_percentage = (affected_count / total_mrs) * 100
        else:
            affected_percentage = 0
        
        if affected_percentage > 20:
            severity = "high"
        elif affected_percentage > 5:
            severity = "medium"
        else:
            severity = "low"
        
        result = {
            "total_mrs_checked": total_mrs,
            "mrs_with_zero_commits": len(zero_commits),
            "mrs_with_null_commits": len(null_commits),
            "affected_mrs": affected_mrs,
            "affected_percentage": round(affected_percentage, 2),
            "severity": severity,
            "check_date": datetime.now().isoformat()
        }
        
        if severity in ["medium", "high"]:
            logger.warning(
                f"Data Quality Alert: {affected_count} MRs ({affected_percentage}%) "
                f"with invalid commits_count in last {days} days. "
                f"Severity: {severity}"
            )
        
        return result
    
    def check_unmatched_developers(self, project_id: int = None, days: int = 30) -> dict:
        """
        Check for MRs without developer matching (developer_id is NULL).
        This affects KPI accuracy and developer attribution.
        """
        since_date = datetime.now() - timedelta(days=days)
        
        query = self.db.query(MergeRequest).filter(
            MergeRequest.created_at_gitlab >= since_date,
            MergeRequest.is_draft.is_(False),
            MergeRequest.developer_id.is_(None)
        )
        
        if project_id:
            query = query.filter(MergeRequest.project_id == project_id)
        
        unmatched_mrs = query.all()
        
        result = {
            "unmatched_count": len(unmatched_mrs),
            "unmatched_mrs": [
                {
                    "id": mr.id,
                    "gitlab_mr_id": mr.gitlab_mr_id,
                    "title": mr.title,
                    "author_name": mr.author_name,
                    "created_at": mr.created_at_gitlab.isoformat() if mr.created_at_gitlab else None
                }
                for mr in unmatched_mrs[:50]  # Limit to 50 for performance
            ],
            "check_date": datetime.now().isoformat()
        }
        
        if len(unmatched_mrs) > 0:
            logger.warning(f"Data Quality Alert: {len(unmatched_mrs)} MRs without developer matching")
        
        return result
    
    def generate_data_quality_report(self, project_id: int = None) -> dict:
        """
        Generate comprehensive data quality report.
        """
        logger.info(f"Generating data quality report for project_id={project_id}")
        
        report = {
            "timestamp": datetime.now().isoformat(),
            "project_id": project_id,
            "checks": {
                "mr_commits_count": self.check_mr_commits_count_quality(project_id, days=90),
                "unmatched_developers": self.check_unmatched_developers(project_id, days=90)
            }
        }
        
        # Overall health score
        total_issues = (
            report["checks"]["mr_commits_count"]["affected_mrs_count"] if "affected_mrs_count" in report["checks"]["mr_commits_count"] else len(report["checks"]["mr_commits_count"]["affected_mrs"]) +
            report["checks"]["unmatched_developers"]["unmatched_count"]
        )
        
        if total_issues == 0:
            report["overall_health"] = "excellent"
        elif total_issues < 10:
            report["overall_health"] = "good"
        elif total_issues < 50:
            report["overall_health"] = "fair"
        else:
            report["overall_health"] = "poor"
        
        return report
