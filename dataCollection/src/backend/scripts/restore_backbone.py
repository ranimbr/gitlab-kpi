import datetime
import random
import uuid
import sys
import os

# Ajout du chemin backend pour l'import des modules app
sys.path.append(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from app.database.session import SessionLocal
from app.models.developer import Developer
from app.models.commit import Commit
from app.models.merge_request import MRStateEnum, MergeRequest
from app.models.developer_project import DeveloperProject
from app.models.developer_site import DeveloperSite
from app.models.project import Project
from app.models.site import Site
from app.models.kpi_snapshot import KpiSnapshot
from app.models.alert import Alert

def score_calc(commits, mrs, approved, avg_review_h):
    """Calcul du score normalise 0.0-1.0 (meme formule que KpiCalculator)."""
    c = min(commits / 10.0, 1.0)
    m = min(mrs / 5.0, 1.0)
    a = approved / mrs if mrs > 0 else 0.0
    r = 1.0 / (1.0 + avg_review_h / 24.0)
    return round(0.25*c + 0.25*m + 0.30*a + 0.20*r, 4)

def restore_backbone():
    db = SessionLocal()
    print("--- Debut de la restauration du backbone de donnees ---")

    try:
        # 1. Nettoyage des tables pour eviter les doublons SHA/IDs
        # L'ordre est CRITIQUE pour les contraintes de cle etrangere
        print("Nettoyage des tables existantes...")
        db.query(Alert).delete()
        db.query(KpiSnapshot).delete()
        db.query(Commit).delete()
        db.query(MergeRequest).delete()
        db.query(DeveloperProject).delete()
        db.query(DeveloperSite).delete()
        db.query(Developer).delete()
        db.commit()

        # 2. Recuperation des Projets et Sites
        projects = {p.id: p for p in db.query(Project).all()}
        sites = {s.name: s for s in db.query(Site).all()}
        
        if not projects or not sites:
            print("Erreur: Projets ou Sites manquants en base. Roulez d'abord seed_kpi_data.py.")
            return

        # 3. Creation des Developpeurs (Donnees CSV de reference)
        devs_config = [
            {"name": "S. German", "email": "sgerman@gitlab.com", "gid": 111, "username": "sgerman", "site": "Madrid", "projects": [1]},
            {"name": "D. Joshi",  "email": "djoshi@gitlab.com",  "gid": 333, "username": "djoshi",  "site": "Paris",  "projects": [2]},
            {"name": "J. Jarvis", "email": "jjarvis@gitlab.com", "gid": 444, "username": "jjarvis", "site": "Paris",  "projects": [2]},
            {"name": "S. Selhorn", "email": "sselhorn@gitlab.com","gid": 222, "username": "sselhorn", "site": "Tunis", "projects": [1, 2]},
        ]

        created_devs = []
        dev_map = {}
        for conf in devs_config:
            dev = Developer(
                name=conf["name"],
                email=conf["email"],
                gitlab_user_id=conf["gid"],
                gitlab_username=conf["username"],
                is_active=True,
                is_validated=True,
                source="manual"
            )
            db.add(dev)
            db.flush()
            
            # Association au Site
            site_obj = sites.get(conf["site"])
            if site_obj:
                db.add(DeveloperSite(developer_id=dev.id, site_id=site_obj.id, is_primary=True))
            
            # Association aux Projets
            for pid in conf["projects"]:
                if pid in projects:
                    db.add(DeveloperProject(developer_id=dev.id, project_id=pid, is_active=True))
            
            created_devs.append((dev, conf))
            dev_map[conf["username"]] = dev
            print(f"Developpeur cree : {dev.name} ({conf['site']})")

        db.commit()

        # 4. Generation de Commits et MRs (DONNEES BRUTES)
        words = ["fix", "feat", "refactor", "docs", "test", "chore", "perf"]
        features = ["ui", "auth", "api", "database", "ci-cd", "kpi-engine", "security"]

        now = datetime.datetime.now(datetime.timezone.utc)
        
        for dev, conf in created_devs:
            for pid in conf["projects"]:
                # --- Generation de Commits ---
                # On genere environ 30 commits par dev par projet pour remplir la vue
                nb_commits = random.randint(25, 45)
                for i in range(nb_commits):
                    days_ago = random.randint(1, 45)
                    dt = now - datetime.timedelta(days=days_ago)
                    
                    additions = random.randint(10, 200)
                    deletions = random.randint(1, additions // 2 + 1)
                    
                    commit = Commit(
                        gitlab_commit_id=uuid.uuid4().hex[:40],
                        title=f"{random.choice(words)}: implement {random.choice(features)} logic #{random.randint(100, 999)}",
                        message=f"Detailed message for work on {random.choice(features)}.\nSprint {i//5}",
                        authored_date=dt,
                        committed_date=dt,
                        additions=additions,
                        deletions=deletions,
                        total_changes=additions + deletions,
                        is_merge_commit=False,
                        project_id=pid,
                        developer_id=dev.id,
                        branch_name="master" if random.random() > 0.3 else f"feature/{random.choice(features)}"
                    )
                    db.add(commit)

                # --- Generation de Merge Requests ---
                nb_mrs = random.randint(5, 10)
                for i in range(nb_mrs):
                    days_ago = random.randint(1, 40)
                    dt_create = now - datetime.timedelta(days=days_ago)
                    
                    state = random.choice([MRStateEnum.merged, MRStateEnum.merged, MRStateEnum.opened])
                    dt_merged = dt_create + datetime.timedelta(hours=random.randint(2, 48)) if state == MRStateEnum.merged else None
                    
                    # Selection d'un reviewer et d'un assignee (differents de l'auteur si possible)
                    potential_partners = [d for d, c in created_devs if d.id != dev.id and pid in c["projects"]]
                    partner = random.choice(potential_partners) if potential_partners else dev
                    
                    mr = MergeRequest(
                        gitlab_mr_id=random.randint(1000, 9999),
                        title=f"Resolve {random.choice(features)} improvements",
                        description=f"Merging some fixes for {random.choice(features)}",
                        state=state,
                        is_draft=False,
                        created_at_gitlab=dt_create,
                        merged_at=dt_merged,
                        approved=True if state == MRStateEnum.merged else False,
                        approved_at=dt_merged if state == MRStateEnum.merged else None,
                        project_id=pid,
                        developer_id=dev.id,
                        reviewer_id=partner.id if random.random() > 0.3 else None,
                        assignee_id=dev.id if random.random() > 0.5 else partner.id,
                        source_branch=f"feature/{random.choice(features)}",
                        target_branch="master",
                        additions=random.randint(50, 500),
                        deletions=random.randint(10, 100),
                        total_changes=0,
                        review_time_hours=random.uniform(1.0, 24.0) if state == MRStateEnum.merged else None
                    )
                    mr.total_changes = (mr.additions or 0) + (mr.deletions or 0)
                    db.add(mr)
        
        db.flush()

        # 5. Injection de Snapshots KPI (DONNEES AGREGEES pour les graphiques)
        # On reprend les valeurs de seed_kpi_data.py pour Project 1 et 2
        
        snapshot_dates = {1: datetime.date(2026, 4, 1), 2: datetime.date(2026, 3, 1)}

        # (project_id, site_id, period_id): {commits, mrs, approved, merged, nb_devs, review_h}
        site_data = {
            (1, 1, 2): dict(commits=47, mrs=12, approved=10, merged=9, nb_devs=1, review_h=18.5),  # Madrid (Mars)
            (1, 3, 2): dict(commits=63, mrs=18, approved=15, merged=14, nb_devs=1, review_h=14.2), # Tunis (Mars)
            (1, 1, 1): dict(commits=41, mrs=10, approved=9,  merged=8,  nb_devs=1, review_h=21.0), # Madrid (Avril)
            (1, 3, 1): dict(commits=58, mrs=16, approved=13, merged=12, nb_devs=1, review_h=16.8), # Tunis (Avril)
            (2, 2, 2): dict(commits=89, mrs=24, approved=20, merged=19, nb_devs=2, review_h=12.3), # Paris (Mars)
            (2, 3, 2): dict(commits=72, mrs=19, approved=16, merged=15, nb_devs=2, review_h=15.7), # Tunis (Mars)
            (2, 2, 1): dict(commits=84, mrs=22, approved=19, merged=17, nb_devs=2, review_h=13.1), # Paris (Avril)
            (2, 3, 1): dict(commits=68, mrs=17, approved=14, merged=13, nb_devs=2, review_h=17.2), # Tunis (Avril)
        }

        for (proj_id, site_id, per_id), d in site_data.items():
            db.add(KpiSnapshot(
                project_id=proj_id, period_id=per_id, site_id=site_id,
                snapshot_date=snapshot_dates[per_id],
                total_commits=d["commits"], total_mrs_created=d["mrs"],
                total_mrs_approved=d["approved"], total_mrs_merged=d["merged"],
                nb_developers=d["nb_devs"], review_time_hours=d["review_h"] * d["approved"],
                mr_rate_per_site=round(d["mrs"] / d["nb_devs"], 2),
                approved_mr_rate=round(d["approved"] / d["mrs"], 4) if d["mrs"] > 0 else 0.0,
                merged_mr_rate=round(d["merged"] / d["approved"], 4) if d["approved"] > 0 else 0.0,
                commit_rate_per_site=round(d["commits"] / d["nb_devs"], 2),
                nb_commits_per_project=d["commits"],
                avg_review_time_hours=round(d["review_h"], 1),
                sprint_velocity=round(d["commits"] / 4.0, 1),
                bus_factor=d["nb_devs"], total_comments=d["commits"] * 2, total_reviews=d["approved"]
            ))

        # Dev Level Snapshots
        dev_data = [
            ("sgerman", 1, 1, 2, 47, 12, 10, 18.5),
            ("sselhorn", 3, 1, 2, 63, 18, 15, 14.2),
            ("sgerman", 1, 1, 1, 41, 10,  9, 21.0),
            ("sselhorn", 3, 1, 1, 58, 16, 13, 16.8),
            ("djoshi",  2, 2, 2, 45, 13, 11, 11.2),
            ("jjarvis",  2, 2, 2, 44, 11,  9, 13.4),
            ("sselhorn", 3, 2, 2, 38,  9,  8, 14.9),
            ("djoshi",  2, 2, 1, 42, 12, 10, 12.0),
            ("jjarvis",  2, 2, 1, 42, 10,  9, 14.1),
            ("sselhorn", 3, 2, 1, 36,  9,  7, 15.5),
        ]

        for (uname, site_id, proj_id, per_id, commits, mrs, approved, review_h) in dev_data:
            dev = dev_map.get(uname)
            if dev:
                score = score_calc(commits, mrs, approved, review_h)
                db.add(KpiSnapshot(
                    project_id=proj_id, period_id=per_id, site_id=site_id, developer_id=dev.id,
                    snapshot_date=snapshot_dates[per_id],
                    total_commits=commits, total_mrs_created=mrs,
                    total_mrs_approved=approved, total_mrs_merged=approved - 1,
                    nb_developers=1, review_time_hours=review_h * approved,
                    mr_rate_per_site=float(mrs),
                    approved_mr_rate=round(approved / mrs, 4) if mrs > 0 else 0.0,
                    merged_mr_rate=round((approved-1) / approved, 4) if approved > 0 else 0.0,
                    commit_rate_per_site=float(commits),
                    nb_commits_per_project=commits,
                    avg_review_time_hours=round(review_h, 1),
                    developer_score=score, score_rank_in_site=1,
                    total_comments=commits * 2, total_reviews=approved
                ))

        db.commit()
        print("Restauration terminee avec succes !")
        print(f"Commits generes : {db.query(Commit).count()}")
        print(f"MRs generees : {db.query(MergeRequest).count()}")
        print(f"Snapshots generes : {db.query(KpiSnapshot).count()}")

    except Exception as e:
        db.rollback()
        import traceback
        traceback.print_exc()
        print(f"Erreur lors de la restauration : {str(e)}")
    finally:
        db.close()

if __name__ == "__main__":
    restore_backbone()
