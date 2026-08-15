"""
SQLAlchemy models for E-Rakshak authentication: officers and auth sessions.
"""

from datetime import datetime
from uuid import UUID

from app.utils.datetime_utils import now_ist

from sqlalchemy import Boolean, DateTime, ForeignKey, String
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.database.base import Base


class OfficerModel(Base):
    """
    Registered law-enforcement officer account with RBAC support.
    """
    __tablename__ = "officers"

    officer_id: Mapped[UUID] = mapped_column(primary_key=True)
    officer_name: Mapped[str] = mapped_column(String(255), nullable=False)
    email: Mapped[str] = mapped_column(String(255), unique=True, index=True, nullable=False)
    password_hash: Mapped[str] = mapped_column(String(255), nullable=False)
    role: Mapped[str] = mapped_column(String(50), default="INSPECTOR", nullable=False)
    is_active: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=now_ist, nullable=False)
    updated_at: Mapped[datetime] = mapped_column(DateTime, default=now_ist, onupdate=now_ist, nullable=False)

    sessions: Mapped[list["AuthSessionModel"]] = relationship(
        back_populates="officer", cascade="all, delete-orphan", lazy="selectin"
    )
    assignments: Mapped[list["CaseAssignmentModel"]] = relationship(
        back_populates="officer", cascade="all, delete-orphan", lazy="selectin"
    )


class AuthSessionModel(Base):
    """
    Server-side session record for JWT revocation (per-device logout and logout-all).
    """
    __tablename__ = "auth_sessions"

    session_id: Mapped[UUID] = mapped_column(primary_key=True)
    officer_id: Mapped[UUID] = mapped_column(
        ForeignKey("officers.officer_id", ondelete="CASCADE"), index=True, nullable=False
    )
    jti: Mapped[str] = mapped_column(String(64), unique=True, index=True, nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=now_ist, nullable=False)
    expires_at: Mapped[datetime] = mapped_column(DateTime, nullable=False)
    revoked_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)

    officer: Mapped[OfficerModel] = relationship(back_populates="sessions")