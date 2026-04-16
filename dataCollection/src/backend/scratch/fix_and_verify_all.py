import os
from sqlalchemy import create_engine, text
from dotenv import load_dotenv

load_dotenv()
db_url = os.getenv("DATABASE_URL")
engine = create_engine(db_url)

with engine.connect() as conn:
    print("--- Recherche du Groupe Cible ---")
    result = conn.execute(text("SELECT id, name FROM developer_group"))
    groups = result.fetchall()
    
    target_group_id = None
    for g in groups:
        print(f"Group: {g[1]} (ID: {g[0]})")
        if "Shell" in g[1]:
            target_group_id = g[0]
            print(f"-> Groupe trouve: {g[1]}")
            break
            
    if not target_group_id and groups:
        target_group_id = groups[0][0]
        print(f"-> Aucun groupe Shell trouve. Utilisation ID: {target_group_id}")

    print("\n--- Insertion de Stan Hu ---")
    try:
        conn.execute(text("""
            INSERT INTO developer (name, email, gitlab_username, group_id, is_active, is_validated, is_bot, auto_created)
            VALUES (:n, :e, :u, :g, True, True, False, False)
        """), {
            "n": "Stan Hu",
            "e": "stanhu@gitlab.com",
            "u": "stanhu",
            "g": target_group_id
        })
        print("Done: Stan Hu ajoute avec succes.")
    except Exception as e:
        print(f"Info/Erreur: {e}")

    conn.commit()

print("\n--- FINAL VERIFICATION ---")
with engine.connect() as conn:
    developers_to_verify = [
        {"name": "Emma Park", "email": "epark@gitlab.com", "gitlab_username": "epark"},
        {"name": "Vasilii Iakliushin", "email": "viakliushin@gitlab.com", "gitlab_username": "vyaklushin"},
        {"name": "Igor Drozdov", "email": "idrozdov@gitlab.com", "gitlab_username": "idrozdov"},
        {"name": "Stan Hu", "email": "stanhu@gitlab.com", "gitlab_username": "stanhu"},
        {"name": "Matias Alvarez", "email": "malvarez@gitlab.com", "gitlab_username": "M_Alvarez"},
        {"name": "Elliot Forbes", "email": "eforbes@gitlab.com", "gitlab_username": "e_forbes"},
    ]
    for target in developers_to_verify:
        res = conn.execute(text("SELECT name, gitlab_username FROM developer WHERE LOWER(email) = :e"), {"e": target["email"].lower()})
        row = res.fetchone()
        if row:
            print(f"[OK] {row[0]} | Email: {target['email']} | User: {row[1]}")
        else:
            print(f"[ERROR] {target['name']} STILL MISSING!")
