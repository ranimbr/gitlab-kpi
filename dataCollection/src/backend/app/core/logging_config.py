"""
core/logging_config.py

CORRECTION :
    FileHandler("app.log") avec chemin hardcodé en CWD →
    ✅ FIX : chemin depuis settings.LOG_FILE, répertoire créé automatiquement.
    
    Aussi : le niveau DEBUG n'était jamais activé car setup_logging()
    était appelé sans debug= dans main.py. Le bug est corrigé dans main.py,
    mais ce fichier gère correctement le paramètre debug.
"""
import logging
import os
from pathlib import Path


def setup_logging(debug: bool = False, log_file: str = "logs/app.log") -> None:
    """
    Configure le logging de l'application.

    Args:
        debug:    True → niveau DEBUG, False → niveau INFO
        log_file: Chemin vers le fichier de log (créé si inexistant)
    """
    level = logging.DEBUG if debug else logging.INFO

    # ✅ FIX : crée le répertoire de logs si nécessaire
    log_path = Path(log_file)
    log_path.parent.mkdir(parents=True, exist_ok=True)

    handlers: list = [
        logging.StreamHandler(),
        logging.FileHandler(log_file, encoding="utf-8"),
    ]

    logging.basicConfig(
        level   = level,
        format  = "%(asctime)s | %(levelname)s | %(name)s | %(message)s",
        handlers = handlers,
        force   = True,  # réinitialise les handlers si déjà configurés
    )

    # Réduire le bruit des librairies externes en mode non-debug
    if not debug:
        logging.getLogger("sqlalchemy.engine").setLevel(logging.WARNING)
        logging.getLogger("httpx").setLevel(logging.WARNING)
        logging.getLogger("apscheduler").setLevel(logging.WARNING)

    logging.getLogger(__name__).info(
        f"Logging configured — level={'DEBUG' if debug else 'INFO'} "
        f"file={log_file}"
    )