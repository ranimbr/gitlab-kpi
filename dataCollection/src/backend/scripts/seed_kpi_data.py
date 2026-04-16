"""
seed_kpi_data.py — Agent Senior Data
Injection de données KPI réalistes basées sur la structure d'équipe CSV.

Équipe:
  Project 1 (gitlab-docs): Madrid (site 1), Tunis (site 3)
    - S. Selhorn → Tunis, Squad A
    - S. German  → Madrid, Squad B

  Project 2 (runbooks): Paris (site 2), Tunis (site 3)
    - D. Joshi   → Paris, Squad A
    - Stan Hu    → Tunis, Squad A
    - J. Jarvis  → Paris, Squad B
    - B. Newton  → Tunis, Squad B

Périodes: ID=2 (Mars 2026), ID=1 (Avril 2026)
"""
import random
from datetime import date
from sqlalchemy.exc import IntegrityError
from app.database.session import SessionLocal
from app.models.kpi_snapshot import KpiSnapshot
from app.models.developer import Developer
from app.models.project_site import ProjectSite
from app.models.developer_site import DeveloperSite
from app.models.developer_project import DeveloperProject

random.seed(42)  # Reproductibilité

db = SessionLocal()

def score(commits, mrs, approved, avg_review_h):
    """Calcul du score normalisé 0.0–1.0 (même formule que KpiCalculator)."""
    c = min(commits / 10.0, 1.0)
    m = min(mrs / 5.0, 1.0)
    a = approved / mrs if mrs > 0 else 0.0
    r = 1.0 / (1.0 + avg_review_h / 24.0)
    return round(0.25*c + 0.25*m + 0.30*a + 0.20*r, 4)


def upsert_snapshot(db, **kwargs):
    """Insère ou met à jour un snapshot KPI. Gère les conflits UNIQUE."""
    existing = db.query(KpiSnapshot).filter(
        KpiSnapshot.project_id == kwargs["project_id"],
        KpiSnapshot.period_id  == kwargs["period_id"],
        KpiSnapshot.site_id    == kwargs.get("site_id"),
        KpiSnapshot.group_id   == kwargs.get("group_id"),
        KpiSnapshot.developer_id == kwargs.get("developer_id"),
    ).first()
    if existing:
        for k, v in kwargs.items():
            setattr(existing, k, v)
        return existing
    snap = KpiSnapshot(**kwargs)
    db.add(snap)
    return snap


try:
    # ── 0. Lier Paris au Projet 1 ──────────────────────────────────────────────
    # (Paris = site 2 non lié à project 1, on ajoute ce lien pour Paris stats)
    # Non requis selon les specs — Madrid et Tunis uniquement pour project 1

    # ── 1. Récupérer les développeurs ─────────────────────────────────────────
    devs = {d.gitlab_username: d for d in db.query(Developer).all()}
    print(f"Développeurs en DB: {list(devs.keys())}")

    # Structure équipe par site pour Project 1
    # (on prendra les IDs réels si dispo, sinon on crée des snapshots sans dev_id)
    selhorn = devs.get("sselhorn")
    sgerman = devs.get("sgerman")
    djoshi  = devs.get("djoshi")
    stanhu  = devs.get("stanhu")
    jarv    = devs.get("jarv")
    bnewton = devs.get("bnewton")

    # ── 2. Snapshots SITE-LEVEL pour Project 1 ────────────────────────────────
    # Format professionnel — données cohérentes et réalistes

    site_data = {
        # (project_id, site_id, period_id): {commits, mrs, approved, merged, nb_devs, review_h}
        # Mars 2026 (period_id=2)
        (1, 1, 2): dict(commits=47, mrs=12, approved=10, merged=9, nb_devs=1, review_h=18.5),  # Madrid
        (1, 3, 2): dict(commits=63, mrs=18, approved=15, merged=14, nb_devs=1, review_h=14.2), # Tunis
        # Avril 2026 (period_id=1) — légère baisse (réaliste)
        (1, 1, 1): dict(commits=41, mrs=10, approved=9,  merged=8,  nb_devs=1, review_h=21.0), # Madrid
        (1, 3, 1): dict(commits=58, mrs=16, approved=13, merged=12, nb_devs=1, review_h=16.8), # Tunis
        # Project 2 — pour que Tunis/Paris aient aussi des données
        (2, 2, 2): dict(commits=89, mrs=24, approved=20, merged=19, nb_devs=2, review_h=12.3), # Paris (Mars)
        (2, 3, 2): dict(commits=72, mrs=19, approved=16, merged=15, nb_devs=2, review_h=15.7), # Tunis (Mars)
        (2, 2, 1): dict(commits=84, mrs=22, approved=19, merged=17, nb_devs=2, review_h=13.1), # Paris (Avril)
        (2, 3, 1): dict(commits=68, mrs=17, approved=14, merged=13, nb_devs=2, review_h=17.2), # Tunis (Avril)
    }

    snapshot_dates = {1: date(2026, 4, 1), 2: date(2026, 3, 1)}

    for (proj_id, site_id, per_id), d in site_data.items():
        commits   = d["commits"]
        mrs       = d["mrs"]
        approved  = d["approved"]
        merged    = d["merged"]
        nb_devs   = d["nb_devs"]
        review_h  = d["review_h"]

        upsert_snapshot(db,
            project_id            = proj_id,
            period_id             = per_id,
            site_id               = site_id,
            snapshot_date         = snapshot_dates[per_id],
            total_commits         = commits,
            total_mrs_created     = mrs,
            total_mrs_approved    = approved,
            total_mrs_merged      = merged,
            nb_developers         = nb_devs,
            review_time_hours     = review_h * approved,
            mr_rate_per_site      = round(mrs / nb_devs, 2),
            approved_mr_rate      = round(approved / mrs, 4) if mrs > 0 else 0.0,
            merged_mr_rate        = round(merged / approved, 4) if approved > 0 else 0.0,
            commit_rate_per_site  = round(commits / nb_devs, 2),
            nb_commits_per_project= commits,
            avg_review_time_hours = round(review_h, 1),
            sprint_velocity       = round(commits / 4.0, 1),
            bus_factor            = nb_devs,
            total_comments        = commits * 2,
            total_reviews         = approved,
        )
        print(f"  ✓ Snapshot site: project={proj_id}, site={site_id}, period={per_id} | commits={commits}, MRs={mrs}")

    db.flush()

    # ── 3. Snapshots DÉVELOPPEUR-LEVEL pour Project 1 ─────────────────────────
    dev_data = [
        # (dev_obj, site_id, project_id, period_id, commits, mrs, approved, review_h)
        # Mars 2026
        (sgerman, 1, 1, 2, 47, 12, 10, 18.5),  # German - Madrid
        (selhorn, 3, 1, 2, 63, 18, 15, 14.2),  # Selhorn - Tunis
        # Avril 2026
        (sgerman, 1, 1, 1, 41, 10,  9, 21.0),
        (selhorn, 3, 1, 1, 58, 16, 13, 16.8),
        # Project 2 (Paris + Tunis)
        (djoshi,  2, 2, 2, 45, 13, 11, 11.2),
        (jarv,    2, 2, 2, 44, 11,  9, 13.4),
        (stanhu,  3, 2, 2, 38,  9,  8, 14.9),
        (bnewton, 3, 2, 2, 34, 10,  8, 16.5),
        (djoshi,  2, 2, 1, 42, 12, 10, 12.0),
        (jarv,    2, 2, 1, 42, 10,  9, 14.1),
        (stanhu,  3, 2, 1, 36,  9,  7, 15.5),
        (bnewton, 3, 2, 1, 32,  8,  7, 18.0),
    ]

    for (dev, site_id, proj_id, per_id, commits, mrs, approved, review_h) in dev_data:
        if dev is None:
            print(f"  ⚠ Developer non trouvé en DB pour site={site_id} — snapshot skipped")
            continue
        dev_score = score(commits, mrs, approved, review_h)
        upsert_snapshot(db,
            project_id            = proj_id,
            period_id             = per_id,
            site_id               = site_id,
            developer_id          = dev.id,
            snapshot_date         = snapshot_dates[per_id],
            total_commits         = commits,
            total_mrs_created     = mrs,
            total_mrs_approved    = approved,
            total_mrs_merged      = approved - 1,
            nb_developers         = 1,
            review_time_hours     = review_h * approved,
            mr_rate_per_site      = round(mrs / 1, 2),
            approved_mr_rate      = round(approved / mrs, 4) if mrs > 0 else 0.0,
            merged_mr_rate        = round((approved-1) / approved, 4) if approved > 0 else 0.0,
            commit_rate_per_site  = float(commits),
            nb_commits_per_project= commits,
            avg_review_time_hours = round(review_h, 1),
            developer_score       = dev_score,
            score_rank_in_site    = 1,
            total_comments        = commits * 2,
            total_reviews         = approved,
        )
        print(f"  ✓ Dev snapshot: {dev.gitlab_username} | site={site_id} | period={per_id} | score={dev_score}")

    db.commit()
    print("\n✅ DONE — Base de données alimentée avec succès !")
    print("   Rafraîchissez la page du Dashboard pour voir les données.")

except Exception as e:
    db.rollback()
    import traceback
    traceback.print_exc()
    print(f"\n❌ ERREUR: {e}")
finally:
    db.close()
