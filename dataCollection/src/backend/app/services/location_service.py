
import pytz
from typing import Optional, Dict

class LocationService:
    """
    [SENIOR SERVICE] Gestionnaire de géolocalisation et fuseaux horaires.
    Conçu pour une utilisation internationale (Telnet & Partenaires).
    """

    # Mapping étendu pour une entreprise internationale
    CITY_MAPPING = {
        # Tunisie
        "tunis": {"country": "Tunisie", "timezone": "Africa/Tunis"},
        "sfax":  {"country": "Tunisie", "timezone": "Africa/Tunis"},
        "sousse": {"country": "Tunisie", "timezone": "Africa/Tunis"},
        "bizerte": {"country": "Tunisie", "timezone": "Africa/Tunis"},
        
        # France
        "paris": {"country": "France", "timezone": "Europe/Paris"},
        "lyon":  {"country": "France", "timezone": "Europe/Paris"},
        "marseille": {"country": "France", "timezone": "Europe/Paris"},
        "nice":  {"country": "France", "timezone": "Europe/Paris"},
        "toulouse": {"country": "France", "timezone": "Europe/Paris"},
        
        # Maroc
        "casablanca": {"country": "Maroc", "timezone": "Africa/Casablanca"},
        "rabat":      {"country": "Maroc", "timezone": "Africa/Casablanca"},
        
        # International / Autres
        "london": {"country": "UK", "timezone": "Europe/London"},
        "berlin": {"country": "Allemagne", "timezone": "Europe/Berlin"},
        "dubai":  {"country": "UAE", "timezone": "Asia/Dubai"},
        "new york": {"country": "USA", "timezone": "America/New_York"},
    }

    @staticmethod
    def guess_metadata(name: str) -> Dict[str, Optional[str]]:
        """
        Détermine intelligemment le pays et le fuseau horaire à partir d'un nom de site.
        """
        n = name.lower().strip()
        
        # 1. Recherche par mot-clé exact ou partiel
        for city, data in LocationService.CITY_MAPPING.items():
            if city in n:
                return data
        
        # 2. Fallback si non trouvé
        return {
            "country": "À définir",
            "timezone": None
        }

    @staticmethod
    def is_valid_timezone(tz_name: str) -> bool:
        """Vérifie si une chaîne est un fuseau horaire IANA valide."""
        try:
            pytz.timezone(tz_name)
            return True
        except pytz.exceptions.UnknownTimeZoneError:
            return False

    @staticmethod
    def get_all_timezones():
        """Retourne la liste complète des fuseaux horaires IANA pour l'UI."""
        return pytz.all_timezones
