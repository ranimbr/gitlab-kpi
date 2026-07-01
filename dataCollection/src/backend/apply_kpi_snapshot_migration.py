"""
Script pour appliquer la migration avg_commits_per_mr sur Neon
"""
import os
import psycopg2
from dotenv import load_dotenv

# Charger les variables d'environnement
load_dotenv()

# URL de la base de données gitlab_kpi1 (Neon)
DB_URL = os.getenv("GITLAB_KPI1_DB_URL") or "postgresql://neondb_owner:npg_GmJvk93fseOK@ep-quiet-queen-aspzc21p-pooler.c-4.eu-central-1.aws.neon.tech/neondb?sslmode=require&channel_binding=require"

# Script SQL à exécuter
SQL_SCRIPT = """
-- Add column with default
ALTER TABLE kpi_snapshot 
ADD COLUMN IF NOT EXISTS avg_commits_per_mr FLOAT DEFAULT 0.0;

-- Update existing rows
UPDATE kpi_snapshot 
SET avg_commits_per_mr = 0.0 
WHERE avg_commits_per_mr IS NULL;

-- Make column NOT NULL
ALTER TABLE kpi_snapshot 
ALTER COLUMN avg_commits_per_mr SET NOT NULL;
"""

try:
    # Connexion à la base de données
    conn = psycopg2.connect(DB_URL)
    cursor = conn.cursor()
    
    print("Connexion réussie à gitlab_kpi1")
    
    # Exécuter le script SQL
    cursor.execute(SQL_SCRIPT)
    conn.commit()
    
    print("Migration appliquée avec succès!")
    print("La colonne kpi_snapshot.avg_commits_per_mr a été ajoutée.")
    
except Exception as e:
    print(f"ERREUR lors de l'application de la migration: {e}")
    conn.rollback()
    
finally:
    if conn:
        conn.close()
        print("Connexion fermée")
