"""
api/routers/period_filters.py
 
NOTE ARCHITECTURE :
    Les endpoints de gestion des PeriodFilters sont intégrés dans
    dashboards.py sous /{dashboard_id}/period-filters/
    (GET, POST, PUT, DELETE) — c'est la bonne approche car un filtre
    de période appartient toujours à un dashboard.
 
    Ce fichier est conservé vide intentionnellement pour éviter une
    erreur d'import dans api_router.py si le fichier est référencé.
 
    Si tu veux exposer les period-filters de façon autonome
    (ex: GET /period-filters?dashboard_id=X), déplace ici les
    endpoints correspondants depuis dashboards.py.
 
RECOMMANDATION :
    Ne PAS importer ce router dans api_router.py — les routes
    period-filters sont déjà exposées via dashboards.py.
    Supprimer ce fichier si il n'est pas importé nulle part.
"""