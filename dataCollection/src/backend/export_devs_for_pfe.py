import sys
import csv
import os

from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker

# 1. On va ajouter le chemin du backend au PYTHONPATH pour pouvoir importer l'app
sys.path.insert(0, os.path.dirname(__file__))

# 2. On importe la configuration pour avoir la bonne DATABASE_URL (celle définie dans .env si existante)
from app.core.config import get_settings
from app.models.developer import Developer

settings = get_settings()
print(f"Connexion à la base: {settings.DATABASE_URL}")

engine = create_engine(settings.DATABASE_URL)
SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)
db = SessionLocal()

try:
    devs = db.query(Developer).all()
    out_path = "C:/Users/ranim/Downloads/assign_sites.csv"
    
    with open(out_path, "w", newline="", encoding="utf-8-sig") as f:
        writer = csv.writer(f)
        writer.writerow(["name", "email", "gitlab_username"])
        count = 0
        for d in devs:
            writer.writerow([d.name or "", d.email or "", d.gitlab_username or ""])
            count += 1
            
    print(f"✅ {count} développeurs exportés dans le fichier : {out_path}")
    print("👉 Il ne te reste plus qu'à l'importer via l'interface d'administration avec le site de ton choix !")

except Exception as e:
    print(f"❌ Erreur lors de l'exportation: {e}")
finally:
    db.close()
