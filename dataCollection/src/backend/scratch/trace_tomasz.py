import asyncio
from sqlalchemy import create_engine
from app.services.gitlab.gitlab_client import GitLabClient
from sqlalchemy.orm import sessionmaker

async def trace_tomasz():
    engine = create_engine("postgresql://postgres:0000@localhost:5432/gitlab_kpi1")
    Session = sessionmaker(bind=engine)
    db = Session()
    
    from app.models.gitlab_config import GitLabConfig
    config = db.query(GitLabConfig).filter(GitLabConfig.is_active == True).first()
    client = GitLabClient(config)
    
    user_id = 215818 # Tomasz Maczukin
    print(f"Recherche de l'activité de Tomasz Maczukin (ID {user_id})...")
    
    # On regarde ses derniers commits publics sur gitlab.com
    # Note: On ne peut pas facilement filtrer globalement par auteur sur le repository/commits API 
    # sans passer par les événements ou chercher dans un projet spécifique.
    
    project_id = 250833 # gitlab-runner
    # On essaie de chercher SPECIFIQUEMENT pour lui en utilisant le paramètre 'author'
    # GitLab accepte un username ou un email dans 'author'
    commits = await client.get_project_commits(project_id, author="tmaczukin")
    
    if commits:
        print(f"Trouvé {len(commits)} commits pour tmaczukin.")
        emails = {c.get("author_email") for c in commits}
        print(f"Emails Git utilisés : {emails}")
    else:
        print("Aucun commit trouvé pour le pseudo 'tmaczukin'.")
        # Test avec son nom complet
        commits_by_name = await client.get_project_commits(project_id, author="Tomasz Maczukin")
        if commits_by_name:
             print(f"Trouvé {len(commits_by_name)} commits pour 'Tomasz Maczukin'.")
             emails = {c.get("author_email") for c in commits_by_name}
             print(f"Emails Git utilisés : {emails}")
        else:
            print("Aucun commit trouvé pour 'Tomasz Maczukin' non plus.")

    db.close()

if __name__ == "__main__":
    asyncio.run(trace_tomasz())
