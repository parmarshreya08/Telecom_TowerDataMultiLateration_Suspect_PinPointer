from typing import Optional
from uuid import UUID, uuid4
from datetime import datetime

from sqlalchemy import Boolean, DateTime, Float, ForeignKeyConstraint, String, func
from sqlalchemy.orm import Mapped, mapped_column

from app.database.base import Base

class LiveTrackingSession(Base):
    """
    Stores active/historical live tracking authorization sessions.
    Keyed by (case_id, imsi): the same fugitive number can be tracked under
    several investigations without primary-key collisions.
    """
    __tablename__ = "live_tracking_sessions"

    case_id: Mapped[str] = mapped_column(String(50), primary_key=True)
    imsi: Mapped[str] = mapped_column(String(50), primary_key=True, index=True)
    is_active: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)
    authorized_at: Mapped[datetime] = mapped_column(DateTime, default=func.now(), nullable=False)

class LiveTrackingFixModel(Base):
    """
    Stores significant anchor points generated during live tracking.
    """
    __tablename__ = "live_tracking_fixes"
    __table_args__ = (
        ForeignKeyConstraint(
            ["case_id", "imsi"],
            ["live_tracking_sessions.case_id", "live_tracking_sessions.imsi"],
            ondelete="CASCADE",
        ),
    )

    fix_id: Mapped[UUID] = mapped_column(primary_key=True, default=uuid4)
    case_id: Mapped[str] = mapped_column(String(50), index=True, nullable=False)
    imsi: Mapped[str] = mapped_column(String(50), index=True, nullable=False)
    timestamp: Mapped[datetime] = mapped_column(DateTime, index=True, nullable=False)
    latitude: Mapped[float] = mapped_column(Float, nullable=False)
    longitude: Mapped[float] = mapped_column(Float, nullable=False)
    is_significant_anchor: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)
