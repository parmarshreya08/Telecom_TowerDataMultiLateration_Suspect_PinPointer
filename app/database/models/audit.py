"""
SQLAlchemy models for E-Rakshak: Audit logging and Case Assignments.
"""

from datetime import datetime
from typing import Optional
from uuid import UUID

from app.utils.datetime_utils import now_ist

from sqlalchemy import JSON, DateTime, ForeignKey, String, Text
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.database.base import Base


class AuditLogModel(Base):
    """
    Immutable security and forensic audit trail record.
    """
    __tablename__ = "audit_logs"

    log_id: Mapped[UUID] = mapped_column(primary_key=True)
    timestamp: Mapped[datetime] = mapped_column(DateTime, default=now_ist, index=True, nullable=False)
    actor_id: Mapped[Optional[UUID]] = mapped_column(ForeignKey("officers.officer_id", ondelete="SET NULL"), nullable=True, index=True)
    actor_name: Mapped[str] = mapped_column(String(255), default="System", nullable=False)
    actor_email: Mapped[Optional[str]] = mapped_column(String(255), nullable=True)
    actor_role: Mapped[str] = mapped_column(String(50), default="UNKNOWN", nullable=False)
    action: Mapped[str] = mapped_column(String(100), index=True, nullable=False)
    case_id: Mapped[Optional[str]] = mapped_column(String(50), nullable=True, index=True)
    target_resource: Mapped[Optional[str]] = mapped_column(String(255), nullable=True)
    status: Mapped[str] = mapped_column(String(50), default="SUCCESS", nullable=False)
    details: Mapped[Optional[dict]] = mapped_column(JSON, nullable=True)
    ip_address: Mapped[Optional[str]] = mapped_column(String(45), nullable=True)


class CaseAssignmentModel(Base):
    """
    Mapping between an investigation case and assigned officer.
    """
    __tablename__ = "case_assignments"

    assignment_id: Mapped[UUID] = mapped_column(primary_key=True)
    case_id: Mapped[str] = mapped_column(ForeignKey("cases.case_id", ondelete="CASCADE"), index=True, nullable=False)
    officer_id: Mapped[UUID] = mapped_column(ForeignKey("officers.officer_id", ondelete="CASCADE"), index=True, nullable=False)
    assigned_by: Mapped[str] = mapped_column(String(255), default="System", nullable=False)
    assigned_at: Mapped[datetime] = mapped_column(DateTime, default=now_ist, nullable=False)

    officer: Mapped["OfficerModel"] = relationship("OfficerModel", back_populates="assignments")
