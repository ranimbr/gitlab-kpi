"""
Diagnostic complet : Audit de l'état de la base de données.
Identifie pourquoi les snapshots affichent 0 commits.
"""
from app.database.session import SessionLocal
from app.models.commit import Commit
from app.models.merge_request import MergeRequest
from app.models.project import Project
from app.models.site import Site
from app.models.developer import Developer
from app.models.kpi_snapshot import KpiSnapshot
from app.models.project_site import ProjectSite
from sqlalchemy import func

db = SessionLocal()
try:
    # 1. Projets existants
    projects = db.query(Project.id, Project.name, Project.is_active).all()
    print("=== PROJETS ===")
    for p in projects:
        print(f"  ID={p.id} | {p.name} | active={p.is_active}")

    # 2. Sites existants
    sites = db.query(Site.id, Site.name).all()
    print("\n=== SITES ===")
    for s in sites:
        print(f"  ID={s.id} | {s.name}")

    # 3. Liens Project-Site
    links = db.query(ProjectSite.project_id, ProjectSite.site_id).all()
    print("\n=== LIENS PROJECT-SITE ===")
    for l in links:
        print(f"  project_id={l.project_id} -> site_id={l.site_id}")

    # 4. Commits par projet (ALL, including merge)
    print("\n=== COMMITS PAR PROJET ===")
    rows = db.query(Commit.project_id, func.count(Commit.id).label("n"),
                    func.count(Commit.id).filter(Commit.is_merge_commit == False).label("real")
                    ).group_by(Commit.project_id).all()
    for r in rows:
        print(f"  project_id={r.project_id} | total={r.n} | real_commits={r.real}")

    # 5. Commits par site
    print("\n=== COMMITS PAR SITE ===")
    rows = db.query(Commit.site_id, func.count(Commit.id).label("n")
                    ).filter(Commit.is_merge_commit == False
                    ).group_by(Commit.site_id).all()
    for r in rows:
        print(f"  site_id={r.site_id} | commits={r.n}")

    # 6. MRs par projet
    print("\n=== MRs PAR PROJET ===")
    rows = db.query(MergeRequest.project_id, func.count(MergeRequest.id).label("n")
                    ).group_by(MergeRequest.project_id).all()
    for r in rows:
        print(f"  project_id={r.project_id} | MRs={r.n}")

    # 7. Développeurs
    devs = db.query(Developer.id, Developer.name, Developer.gitlab_username).limit(5).all()
    print("\n=== DEVELOPERS (5 premiers) ===")
    for d in devs:
        print(f"  ID={d.id} | {d.name} | gitlab={d.gitlab_username}")

    # 8. Snapshots existants
    print("\n=== SNAPSHOTS (tous) ===")
    snaps = db.query(
        KpiSnapshot.project_id, KpiSnapshot.site_id, KpiSnapshot.snapshot_date,
        KpiSnapshot.total_commits, KpiSnapshot.total_mrs_created
    ).order_by(KpiSnapshot.snapshot_date.desc()).limit(10).all()
    for s in snaps:
        print(f"  project={s.project_id} | site={s.site_id} | date={s.snapshot_date} | commits={s.total_commits} | MRs={s.total_mrs_created}")

except Exception as e:
    import traceback
    traceback.print_exc()
finally:
    db.close()
