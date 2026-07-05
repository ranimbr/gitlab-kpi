"""
Script pour ajouter la colonne avg_commits_per_mr à kpi_snapshot dans telnet_db
Sans détruire les données existantes
"""
import psycopg2
from psycopg2 import sql

# URL de connexion telnet_db
DB_URL = "postgresql://neondb_owner:npg_1cbKyiPjZEk9@ep-broad-glade-as1z9mig-pooler.c-4.eu-central-1.aws.neon.tech/neondb?sslmode=require&channel_binding=require"

def add_column_if_not_exists():
    """Ajoute la colonne avg_commits_per_mr si elle n'existe pas"""
    
    try:
        # Connexion à la base de données
        conn = psycopg2.connect(DB_URL)
        conn.autocommit = True
        cursor = conn.cursor()
        
        print("✓ Connecté à telnet_db")
        
        # Vérifier si la colonne existe déjà
        check_query = """
            SELECT column_name 
            FROM information_schema.columns 
            WHERE table_name = 'kpi_snapshot' 
            AND column_name = 'avg_commits_per_mr';
        """
        
        cursor.execute(check_query)
        result = cursor.fetchone()
        
        if result:
            print("✓ La colonne avg_commits_per_mr existe déjà dans kpi_snapshot")
            return
        
        # Ajouter la colonne
        alter_query = """
            ALTER TABLE kpi_snapshot 
            ADD COLUMN avg_commits_per_mr NUMERIC(10, 2);
        """
        
        cursor.execute(alter_query)
        print("✓ Colonne avg_commits_per_mr ajoutée avec succès à kpi_snapshot")
        
        # Vérifier l'ajout
        cursor.execute(check_query)
        result = cursor.fetchone()
        if result:
            print("✓ Vérification: la colonne existe maintenant")
        else:
            print("✗ Erreur: la colonne n'a pas été ajoutée")
        
        cursor.close()
        conn.close()
        print("✓ Connexion fermée")
        
    except Exception as e:
        print(f"✗ Erreur: {e}")
        raise

if __name__ == "__main__":
    add_column_if_not_exists()
