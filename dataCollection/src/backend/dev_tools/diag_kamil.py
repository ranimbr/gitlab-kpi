import asyncio
from app.database.session import SessionLocal
from app.services.gitlab.gitlab_client import GitLabClient
from app.models.gitlab_config import GitLabConfig

async def check_kamil():
    db = SessionLocal()
    config = db.query(GitLabConfig).first()
    if not config:
        print("Erreur : Pas de config GitLab trouvée.")
        return
    
    client = GitLabClient(config)
    project_id = 250833  # gitlab-runner
    
    print(f"--- Diagnostic pour Kamil (ayufan) sur le Projet {project_id} ---")
    
    # 1. Vérifier le nom réel de l'utilisateur sur GitLab
    user = await client.get_user_by_username("ayufan")
    if user:
        print(f"Utilisateur trouvé : {user.get('name')} (ID: {user.get('id')})")
    else:
        print("Erreur : Utilisateur 'ayufan' introuvable sur GitLab.")
    
    # 2. Chercher les derniers commits sans aucun filtre d'auteur
    print("\nRecherche des 5 derniers commits du projet (tous auteurs)...")
    recent_commits = await client.get_project_commits(project_id)
    if recent_commits:
        for c in recent_commits[:5]:
            print(f"- {c.get('authored_date')} | {c.get('author_name')} <{c.get('author_email')}>")
    else:
        print("Aucun commit trouvé sur le projet.")

    # 3. Chercher spécifiquement Kamil avec le filtre 'ayufan'
    print(f"\nRecherche des commits pour author='ayufan'...")
    kamil_commits = await client.get_project_commits(project_id, author="ayufan")
    print(f"Trouvés : {len(kamil_commits)} commits.")

asyncio.run(check_kamil())
