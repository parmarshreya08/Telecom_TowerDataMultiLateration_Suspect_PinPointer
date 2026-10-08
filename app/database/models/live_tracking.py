from typing import Optional
from uuid import UUID, uuid4
from datetime import datetime

from sqlalchemy import Boolean, DateTime, Float, ForeignKey, String, func
from sqlalchemy.orm import Mapped, mapped_column

from app.database.base import Base

class LiveTrackingSession(Base):
    """
    Stores active/historical live tracking authorization sessions based on IMSI.
    """
    __tablename__ = "live_tracking_sessions"

    imsi: Mapped[str] = mapped_column(String(50), primary_key=True, index=True)
    case_id: Mapped[str] = mapped_column(String(50), index=True, nullable=False)
    is_active: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)
    authorized_at: Mapped[datetime] = mapped_column(DateTime, default=func.now(), nullable=False)

class LiveTrackingFixModel(Base):
    """
    Stores significant anchor points generated during live tracking.
    """
    __tablename__ = "live_tracking_fixes"

    fix_id: Mapped[UUID] = mapped_column(primary_key=True, default=uuid4)
    imsi: Mapped[str] = mapped_column(String(50), ForeignKey("live_tracking_sessions.imsi", ondelete="CASCADE"), index=True, nullable=False)
    timestamp: Mapped[datetime] = mapped_column(DateTime, index=True, nullable=False)
    latitude: Mapped[float] = mapped_column(Float, nullable=False)
    longitude: Mapped[float] = mapped_column(Float, nullable=False)
    is_significant_anchor: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)
