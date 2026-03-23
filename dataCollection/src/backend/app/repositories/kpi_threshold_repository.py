"""
repositories/kpi_threshold_repository.py

CORRECTIONS :

    1. FIX CRITIQUE — renommage KpiThreshold.type → KpiThreshold.threshold_type
       Tous les filtres utilisant .type sont mis à jour.
       AVANT : KpiThreshold.type == threshold_type   → AttributeError
       APRÈS : KpiThreshold.threshold_type == ...    ✅

    2. kpi_name est une @property (pas une colonne DB).
       Utiliser @property dans filter() ou order_by() → crash SQLAlchemy.
       ✅ FIX : tous les filtres utilisent kpi_definition_id (FK réelle).
       Pour order_by : JOIN sur KpiDefinition et order_by(KpiDefinition.code).

    3. upsert() : clé unique alignée sur idx_kpi_threshold_unique du modèle
       = (COALESCE(dashboard_id, -1), kpi_definition_id, threshold_type, project_id).

    4. get_by_id() : override avec joinedload(kpi_definition) obligatoire
       pour que la @property kpi_name soit accessible sans lazy-load.
"""
from typing import Optional, List

from sqlalchemy.orm import Session, joinedload

from app.models.kpi_definition import KpiDefinition
from app.models.kpi_threshold import KpiThreshold
from app.repositories.base import BaseRepository


class KpiThresholdRepository(BaseRepository[KpiThreshold]):

    def __init__(self):
        super().__init__(KpiThreshold)

    # =========================================================================
    # READ
    # =========================================================================

    def get_by_id(self, db: Session, obj_id: int) -> Optional[KpiThreshold]:
        """
        Override avec eager-load kpi_definition.
        ✅ OBLIGATOIRE : sans joinedload, la @property kpi_name
        déclencherait un lazy-load hors session → DetachedInstanceError.
        """
        return (
            db.query(KpiThreshold)
            .options(joinedload(KpiThreshold.kpi_definition))
            .filter(KpiThreshold.id == obj_id)
            .one_or_none()
        )

    def get_by_project(
        self,
        db:         Session,
        project_id: int,
    ) -> List[KpiThreshold]:
        """
        Seuils d'un projet, triés par code KPI.
        ✅ FIX : order_by sur KpiDefinition.code (colonne DB), pas @property.
        """
        return (
            db.query(KpiThreshold)
            .options(joinedload(KpiThreshold.kpi_definition))
            .join(KpiDefinition, KpiThreshold.kpi_definition_id == KpiDefinition.id)
            .filter(KpiThreshold.project_id == project_id)
            .order_by(KpiDefinition.code)
            .all()
        )

    def get_by_dashboard(
        self,
        db:           Session,
        dashboard_id: int,
    ) -> List[KpiThreshold]:
        """
        Seuils d'un dashboard, triés par code KPI.
        ✅ FIX : order_by sur KpiDefinition.code (colonne DB), pas @property.
        """
        return (
            db.query(KpiThreshold)
            .options(joinedload(KpiThreshold.kpi_definition))
            .join(KpiDefinition, KpiThreshold.kpi_definition_id == KpiDefinition.id)
            .filter(KpiThreshold.dashboard_id == dashboard_id)
            .order_by(KpiDefinition.code)
            .all()
        )

    def get_by_dashboard_and_definition(
        self,
        db:                Session,
        dashboard_id:      int,
        kpi_definition_id: int,
        threshold_type:    Optional[str] = None,
    ) -> Optional[KpiThreshold]:
        """
        Méthode canonique — lookup par (dashboard_id, kpi_definition_id, threshold_type).
        Correspond à la contrainte unique idx_kpi_threshold_unique du modèle.
        ✅ FIX : threshold_type filtre sur KpiThreshold.threshold_type (renommé depuis .type).
        """
        q = (
            db.query(KpiThreshold)
            .options(joinedload(KpiThreshold.kpi_definition))
            .filter(
                KpiThreshold.dashboard_id      == dashboard_id,
                KpiThreshold.kpi_definition_id == kpi_definition_id,
            )
        )
        if threshold_type is not None:
            # ✅ FIX : threshold_type au lieu de type
            q = q.filter(KpiThreshold.threshold_type == threshold_type)
        return q.one_or_none()

    def get_by_project_and_definition(
        self,
        db:                Session,
        project_id:        int,
        kpi_definition_id: int,
    ) -> Optional[KpiThreshold]:
        """
        ✅ FIX : filtre sur kpi_definition_id (FK), pas @property kpi_name.
        """
        return (
            db.query(KpiThreshold)
            .options(joinedload(KpiThreshold.kpi_definition))
            .filter(
                KpiThreshold.project_id        == project_id,
                KpiThreshold.kpi_definition_id == kpi_definition_id,
            )
            .one_or_none()
        )

    def get_by_kpi_definition_id(
        self,
        db:                Session,
        kpi_definition_id: int,
    ) -> List[KpiThreshold]:
        """Tous les seuils liés à une KpiDefinition."""
        return (
            db.query(KpiThreshold)
            .options(joinedload(KpiThreshold.kpi_definition))
            .filter(KpiThreshold.kpi_definition_id == kpi_definition_id)
            .all()
        )

    def get_by_kpi_code(
        self,
        db:         Session,
        project_id: int,
        kpi_code:   str,
    ) -> Optional[KpiThreshold]:
        """
        Lookup par code KPI string (ex: "AVG_REVIEW_TIME") + project_id.
        JOIN sur KpiDefinition pour résoudre code → id.
        ✅ Utilise KpiDefinition.code (colonne DB), pas @property.
        """
        return (
            db.query(KpiThreshold)
            .options(joinedload(KpiThreshold.kpi_definition))
            .join(KpiDefinition, KpiThreshold.kpi_definition_id == KpiDefinition.id)
            .filter(
                KpiThreshold.project_id == project_id,
                KpiDefinition.code      == kpi_code,
            )
            .one_or_none()
        )

    def exists_for_dashboard(
        self,
        db:                Session,
        dashboard_id:      int,
        kpi_definition_id: int,
        threshold_type:    Optional[str] = None,
    ) -> bool:
        return (
            self.get_by_dashboard_and_definition(
                db, dashboard_id, kpi_definition_id, threshold_type
            ) is not None
        )

    # =========================================================================
    # WRITE
    # =========================================================================

    def upsert(
        self,
        db:                Session,
        project_id:        int,
        kpi_definition_id: int,
        data:              dict,
        dashboard_id:      Optional[int] = None,
        threshold_type:    Optional[str] = None,
    ) -> KpiThreshold:
        """
        Crée ou met à jour un seuil KPI.

        ✅ FIX : clé unique alignée sur idx_kpi_threshold_unique du modèle :
            (COALESCE(dashboard_id, -1), kpi_definition_id, threshold_type, project_id)

        Priorité de lookup :
            1. (dashboard_id, kpi_definition_id, threshold_type) si dashboard_id fourni
            2. (project_id, kpi_definition_id) sinon (seuil global projet)
        """
        existing = None

        if dashboard_id is not None:
            existing = self.get_by_dashboard_and_definition(
                db, dashboard_id, kpi_definition_id, threshold_type
            )

        if existing is None:
            existing = self.get_by_project_and_definition(
                db, project_id, kpi_definition_id
            )

        if existing:
            excluded = {"project_id", "kpi_definition_id", "dashboard_id"}
            for key, value in data.items():
                if key not in excluded and hasattr(existing, key):
                    setattr(existing, key, value)
            db.flush()
            return existing

        threshold = KpiThreshold(**data)
        db.add(threshold)
        db.flush()
        return threshold