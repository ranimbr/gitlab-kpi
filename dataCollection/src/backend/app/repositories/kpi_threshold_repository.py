"""
repositories/kpi_threshold_repository.py

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
        
        return (
            db.query(KpiThreshold)
            .options(joinedload(KpiThreshold.kpi_definition))
            .join(KpiDefinition, KpiThreshold.kpi_definition_id == KpiDefinition.id)
            .filter(KpiThreshold.project_id == project_id)
            .order_by(KpiDefinition.code)
            .all()
        )

    # DISABLED: Dashboard functionality removed
    # def get_by_dashboard(
    #     self,
    #     db:           Session,
    #     dashboard_id: int,
    # ) -> List[KpiThreshold]:
    #     
    #     return (
    #         db.query(KpiThreshold)
    #         .options(joinedload(KpiThreshold.kpi_definition))
    #         .join(KpiDefinition, KpiThreshold.kpi_definition_id == KpiDefinition.id)
    #         .filter(KpiThreshold.dashboard_id == dashboard_id)
    #         .order_by(KpiDefinition.code)
    #         .all()
    #     )

    # DISABLED: Dashboard functionality removed
    # def get_by_dashboard_and_definition(
    #     self,
    #     db:                Session,
    #     dashboard_id:      int,
    #     kpi_definition_id: int,
    #     threshold_type:    Optional[str] = None,
    # ) -> Optional[KpiThreshold]:
    #    
    #     q = (
    #         db.query(KpiThreshold)
    #         .options(joinedload(KpiThreshold.kpi_definition))
    #         .filter(
    #             KpiThreshold.dashboard_id      == dashboard_id,
    #             KpiThreshold.kpi_definition_id == kpi_definition_id,
    #         )
    #     )
    #     if threshold_type is not None:
    #         # ✅ FIX : threshold_type au lieu de type
    #         q = q.filter(KpiThreshold.threshold_type == threshold_type)
    #     return q.one_or_none()

    def get_by_project_and_definition(
        self,
        db:                Session,
        project_id:        int,
        kpi_definition_id: int,
    ) -> Optional[KpiThreshold]:
        
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

    # DISABLED: Dashboard functionality removed
    # def exists_for_dashboard(
    #     self,
    #     db:                Session,
    #     dashboard_id:      int,
    #     kpi_definition_id: int,
    #     threshold_type:    Optional[str] = None,
    # ) -> bool:
    #     return (
    #         self.get_by_dashboard_and_definition(
    #             db, dashboard_id, kpi_definition_id, threshold_type
    #         ) is not None
    #     )

    # =========================================================================
    # WRITE
    # =========================================================================

    def upsert(
        self,
        db:                Session,
        project_id:        int,
        kpi_definition_id: int,
        data:              dict,
        # DISABLED: Dashboard functionality removed
        # dashboard_id:      Optional[int] = None,
        threshold_type:    Optional[str] = None,
    ) -> KpiThreshold:
       
        existing = None

        # DISABLED: Dashboard functionality removed
        # if dashboard_id is not None:
        #     existing = self.get_by_dashboard_and_definition(
        #         db, dashboard_id, kpi_definition_id, threshold_type
        #     )

        if existing is None:
            existing = self.get_by_project_and_definition(
                db, project_id, kpi_definition_id
            )

        if existing:
            excluded = {"project_id", "kpi_definition_id"}  # "dashboard_id" removed
            for key, value in data.items():
                if key not in excluded and hasattr(existing, key):
                    setattr(existing, key, value)
            db.flush()
            return existing

        threshold = KpiThreshold(**data)
        db.add(threshold)
        db.flush()
        return threshold