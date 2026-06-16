# Déploiement sur Render - Guide

## Variables d'environnement requises

### Database (Supabase)
- `DATABASE_URL` = `postgresql://postgres:[PASSWORD]@brujcnmfzafuisrkxtsi.supabase.co:5432/postgres`
- `POSTGRES_HOST` = `brujcnmfzafuisrkxtsi.supabase.co`
- `POSTGRES_PORT` = `5432`
- `POSTGRES_USER` = `postgres`
- `POSTGRES_PASSWORD` = `[VOTRE_PASSWORD_SUPABASE]`
- `POSTGRES_DB` = `postgres`

### Configuration Mode
- `USE_SCHEMAS` = `true` (IMPORTANT: active le mode schémas Supabase)

### GitLab
- `GITLAB_TOKEN` = `[VOTRE_TOKEN_GITLAB]`

### Sécurité
- `SECRET_KEY` = `[GÉNÉRER_UNE_CLÉ_SECRÈTE_32+_CHARS]`
- `ENCRYPTION_KEY` = `[GÉNÉRER_CLÉ_FERNET]`

### Admin (optionnel)
- `ADMIN_EMAIL` = `[EMAIL_ADMIN]`
- `ADMIN_PASSWORD` = `[MOT_DE_PASSE_ADMIN]`

### Autres
- `DEBUG` = `false`
- `SCHEDULER_ENABLED` = `false` (désactivé pour Render gratuit)
- `AUTO_CREATE_SCHEMAS` = `true`

## Instructions de déploiement

1. Créer un compte sur [render.com](https://render.com)
2. Connecter votre repository Git
3. Créer un "Web Service"
4. Sélectionner le dossier `dataCollection/src/backend`
5. Configurer:
   - **Runtime**: Python 3.11
   - **Build Command**: `pip install -r requirements.txt`
   - **Start Command**: `uvicorn app.main:app --host 0.0.0.0 --port $PORT`
6. Ajouter les variables d'environnement ci-dessus
7. Déployer

## Note importante

Le fichier `render.yaml` a été créé pour automatiser la configuration. Render peut l'utiliser pour configurer automatiquement le service et la base de données.
