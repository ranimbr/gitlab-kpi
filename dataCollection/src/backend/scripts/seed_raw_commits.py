import datetime
import random
import uuid
from app.database.session import SessionLocal
from app.models.commit import Commit
from app.models.app_user import AppUser
from app.models.project import Project

def seed_raw_commits():
    db = SessionLocal()
    print("Seeding raw commits for GUI consistency...")

    # Fetch projects
    p1 = db.query(Project).filter(Project.id == 1).first()
    p2 = db.query(Project).filter(Project.id == 2).first()
    if not p1 or not p2:
        print("Projects missing.")
        return

    # Fetch devs
    devs = db.query(AppUser).all()

    # Distributions matching our KPI sums approximately
    # P1: Madrid (S. German), Tunis (S. Selhorn)
    # P2: Paris (D. Joshi, J. Jarvis), Tunis (S. Selhorn)

    commits_to_create = []

    devs_p1 = [d for d in devs if "sgerman" in d.email or "sselhorn" in d.email]
    devs_p2 = [d for d in devs if "djoshi" in d.email or "jjarvis" in d.email or "sselhorn" in d.email]

    if not devs_p1 or not devs_p2:
        print("Erreur: Les developpeurs ne sont pas trouves!")
        for d in devs: print(d.email)
        return

    # Mots cles typiques de code pour des messages realistes
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
            # random date in last 2 months
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

    # P1 commits (approx 100)
    commits_to_create.extend(generate_random_commits(1, devs_p1, 105))
    
    # P2 commits (approx 150)
    commits_to_create.extend(generate_random_commits(2, devs_p2, 156))

    db.add_all(commits_to_create)
    db.commit()
    print(f"Inserted {len(commits_to_create)} fake raw commits.")
    db.close()

if __name__ == "__main__":
    seed_raw_commits()
