import os
from sqlalchemy import create_engine, text
from dotenv import load_dotenv

load_dotenv()
db_url = os.getenv("DATABASE_URL")
engine = create_engine(db_url)

with engine.connect() as conn:
    print("--- Recherche approfondie pour Stan Hu ---")
    # Recherche par email partiel pour voir ce qui bloque la contrainte UNIQUE
    email_search = "stanhu%"
    result = conn.execute(text("SELECT id, name, email, gitlab_username FROM developer WHERE email ILIKE :e"), {"e": email_search})
    rows = result.fetchall()
    
    if rows:
        print(f"Trouve {len(rows)} enregistrements correspondants:")
        for r in rows:
            print(f"ID: {r[0]}, Name: {r[1]}, Email: {r[2]}, User: {r[3]}")
            
            # Mise a jour de l'existant pour correspondre a la liste cible
            print(f"  -> Mise a jour de l'ID {r[0]}...")
            conn.execute(text("""
                UPDATE developer 
                SET name = 'Stan Hu', gitlab_username = 'stanhu', email = 'stanhu@gitlab.com', is_active = True
                WHERE id = :id
            """), {"id": r[0]})
            print(f"  -> ID {r[0]} synchronise.")
    else:
        print("Aucun enregistrement trouve avec ILIKE 'stanhu%'. La contrainte UNIQUE est etrange.")

    conn.commit()

print("\n--- SECOND FINAL VERIFICATION ---")
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
