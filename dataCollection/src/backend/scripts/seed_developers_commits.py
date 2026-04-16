import datetime
import random
import uuid
import sys
import os

# Ensure backend path is in sys.path
sys.path.append(os.path.dirname(os.path.abspath(__file__)))

from app.database.session import SessionLocal
from app.models.commit import Commit
from app.models.app_user import AppUser
from app.models.project import Project
from app.models.project_site import ProjectSite

def seed():
    db = SessionLocal()
    print("Creating developers and raw commits...")

    # Define developers matching CSV
    devs_data = [
        {"email": "sgerman@gitlab.com", "name": "S. German", "gid": "111", "site_id": 1, "project_id": 1},
        {"email": "sselhorn@gitlab.com", "name": "S. Selhorn", "gid": "222", "site_id": 3, "project_id": 1},
        {"email": "djoshi@gitlab.com", "name": "D. Joshi", "gid": "333", "site_id": 2, "project_id": 2},
        {"email": "jjarvis@gitlab.com", "name": "J. Jarvis", "gid": "444", "site_id": 2, "project_id": 2},
        {"email": "sselhorn2@gitlab.com", "name": "S. Selhorn", "gid": "555", "site_id": 3, "project_id": 2}, # Selhorn works on both in CSV
    ]

    dev_map = {}
    for dd in devs_data:
        # Check if dev exists, if not create
        user = db.query(AppUser).filter(AppUser.email == dd["email"]).first()
        if not user:
            user = AppUser(
                email=dd["email"],
                password_hash="fake",
                first_name=dd["name"].split(". ")[0],
                last_name=dd["name"].split(". ")[1] if ". " in dd["name"] else "Dev",
                role="developer",
                site_id=dd["site_id"],
                gitlab_user_id=dd["gid"],
                gitlab_username=dd["name"].lower().replace(". ", "")
            )
            db.add(user)
            db.commit()
            db.refresh(user)
            print(f"Created dev {user.email}")
            
        dev_map[dd["email"]] = user

    devs_p1 = [dev_map["sgerman@gitlab.com"], dev_map["sselhorn@gitlab.com"]]
    devs_p2 = [dev_map["djoshi@gitlab.com"], dev_map["jjarvis@gitlab.com"], dev_map["sselhorn2@gitlab.com"]]

    # Commit generation
    commits_to_create = []
    words = [
        "fix:", "feat:", "refactor:", "docs:", "test:", "chore:", "perf:", 
        "update database schema for", "implement API endpoint for",
        "resolve UI glitch in", "add unit tests for", "optimize query in",
        "clean up technical debt in", "update documentation for",
        "fix null pointer in", "handle edge case for"
    ]
    features = ["user dashboard", "login flow", "payment gateway", "analytics pipeline", "data model", "email service", "sidebar navigation", "API response payload"]

    def generate_random_commits(project_id, devs_group, count):
        c_list = []
        for _ in range(count):
            dev = random.choice(devs_group)
            lines_added = random.randint(5, 120)
            lines_deleted = random.randint(0, 50)
            days_ago = random.randint(1, 60)
            c_date = datetime.datetime.now(datetime.timezone.utc) - datetime.timedelta(days=days_ago)
            prefix = random.choice(words[:7])
            suffix = random.choice(words[7:])
            feature = random.choice(features)
            msg = f"{prefix} {suffix} {feature}"

            c = Commit(
                gitlab_commit_id=str(uuid.uuid4().hex),
                project_id=project_id,
                developer_id=dev.id,
                message=msg,
                created_at=c_date,
                lines_added=lines_added,
                lines_deleted=lines_deleted,
                is_merge_commit=False,
                stats={"total": lines_added + lines_deleted, "additions": lines_added, "deletions": lines_deleted}
            )
            c_list.append(c)
        return c_list

    # Delete existing commits to avoid duplicates
    db.query(Commit).delete()
    
    # Inject commits
    commits_to_create.extend(generate_random_commits(1, devs_p1, 105)) # Project 1
    commits_to_create.extend(generate_random_commits(2, devs_p2, 156)) # Project 2

    # Mix in some merge commits for project 2 to match the screenshot "Merge branch '...' into 'master'"
    for _ in range(8):
        c_date = datetime.datetime.now(datetime.timezone.utc) - datetime.timedelta(days=random.randint(1,10))
        c = Commit(
            gitlab_commit_id=str(uuid.uuid4().hex),
            project_id=2,
            developer_id=dev_map["jjarvis@gitlab.com"].id,
            message="Merge branch 'jarv/feature' into 'master'",
            created_at=c_date,
            lines_added=random.randint(10,50),
            lines_deleted=random.randint(0,10),
            is_merge_commit=True,
            stats={"total": 60, "additions": 50, "deletions": 10}
        )
        commits_to_create.append(c)

    db.add_all(commits_to_create)
    db.commit()
    print(f"Inserted {len(commits_to_create)} mock commits.")

    db.close()

if __name__ == "__main__":
    seed()
