from sqlalchemy import Column, Integer, String, Boolean, Enum
from sqlalchemy.orm import relationship
import enum

from app.models.base import Base

class UserRoleEnum(str, enum.Enum):
    admin = "admin"
    user  = "user"

class AppUser(Base):
    """
    Utilisateur de l'application dashboard (admin ou user).
    Ne pas confondre avec Developer (contributeur GitLab).
    """
    __tablename__ = "app_user"

    id                   = Column(Integer, primary_key=True, index=True)
    email                = Column(String(255), unique=True, nullable=False, index=True)
    login                = Column(String(100), unique=True, nullable=True,  index=True)
    name                 = Column(String(255), nullable=True)
    hashed_password      = Column(String(255), nullable=False)
    role                 = Column(Enum(UserRoleEnum),
                                  default=UserRoleEnum.user, nullable=False)
    is_active            = Column(Boolean, default=True, nullable=False)
    dashboard_view_group = Column(String(100), nullable=True)

    # Relations
    extraction_lots = relationship(
        "ExtractionLot",
        back_populates="triggered_by_user",
        foreign_keys="ExtractionLot.triggered_by"
    )
    dashboard_accesses = relationship(
        "DashboardAccess",
        back_populates="user",
        cascade="all, delete-orphan"
    )
    # ✅ AJOUT
    kpi_thresholds = relationship(
        "KpiThreshold",
        back_populates="creator",
        foreign_keys="KpiThreshold.created_by"
    )