#!/usr/bin/env python3
"""
Script pour restaurer les données seed dans gitlab_kpi1 après un nettoyage.
Restaure: menu_items, profiles, roles, permissions, kpi_definitions
"""

import sys
import os
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from sqlalchemy.orm import Session
from app.database.session import get_engine_for_db
from app.core.seed_data import (
    seed_menu_items, 
    seed_profiles, 
    seed_kpi_definitions
)

def restore_seed_data():
    """Restaure toutes les données seed dans gitlab_kpi1"""
    engine = get_engine_for_db("gitlab_kpi1")
    SessionLocal = engine.session_maker_class if hasattr(engine, 'session_maker_class') else None
    
    if not SessionLocal:
        from sqlalchemy.orm import sessionmaker
        SessionLocal = sessionmaker(bind=engine, autoflush=False, autocommit=False)
    
    with SessionLocal() as db:
        print("=" * 60)
        print("Restauration des données seed dans gitlab_kpi1")
        print("=" * 60)
        
        try:
            # 1. Restaurer les menu items
            print("\n1. Restauration des menu items...")
            menu_count = seed_menu_items(db)
            print(f"   ✅ {menu_count} menu items créés")
            
            # 2. Restaurer les profils
            print("\n2. Restauration des profils...")
            profile_count = seed_profiles(db)
            print(f"   ✅ {profile_count} profils créés")
            
            # 3. Restaurer les définitions KPI
            print("\n3. Restauration des définitions KPI...")
            kpi_count = seed_kpi_definitions(db)
            print(f"   ✅ {kpi_count} définitions KPI créées")
            
            print("\n" + "=" * 60)
            print("✅ Restauration terminée avec succès")
            print("=" * 60)
            
            # Vérifier l'état
            print("\nÉtat actuel:")
            from app.models.menu_item import MenuItem
            from app.models.profile import Profile
            
            menu_count = db.query(MenuItem).count()
            profile_count = db.query(Profile).count()
            
            print(f"  - Menu items: {menu_count}")
            print(f"  - Profils: {profile_count}")
            
            # Vérifier le profil Super Admin
            super_admin_profile = db.query(Profile).filter(Profile.name == "Super Admin").first()
            if super_admin_profile:
                print(f"  - Profil Super Admin: ✅ présent (id={super_admin_profile.id})")
            else:
                print(f"  - Profil Super Admin: ❌ manquant")
            
        except Exception as e:
            print(f"\n❌ Erreur lors de la restauration: {e}")
            import traceback
            traceback.print_exc()
            db.rollback()
            raise

if __name__ == "__main__":
    restore_seed_data()
