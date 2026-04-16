from app.database.session import SessionLocal
from app.models.project_site import ProjectSite
from app.services.kpi.kpi_aggregator import KpiAggregator
import logging

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

db = SessionLocal()
try:
    # 1. Link Project 19 to Tunis(6) and Paris(8)
    for s_id in [6, 8]:
        exists = db.query(ProjectSite).filter_by(project_id=19, site_id=s_id).first()
        if not exists:
            db.add(ProjectSite(project_id=19, site_id=s_id))
            logger.info(f"Linked Project 19 to Site {s_id}")
    db.commit()

    # 2. Generate Snapshots
    aggregator = KpiAggregator(db)
    for year, month in [(2026, 3), (2026, 4)]:
        logger.info(f"Generating snapshots for {year}-{month:02d}...")
        snaps = aggregator.generate_monthly_snapshots(19, year, month)
        logger.info(f"Created {len(snaps)} snapshots for {year}-{month:02d}")
    
    db.commit()
    logger.info("Database seeding completed.")
except Exception as e:
    db.rollback()
    logger.error(f"Error seeding database: {e}")
finally:
    db.close()
