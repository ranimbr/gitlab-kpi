import sys
import os
from datetime import date
from sqlalchemy.orm import sessionmaker

# Ensure backend path is in sys.path
sys.path.append(os.path.dirname(os.path.abspath(__file__)))
sys.path.append(os.path.join(os.path.dirname(os.path.abspath(__file__)), '..'))

from app.database.session import get_engine_for_db
from app.models.site import Site
from app.models.project import Project
from app.models.developer_group import DeveloperGroup, DeveloperGroupLink
from app.models.developer import Developer
from app.models.developer_site import DeveloperSite
from app.models.developer_project import DeveloperProject
from app.models.project_site import ProjectSite
from app.models.period import Period, PeriodStatusEnum

def seed_admin_only():
    """Create only the admin user in auth_db"""
    print("Connecting to auth_db...")
    engine = get_engine_for_db("auth_db")
    SessionLocal = sessionmaker(bind=engine, autoflush=False, autocommit=False)
    db = SessionLocal()
    
    print("Creating admin user in auth_db...")
    from app.core.seed_data import seed_admin_user
    seed_admin_user(db, "admin@test.com", "Admin1234!")
    db.commit()
    print("Admin user created in auth_db!")
    db.close()

def seed_telnet_data():
    print("Connecting to gitlab_kpi1...")
    engine = get_engine_for_db("gitlab_kpi1")
    SessionLocal = sessionmaker(bind=engine, autoflush=False, autocommit=False)
    db = SessionLocal()

    print("Seeding sites...")
    sites_info = {
        "Tunis": {"country": "Tunisia", "timezone": "Africa/Tunis"},
        "Paris": {"country": "France", "timezone": "Europe/Paris"}
    }
    site_objs = {}
    for name, info in sites_info.items():
        site = db.query(Site).filter(Site.name == name).first()
        if not site:
            site = Site(name=name, country=info["country"], timezone=info["timezone"], is_active=True)
            db.add(site)
            db.flush()
            print(f"Created site: {name}")
        site_objs[name] = site

    print("Seeding projects...")
    projects_info = {
        "KPN": {"gitlab_project_id": 101},
        "OFR": {"gitlab_project_id": 102},
        "OPL": {"gitlab_project_id": 103},
        "REP": {"gitlab_project_id": 104},
        "OSP": {"gitlab_project_id": 105}
    }
    project_objs = {}
    for name, info in projects_info.items():
        project = db.query(Project).filter(Project.name == name).first()
        if not project:
            project = Project(
                name=name,
                gitlab_project_id=info["gitlab_project_id"],
                path=name.lower(),
                namespace="telnet",
                description=f"Project {name}",
                is_active=True
            )
            db.add(project)
            db.flush()
            print(f"Created project: {name}")
        project_objs[name] = project

    print("Seeding groups...")
    groups_info = ["OPE", "FT", "INTEG"]
    group_objs = {}
    for name in groups_info:
        group = db.query(DeveloperGroup).filter(DeveloperGroup.name == name).first()
        if not group:
            group = DeveloperGroup(name=name, description=f"Group {name}")
            db.add(group)
            db.flush()
            print(f"Created group: {name}")
        group_objs[name] = group

    print("Seeding periods...")
    periods_info = [
        {"year": 2026, "month": 3},
        {"year": 2026, "month": 4}
    ]
    for p in periods_info:
        period = db.query(Period).filter(Period.year == p["year"], Period.month == p["month"]).first()
        if not period:
            period = Period(year=p["year"], month=p["month"], status=PeriodStatusEnum.open)
            db.add(period)
            db.flush()
            print(f"Created period: {p['year']}-{p['month']}")

    import csv
    devs_to_seed = []
    csv_path = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', '..', 'developers_telnet.csv')
    with open(csv_path, mode='r', encoding='utf-8-sig') as f:
        reader = csv.DictReader(f)
        for row in reader:
            if row.get('name'):
                devs_to_seed.append({
                    "name": row['name'],
                    "email": row['email'],
                    "gitlab_username": row['gitlab_username'],
                    "site": row['sites'],
                    "project": row['projects'],
                    "group": row['group']
                })

    print("Seeding developers...")
    start_gitlab_id = 2001
    for idx, d_data in enumerate(devs_to_seed):
        email = d_data["email"]
        dev = db.query(Developer).filter(Developer.email == email).first()
        if not dev:
            dev = Developer(
                name=d_data["name"],
                email=email,
                gitlab_username=d_data["gitlab_username"],
                gitlab_user_id=start_gitlab_id + idx,
                is_active=True,
                is_validated=True,
                is_bot=False,
                is_external=True if "ext" in d_data["gitlab_username"] else False,
                auto_created=False,
                source="csv_import",
                onboarding_date=date(2026, 1, 1)
            )
            db.add(dev)
            db.flush()
            print(f"Created developer: {dev.name} ({dev.email})")

            # Link Site
            site = site_objs[d_data["site"]]
            dev_site = DeveloperSite(
                developer_id=dev.id,
                site_id=site.id,
                is_primary=True,
                is_active=True,
                start_date=date(2026, 1, 1)
            )
            db.add(dev_site)

            # Link Project
            project = project_objs[d_data["project"]]
            dev_project = DeveloperProject(
                developer_id=dev.id,
                project_id=project.id,
                is_active=True,
                start_date=date(2026, 1, 1)
            )
            db.add(dev_project)

            # Link Group
            group = group_objs[d_data["group"]]
            dev_group = DeveloperGroupLink(
                developer_id=dev.id,
                group_id=group.id,
                is_active=True,
                is_primary=True,
                start_date=date(2026, 1, 1)
            )
            db.add(dev_group)

            # Ensure ProjectSite is linked
            proj_site = db.query(ProjectSite).filter(
                ProjectSite.project_id == project.id,
                ProjectSite.site_id == site.id
            ).first()
            if not proj_site:
                proj_site = ProjectSite(
                    project_id=project.id,
                    site_id=site.id
                )
                db.add(proj_site)

    db.commit()
    print("Done Seeding telnetdb!")
    db.close()

if __name__ == "__main__":
    import sys
    if len(sys.argv) > 1 and sys.argv[1] == "admin-only":
        seed_admin_only()
    else:
        seed_telnet_data()
