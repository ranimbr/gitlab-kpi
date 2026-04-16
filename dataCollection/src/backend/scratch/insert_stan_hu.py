import os
from sqlalchemy import create_engine, text
from dotenv import load_dotenv

load_dotenv()

db_url = os.getenv("DATABASE_URL")
if not db_url:
    print("Error: DATABASE_URL not found in .env")
    exit(1)

engine = create_engine(db_url)

with engine.connect() as conn:
    print("--- Recuperation des Groupes ---")
    # 'group' est un mot cle reserve en Postgres, il faut l'entourer de doubles quotes
    result = conn.execute(text('SELECT id, name FROM "group"'))
    groups = result.fetchall()
    for g in groups:
        print(f"Group ID: {g[0]}, Name: {g[1]}")
    
    # Identification du groupe GitLab-Shell
    shell_group_id = None
    for g in groups:
        if "Shell" in g[1]:
            shell_group_id = g[0]
            print(f"-> Groupe cible identifie: {g[1]} (ID: {shell_group_id})")
            break
    
    if not shell_group_id and groups:
        shell_group_id = groups[0][0]
        print(f"-> Aucun groupe Shell trouve. Utilisation par defaut du premier groupe (ID: {shell_group_id})")

    # Insertion de Stan Hu
    print("\n--- Insertion de Stan Hu ---")
    try:
        conn.execute(text("""
            INSERT INTO developer (name, email, gitlab_username, group_id, is_active, is_validated, is_bot, auto_created)
            VALUES (:name, :email, :u, :g, True, True, False, False)
        """), {
            "name": "Stan Hu",
            "email": "stanhu@gitlab.com",
            "u": "stanhu",
            "g": shell_group_id
        })
        print("Done: Stan Hu ajoute avec succes.")
    except Exception as e:
        print(f"Erreur lors de l'insertion: {e}")

    conn.commit()
