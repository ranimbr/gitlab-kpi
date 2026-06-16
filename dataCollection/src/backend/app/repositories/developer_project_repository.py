"""
repositories/developer_project_repository.py

"""
from datetime import datetime, timezone, date, timedelta
from typing import List, Optional

import sqlalchemy as sa
from sqlalchemy.orm import Session, joinedload

from app.models.developer_project import DeveloperProject
from app.models.developer import Developer
from app.repositories.base import BaseRepository


class DeveloperProjectRepository(BaseRepository[DeveloperProject]):

    def __init__(self):
        super().__init__(DeveloperProject)

    def get_by_developer(self, db: Session, developer_id: int, active_only: bool = False) -> List[DeveloperProject]:
        query = db.query(DeveloperProject).filter(DeveloperProject.developer_id == developer_id)
        if active_only:
            query = query.filter(DeveloperProject.is_active == True)
        return query.all()

    def sync_smart(
        self,
        db:           Session,
        developer_id: int,
        project_ids:  List[int],
        p_start=None,
        p_end=None,
        mutation_date: Optional[date] = None,
    ) -> None:
        """[SCD2] Synchronisation robuste des missions projets."""
        has_explicit_mutation_date = (mutation_date is not None)
        today = date.today()
        p_start_date = p_start
        if p_start:
            if isinstance(p_start, datetime):
                p_start_date = p_start.date()
            elif isinstance(p_start, date):
                p_start_date = p_start
            elif hasattr(p_start, "date"):
                p_start_date = p_start.date()
        m_date = mutation_date if mutation_date else (p_start_date if p_start_date else today)
        
        #  Onboarding Floor
        dev = db.get(Developer, developer_id)
        if dev and dev.onboarding_date:
            if m_date < dev.onboarding_date:
                m_date = dev.onboarding_date
                
        close_date = m_date - timedelta(days=1)

        current_missions = db.query(DeveloperProject).filter(
            DeveloperProject.developer_id == developer_id,
            DeveloperProject.is_active == True
        ).all()
        current_ids = {m.project_id for m in current_missions}
        desired_ids = set(project_ids)

        # 1. Clôture des missions retirées
        for m in current_missions:
            if m.project_id not in desired_ids:
                #  Mutation seulement si explicite
                if has_explicit_mutation_date and m.start_date and m_date > m.start_date:
                    m.is_active = False
                    m.end_date = close_date
                else:
                    db.delete(m)

        # 2. Ajout des nouvelles missions
        for pid in desired_ids:
            if pid not in current_ids:
                db.add(DeveloperProject(
                    developer_id=developer_id, project_id=pid,
                    is_active=True, start_date=m_date, end_date=None
                ))

        db.flush()
        self._normalize_history(db, developer_id)
        db.flush()

    def _normalize_history(self, db: Session, developer_id: int) -> None:
        """[ENTERPRISE] Reconstruit la timeline des missions par projet."""
        from app.models.developer import Developer
        import sqlalchemy as sa
        
        db.execute(sa.text("DELETE FROM developer_project WHERE developer_id = :d_id AND end_date < start_date"), {"d_id": developer_id})
        
        distinct_projects = db.query(DeveloperProject.project_id).filter(DeveloperProject.developer_id == developer_id).distinct().all()
        dev = db.get(Developer, developer_id)

        for (pid,) in distinct_projects:
            segments = db.query(DeveloperProject).filter(
                DeveloperProject.developer_id == developer_id,
                DeveloperProject.project_id == pid
            ).order_by(DeveloperProject.start_date.asc()).all()

            if not segments: continue

            #  Onboarding Floor
            if dev and dev.onboarding_date:
                first = segments[0]
                if first.start_date < dev.onboarding_date:
                    first.start_date = dev.onboarding_date

            i = 0
            while i < len(segments) - 1:
                curr, nxt = segments[i], segments[i+1]
                
                # Cas 1 : Même état ET contigus -> on fusionne
                if curr.is_active == nxt.is_active:
                    is_contiguous = (
                        curr.end_date is not None and
                        nxt.start_date is not None and
                        (nxt.start_date - curr.end_date).days <= 1
                    )
                    if is_contiguous:
                        curr.end_date = nxt.end_date
                        db.delete(nxt)
                        segments.pop(i+1)
                        continue
                
                # Cas 2 : État différent ou même état non-contigu (Suspension)
                # On ne comble le gap que si c'est un changement de projet/état ET un petit gap
                gap_date = nxt.start_date - timedelta(days=1)
                if curr.end_date is None or (nxt.start_date - curr.end_date).days <= 30:
                    if curr.end_date != gap_date:
                        # Si ce n'est pas une suspension claire, on ferme le gap
                        pass # On ne ferme plus aveuglément les gaps pour protéger l'historique
                
                i += 1
            
            # Continuity rule
            if segments:
                last = segments[-1]
                if dev and not dev.offboarding_date:
                    if last.is_active and last.end_date is not None:
                        last.end_date = None
                elif dev and dev.offboarding_date:
                    if last.end_date != dev.offboarding_date:
                        last.end_date = dev.offboarding_date