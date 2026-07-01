"""
Script pour appliquer la migration git_commit.id autoincrement sur Neon
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
-- Fix: Add autoincrement to git_commit.id column
-- This script adds a sequence and default value to the id column

-- Create sequence if it doesn't exist
CREATE SEQUENCE IF NOT EXISTS git_commit_id_seq;

-- Set the default value for id column
ALTER TABLE git_commit ALTER COLUMN id SET DEFAULT nextval('git_commit_id_seq');

-- Set the sequence to be owned by the id column
ALTER SEQUENCE git_commit_id_seq OWNED BY git_commit.id;

-- Update existing rows to have sequential IDs (if any NULL ids exist)
UPDATE git_commit SET id = nextval('git_commit_id_seq') WHERE id IS NULL;
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
    print("La colonne git_commit.id a maintenant l'auto-incrémentation.")
    
except Exception as e:
    print(f"ERREUR lors de l'application de la migration: {e}")
    conn.rollback()
    
finally:
    if conn:
        conn.close()
        print("Connexion fermée")
