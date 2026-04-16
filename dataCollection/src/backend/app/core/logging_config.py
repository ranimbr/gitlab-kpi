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

    class JsonFormatter(logging.Formatter):
        def format(self, record):
            import json
            from datetime import datetime
            log_record = {
                "timestamp": datetime.fromtimestamp(record.created).isoformat() + "Z",
                "level": record.levelname,
                "name": record.name,
                "message": record.getMessage(),
            }
            if hasattr(record, "extra"):
                log_record.update(record.extra)
            if record.exc_info:
                log_record["exception"] = self.formatException(record.exc_info)
            return json.dumps(log_record)

    json_formatter = JsonFormatter()
    
    stream_handler = logging.StreamHandler()
    stream_handler.setFormatter(logging.Formatter("%(asctime)s | %(levelname)s | %(name)s | %(message)s"))
    
    file_handler = logging.FileHandler(log_file, encoding="utf-8")
    file_handler.setFormatter(json_formatter)

    handlers: list = [stream_handler, file_handler]

    logging.basicConfig(
        level   = level,
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