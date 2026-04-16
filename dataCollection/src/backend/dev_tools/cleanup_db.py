
import sys
import os
sys.path.append(os.getcwd())

from sqlalchemy import text
from app.database.session import engine

def cleanup():
    print("--- NETTOYAGE GÉNÉRAL DE LA BASE DE DONNÉES ---")
    
    with engine.connect() as conn:
        trans = conn.begin()
        try:
            # 1. Vider les données d'analyse et d'extraction
            print("Suppression des Snapshots, Commentaires et Lots...")
            conn.execute(text("DELETE FROM kpi_snapshot"))
            conn.execute(text("DELETE FROM comment"))
            conn.execute(text("DELETE FROM extraction_lot"))
            
            # 2. Vider les Commits et MRs
            print("Suppression des Commits et Merge Requests...")
            conn.execute(text("DELETE FROM commit_merge_request"))
            conn.execute(text("DELETE FROM merge_request"))
            conn.execute(text("DELETE FROM git_commit"))
            
            # 3. Supprimer les développeurs non validés (les "fantômes")
            print("Suppression des développeurs non validés (Auto-découverts)...")
            # On nettoie d'abord les associations
            conn.execute(text("DELETE FROM developer_project WHERE developer_id IN (SELECT id FROM developer WHERE is_validated = False)"))
            conn.execute(text("DELETE FROM developer_site WHERE developer_id IN (SELECT id FROM developer WHERE is_validated = False)"))
            # Puis on supprime les dev
            conn.execute(text("DELETE FROM developer WHERE is_validated = False"))
            
            trans.commit()
            print("\n✅ NETTOYAGE RÉUSSI !")
            print("Votre dashboard est maintenant vide et prêt pour votre démonstration.")
            
        except Exception as e:
            trans.rollback()
            print(f"\n❌ ERREUR LORS DU NETTOYAGE : {e}")

if __name__ == "__main__":
    cleanup()
