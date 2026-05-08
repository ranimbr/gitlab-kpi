import logging
from sqlalchemy import text
from app.database.session import SessionLocal

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger("hard_reset")

def hard_reset():
    """
    [SENIOR RESET] Nettoyage chirurgical pour soutenance PFE.
    Supprime les données transactionnelles et les listes de développeurs,
    mais conserve la configuration (Users, GitLab Configs, Projets, Sites).
    """
    db = SessionLocal()
    try:
        logger.info("Début du nettoyage de la base de données...")
        
        # Liste des tables à vider (ordre respectant les contraintes de clés étrangères)
        tables_to_truncate = [
            "audit_log",
            "developer_import_log",
            "alert",
            "kpi_snapshot",
            "extraction_lot",
            "comment",
            "commit_merge_request",
            "git_commit",
            "merge_request",
            "developer_project",
            "developer_site",
            "developer_group_link",
            "developer_status_history",
            "developer"
        ]
        
        # Désactivation temporaire des contraintes pour un nettoyage propre
        db.execute(text("SET session_replication_role = 'replica';"))
        
        for table in tables_to_truncate:
            logger.info(f"Vidage de la table : {table}")
            db.execute(text(f"TRUNCATE TABLE \"{table}\" RESTART IDENTITY CASCADE;"))
        
        # Réactivation des contraintes
        db.execute(text("SET session_replication_role = 'origin';"))
        
        db.commit()
        logger.info("✅ Nettoyage terminé avec succès !")
        logger.info("Vous pouvez maintenant ré-importer vos CSV proprement.")
        
    except Exception as e:
        db.rollback()
        logger.error(f"❌ Erreur lors du reset : {e}")
    finally:
        db.close()

if __name__ == "__main__":
    hard_reset()
