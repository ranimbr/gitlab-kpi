"""
Script pour appliquer la migration app_user.id autoincrement sur Neon
"""
import os
import psycopg2
from dotenv import load_dotenv

# Charger les variables d'environnement
load_dotenv()

# URL de la base de données auth_db (Neon)
DB_URL = os.getenv("AUTH_DB_URL") or "postgresql://neondb_owner:npg_GmJvk93fseOK@ep-quiet-queen-aspzc21p-pooler.c-4.eu-central-1.aws.neon.tech/neondb?sslmode=require&channel_binding=require"

# Script SQL à exécuter
SQL_SCRIPT = """
-- Create sequence if it doesn't exist
CREATE SEQUENCE IF NOT EXISTS app_user_id_seq;

-- Set the default value for id column
ALTER TABLE app_user ALTER COLUMN id SET DEFAULT nextval('app_user_id_seq');

-- Set the sequence to be owned by the id column
ALTER SEQUENCE app_user_id_seq OWNED BY app_user.id;

-- Update existing rows to have sequential IDs (if any NULL ids exist)
UPDATE app_user SET id = nextval('app_user_id_seq') WHERE id IS NULL;
"""

try:
    # Connexion à la base de données
    conn = psycopg2.connect(DB_URL)
    cursor = conn.cursor()
    
    print("Connexion réussie à auth_db")
    
    # Exécuter le script SQL
    cursor.execute(SQL_SCRIPT)
    conn.commit()
    
    print("Migration appliquée avec succès!")
    print("La colonne app_user.id a maintenant l'auto-incrémentation.")
    
except Exception as e:
    print(f"ERREUR lors de l'application de la migration: {e}")
    conn.rollback()
    
finally:
    if conn:
        conn.close()
        print("Connexion fermée")
