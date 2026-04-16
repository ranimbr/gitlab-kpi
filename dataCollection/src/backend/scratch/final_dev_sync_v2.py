import os
from sqlalchemy import create_engine, text
from dotenv import load_dotenv

load_dotenv()

db_url = os.getenv("DATABASE_URL")
if not db_url:
    print("Error: DATABASE_URL not found in .env")
    exit(1)

engine = create_engine(db_url)

# Données cibles (Fusion de Firstname + Lastname -> name)
developers_to_verify = [
    {"name": "Emma Park", "email": "epark@gitlab.com", "gitlab_username": "epark"},
    {"name": "Vasilii Iakliushin", "email": "viakliushin@gitlab.com", "gitlab_username": "vyaklushin"},
    {"name": "Igor Drozdov", "email": "idrozdov@gitlab.com", "gitlab_username": "idrozdov"},
    {"name": "Stan Hu", "email": "stanhu@gitlab.com", "gitlab_username": "stanhu"},
    {"name": "Matias Alvarez", "email": "malvarez@gitlab.com", "gitlab_username": "M_Alvarez"},
    {"name": "Elliot Forbes", "email": "eforbes@gitlab.com", "gitlab_username": "e_forbes"},
]

with engine.connect() as conn:
    print("--- Validation Chirurgicale des Données Dev ---")
    
    for target in developers_to_verify:
        email = target["email"].lower()
        # On vérifie si le dev existe par email (insensible à la casse dans l'email)
        result = conn.execute(text("SELECT id, name, gitlab_username FROM developer WHERE LOWER(email) = :e"), {"e": email})
        db_dev = result.fetchone()
        
        if db_dev:
            db_id, db_name, db_username = db_dev
            print(f"[OK] Trouve: {db_name} ({email})")
            
            # Mise à jour si nécessaire
            needs_update = False
            updates = {}
            if db_username != target["gitlab_username"]:
                print(f"  [FIX] Username GitLab incorrect: DB='{db_username}', Cible='{target['gitlab_username']}'")
                updates["u"] = target["gitlab_username"]
                needs_update = True
            
            if db_name != target["name"]:
                print(f"  [FIX] Nom incorrect: DB='{db_name}', Cible='{target['name']}'")
                updates["n"] = target["name"]
                needs_update = True
                
            if needs_update:
                set_clause = []
                if "u" in updates: set_clause.append("gitlab_username = :u")
                if "n" in updates: set_clause.append("name = :n")
                
                sql = f"UPDATE developer SET {', '.join(set_clause)} WHERE id = :id"
                updates["id"] = db_id
                conn.execute(text(sql), updates)
                print(f"  [DONE] Donnees synchronisees pour {email}.")
        else:
            print(f"[MISSING] MANQUANT: {target['name']} ({email}).")

    conn.commit()
    print("\n--- Validation Terminee ---")
