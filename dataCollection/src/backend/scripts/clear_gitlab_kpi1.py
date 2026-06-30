#!/usr/bin/env python3
"""
Script pour vider la base gitlab_kpi1 en préservant:
- app_user (utilisateurs)
- gitlab_config (configuration GitLab)
"""

import sys
import os
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from sqlalchemy import text
from app.database.session import get_engine_for_db

# Tables à préserver (ne pas vider)
PRESERVED_TABLES = {'app_user', 'gitlab_config'}

def clear_database():
    """Vide toutes les tables sauf celles préservées"""
    engine = get_engine_for_db("gitlab_kpi1")
    
    with engine.begin() as conn:
        # Récupérer toutes les tables
        result = conn.execute(text("""
            SELECT tablename 
            FROM pg_tables 
            WHERE schemaname = 'public'
            ORDER BY tablename
        """))
        
        all_tables = [row[0] for row in result]
        
        # Filtrer les tables à préserver
        tables_to_clear = [t for t in all_tables if t not in PRESERVED_TABLES]
        
        print(f"Tables trouvées: {len(all_tables)}")
        print(f"Tables à préserver: {PRESERVED_TABLES}")
        print(f"Tables à vider: {len(tables_to_clear)}")
        
        if tables_to_clear:
            print("\nTables à vider:")
            for table in tables_to_clear:
                print(f"  - {table}")
            
            # Désactiver les contraintes foreign key temporairement
            conn.execute(text("SET CONSTRAINTS ALL DEFERRED"))
            
            # Vider chaque table
            for table in tables_to_clear:
                try:
                    # TRUNCATE est plus rapide que DELETE
                    conn.execute(text(f'TRUNCATE TABLE "{table}" CASCADE'))
                    print(f"✅ Table {table} vidée")
                except Exception as e:
                    print(f"❌ Erreur vidage table {table}: {e}")
            
            print("\n✅ Base gitlab_kpi1 vidée avec succès")
        else:
            print("⚠️ Aucune table à vider")
        
        # Afficher les tables préservées
        print(f"\nTables préservées:")
        for table in PRESERVED_TABLES:
            if table in all_tables:
                count_result = conn.execute(text(f'SELECT COUNT(*) FROM "{table}"'))
                count = count_result.scalar()
                print(f"  - {table}: {count} lignes préservées")

if __name__ == "__main__":
    print("=" * 60)
    print("Nettoyage de la base gitlab_kpi1")
    print("=" * 60)
    
    try:
        clear_database()
    except Exception as e:
        print(f"\n❌ Erreur: {e}")
        sys.exit(1)
