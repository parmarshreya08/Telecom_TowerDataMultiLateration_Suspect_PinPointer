"""
SQLAlchemy database models for E-Rakshak.
Defines tables for uploads, subscriber activity logs, site towers, and measurement frames.
Matches the properties defined in contracts.
"""

from datetime import datetime
from typing import Optional
from uuid import UUID

from sqlalchemy import JSON, DateTime, ForeignKey, Float, Integer, String
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.database.base import Base


class UploadMetadataModel(Base):
    """
    Tracks metadata records of uploaded telecom files.
    """
    __tablename__ = "upload_metadata"

    upload_id: Mapped[UUID] = mapped_column(primary_key=True)
    case_id: Mapped[str] = mapped_column(String(50), index=True, nullable=False)
    source_type: Mapped[str] = mapped_column(String(50), nullable=False)
    operator: Mapped[str] = mapped_column(String(50), nullable=False)
    original_filename: Mapped[str] = mapped_column(String(255), nullable=False)
    stored_filename: Mapped[str] = mapped_column(String(255), nullable=False)
    sha256: Mapped[str] = mapped_column(String(64), unique=True, index=True, nullable=False)
    mime_type: Mapped[str] = mapped_column(String(100), nullable=False)
    file_size_bytes: Mapped[int] = mapped_column(Integer, nullable=False)
    uploaded_by: Mapped[str] = mapped_column(String(100), nullable=False)
    uploaded_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow, nullable=False)


class SubscriberEventRecordModel(Base):
    """
    Stores normalized CDR activity records for subscribers.
    """
    __tablename__ = "subscriber_event_records"

    event_id: Mapped[UUID] = mapped_column(primary_key=True)
    upload_id: Mapped[UUID] = mapped_column(
        ForeignKey("upload_metadata.upload_id", ondelete="CASCADE"), index=True, nullable=False
    )
    operator: Mapped[str] = mapped_column(String(50), nullable=False)
    source_type: Mapped[str] = mapped_column(String(50), nullable=False)
    phone_number: Mapped[Optional[str]] = mapped_column(String(50), index=True, nullable=True)
    imei: Mapped[Optional[str]] = mapped_column(String(50), index=True, nullable=True)
    imsi: Mapped[Optional[str]] = mapped_column(String(50), index=True, nullable=True)
    timestamp: Mapped[datetime] = mapped_column(DateTime, index=True, nullable=False)
    call_type: Mapped[str] = mapped_column(String(50), nullable=False)
    duration_seconds: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    cgi: Mapped[str] = mapped_column(String(100), index=True, nullable=False)
    mcc: Mapped[Optional[int]] = mapped_column(Integer, nullable=True)
    mnc: Mapped[Optional[int]] = mapped_column(Integer, nullable=True)
    lac: Mapped[Optional[int]] = mapped_column(Integer, nullable=True)
    cell_id: Mapped[Optional[int]] = mapped_column(Integer, nullable=True)
    tower_latitude: Mapped[Optional[float]] = mapped_column(Float, nullable=True)
    tower_longitude: Mapped[Optional[float]] = mapped_column(Float, nullable=True)
    signal_strength: Mapped[Optional[float]] = mapped_column(Float, nullable=True)
    timing_advance: Mapped[Optional[int]] = mapped_column(Integer, nullable=True)
    rtt: Mapped[Optional[float]] = mapped_column(Float, nullable=True)
    source_file: Mapped[str] = mapped_column(String(255), nullable=False)
    record_number: Mapped[int] = mapped_column(Integer, nullable=False)
    raw_fields: Mapped[dict] = mapped_column(JSON, default=dict, nullable=False)


class TowerRecordModel(Base):
    """
    Stores static location maps of operator cell transceivers.
    """
    __tablename__ = "tower_records"

    tower_id: Mapped[UUID] = mapped_column(primary_key=True)
    operator: Mapped[str] = mapped_column(String(50), nullable=False)
    radio: Mapped[str] = mapped_column(String(50), nullable=False)
    mcc: Mapped[int] = mapped_column(Integer, nullable=False)
    mnc: Mapped[int] = mapped_column(Integer, nullable=False)
    lac: Mapped[int] = mapped_column(Integer, nullable=False)
    cell_id: Mapped[int] = mapped_column(Integer, nullable=False)
    cgi: Mapped[str] = mapped_column(String(100), unique=True, index=True, nullable=False)
    latitude: Mapped[float] = mapped_column(Float, nullable=False)
    longitude: Mapped[float] = mapped_column(Float, nullable=False)
    azimuth: Mapped[Optional[float]] = mapped_column(Float, nullable=True)
    beamwidth: Mapped[Optional[float]] = mapped_column(Float, nullable=True)
    range_meters: Mapped[Optional[float]] = mapped_column(Float, nullable=True)
    site_address: Mapped[Optional[str]] = mapped_column(String(500), nullable=True)


class MeasurementFrameModel(Base):
    """
    Saves temporal/spatial frames compiled for suspects.
    """
    __tablename__ = "measurement_frames"

    frame_id: Mapped[UUID] = mapped_column(primary_key=True)
    upload_id: Mapped[UUID] = mapped_column(
        ForeignKey("upload_metadata.upload_id", ondelete="CASCADE"), index=True, nullable=False
    )
    subscriber_identifier: Mapped[str] = mapped_column(String(50), index=True, nullable=False)
    timestamp: Mapped[datetime] = mapped_column(DateTime, index=True, nullable=False)
    status: Mapped[str] = mapped_column(String(50), nullable=False)

    towers: Mapped[list["MeasurementTowerModel"]] = relationship(
        back_populates="frame", cascade="all, delete-orphan", lazy="selectin"
    )


class MeasurementTowerModel(Base):
    """
    Records signal records for cell towers grouped under a Measurement Frame.
    """
    __tablename__ = "measurement_towers"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    frame_id: Mapped[UUID] = mapped_column(
        ForeignKey("measurement_frames.frame_id", ondelete="CASCADE"), index=True, nullable=False
    )
    tower_id: Mapped[UUID] = mapped_column(ForeignKey("tower_records.tower_id", ondelete="CASCADE"), nullable=False)
    cgi: Mapped[str] = mapped_column(String(100), nullable=False)
    latitude: Mapped[float] = mapped_column(Float, nullable=False)
    longitude: Mapped[float] = mapped_column(Float, nullable=False)
    azimuth: Mapped[Optional[float]] = mapped_column(Float, nullable=True)
    beamwidth: Mapped[Optional[float]] = mapped_column(Float, nullable=True)
    signal_strength: Mapped[Optional[float]] = mapped_column(Float, nullable=True)
    timing_advance: Mapped[Optional[int]] = mapped_column(Integer, nullable=True)
    rtt: Mapped[Optional[float]] = mapped_column(Float, nullable=True)
    pseudorange_meters: Mapped[Optional[float]] = mapped_column(Float, nullable=True)

    frame: Mapped[MeasurementFrameModel] = relationship(back_populates="towers")
