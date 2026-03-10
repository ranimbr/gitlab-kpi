from sqlalchemy.orm import DeclarativeBase, declared_attr
from sqlalchemy import Column, DateTime, func


class Base(DeclarativeBase):

    __abstract__ = True

    @declared_attr.directive
    def __tablename__(cls):

        return cls.__name__.lower()

    created_at = Column(

        DateTime(timezone=True),

        server_default=func.timezone(
            "utc",
            func.now()
        ),

        nullable=False

    )

    updated_at = Column(

        DateTime(timezone=True),

        server_default=func.timezone(
            "utc",
            func.now()
        ),

        onupdate=func.timezone(
            "utc",
            func.now()
        ),

        nullable=False
    )