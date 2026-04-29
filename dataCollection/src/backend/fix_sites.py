
import sys
import os

# Ajouter le chemin pour trouver 'app'
sys.path.append(os.getcwd())

from app.database.session import SessionLocal
from app.repositories.site_repository import SiteRepository

def fix_existing_sites():
    db = SessionLocal()
    repo = SiteRepository()
    try:
        print("🚀 Mise à jour intelligente des sites existants...")
        sites = repo.get_all(db)
        count = 0
        
        for site in sites:
            metadata = repo._guess_metadata(site.name)
            if site.country == "À définir" and metadata["country"] != "À définir":
                site.country = metadata["country"]
                site.timezone = metadata["timezone"]
                print(f"✅ Site '{site.name}' mis à jour -> {site.country} ({site.timezone})")
                count += 1
        
        db.commit()
        print(f"\n✨ {count} sites mis à jour avec succès !")
        
    except Exception as e:
        db.rollback()
        print(f"❌ Erreur : {str(e)}")
    finally:
        db.close()

if __name__ == "__main__":
    fix_existing_sites()
