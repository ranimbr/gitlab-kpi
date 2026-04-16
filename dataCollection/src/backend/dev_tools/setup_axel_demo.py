import asyncio
from app.database.session import SessionLocal
from app.services.gitlab.gitlab_client import GitLabClient
from app.models.gitlab_config import GitLabConfig
from app.services.admin.developer_service import DeveloperService
from app.schemas.developer import DeveloperCreate

async def setup_axel():
    db = SessionLocal()
    config = db.query(GitLabConfig).first()
    client = GitLabClient(config)
    dev_service = DeveloperService()
    
    print("--- Préparation du Développeur 'Axel von Bertoldi' ---")
    
    # 1. Chercher son Username réel sur GitLab via son email
    # (Ou on peut parier qu'il est dans les membres du projet)
    members = await client.get_project_members(250833)
    axel_gl = next((m for m in members if "Axel" in m.get("name", "") or "von Bertoldi" in m.get("name", "")), None)
    
    if not axel_gl:
        print("Erreur : Axel introuvable dans les membres. On va chercher par nom global.")
        # Alternative : recherche utilisateur globale
        # Pour la démo, on va utiliser les infos de son commit : avonbertoldi
        axel_username = "avonbertoldi"
    else:
        axel_username = axel_gl.get("username")
        print(f"Trouvé ! Username : {axel_username} (ID: {axel_gl.get('id')})")

    # 2. Créer ou mettre à jour Axel dans notre base
    from app.models.developer import Developer
    from app.models.developer_project import DeveloperProject
    
    # Vérifier s'il existe déjà
    axel_db = db.query(Developer).filter(Developer.gitlab_username == axel_username).first()
    if not axel_db:
        # On le crée via le service
        new_dev = DeveloperCreate(
            name="Axel von Bertoldi",
            email="avonbertoldi@gitlab.com",
            gitlab_username=axel_username,
            gitlab_user_id=axel_gl.get('id') if axel_gl else None,
            site_id=2 # On le met sur le site TEST pour la démo
        )
        axel_db = dev_service.create_developer(db, new_dev)
        print(f"Axel créé en base (ID: {axel_db.id}) ✅")
    else:
        print(f"Axel existe déjà (ID: {axel_db.id}) ✅")
        axel_db.name = "Axel von Bertoldi" # Update propre
        axel_db.gitlab_username = axel_username # Assurer le username
        db.commit()

    # 3. Le lier au Projet 21 (gitlab-runner) impérativement
    from app.models.project import Project
    project_id = 19 # KPI-GitLab ? Non on veut le 21 (Runner)
    # On cherche le projet gitlab-runner par son nom technique si besoin
    # Mais l'utilisateur a vu Project 21 dans le passé
    runner_project = db.query(Project).filter(Project.gitlab_project_id == 250833).first()
    if runner_project:
        # Vérifier si le lien existe
        link = db.query(DeveloperProject).filter(
            DeveloperProject.developer_id == axel_db.id,
            DeveloperProject.project_id == runner_project.id
        ).first()
        if not link:
            new_link = DeveloperProject(developer_id=axel_db.id, project_id=runner_project.id)
            db.add(new_link)
            db.commit()
            print(f"Lien créé entre Axel et {runner_project.name} ✅")
        else:
            print("Lien déjà existant ✅")
    else:
        print("Erreur : Projet gitlab-runner introuvable en base.")

asyncio.run(setup_axel())
