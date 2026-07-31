"""
SQLAlchemy 2.x declarative base.
"""

from sqlalchemy.orm import DeclarativeBase


class Base(DeclarativeBase):
    """
    Common base class for all SQLAlchemy ORM models.
    """
    pass
