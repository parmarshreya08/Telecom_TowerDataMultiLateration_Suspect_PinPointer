"""
LocalizationFix contract model.
Represents a single resolved suspect position fix produced by the
trilateration + Kalman localization engine, ready for GeoJSON serialization.
"""

from datetime import datetime
from typing import Optional
from uuid import UUID

from pydantic import BaseModel, Field, field_validator

from app.utils.datetime_utils import now_ist


class LocalizationFix(BaseModel):
    """
    A resolved position estimate for a suspect at a point in time.
    """
    fix_id: UUID = Field(
        ...,
        description="Unique identifier generated for this localization fix.",
        examples=["5c9f1c2e-8b6d-4b0e-9a2f-3c6d4e5a7b8c"],
    )
    case_id: str = Field(
        ...,
        description="Investigation case this fix belongs to.",
        examples=["CASE-2026-DEL-091"],
    )
    frame_id: Optional[UUID] = Field(
        default=None,
        description="Source MeasurementFrame that produced this fix.",
    )
    subscriber_identifier: str = Field(
        ...,
        description="Suspect identity (MSISDN/IMSI) being tracked.",
        examples=["919876543210"],
    )
    timestamp: datetime = Field(
        ...,
        description="UTC timestamp associated with the fix.",
    )
    latitude: float = Field(
        ...,
        description="WGS84 latitude of the resolved position.",
        examples=[21.1702],
    )
    longitude: float = Field(
        ...,
        description="WGS84 longitude of the resolved position.",
        examples=[72.8311],
    )
    velocity_east: Optional[float] = Field(
        default=None,
        description="Eastward velocity component in m/s (UTM frame).",
    )
    velocity_north: Optional[float] = Field(
        default=None,
        description="Northward velocity component in m/s (UTM frame).",
    )
    confidence_radius_meters: float = Field(
        ...,
        description="Estimated 95% confidence radius around the fix in meters.",
        examples=[120.5],
    )
    gdop: Optional[float] = Field(
        default=None,
        description="Geometric Dilution of Precision of the resolving geometry.",
    )
    residual_rms: Optional[float] = Field(
        default=None,
        description="RMS residual error of the trilateration solve in meters.",
    )
    ta_inner_m: Optional[float] = Field(
        default=None,
        description="Inner radius of the TA-derived range band in meters.",
    )
    ta_outer_m: Optional[float] = Field(
        default=None,
        description="Outer radius of the TA-derived range band in meters.",
    )
    rss_i_dbm: Optional[float] = Field(
        default=None,
        description="Received Signal Strength Indicator in dBm at the fix timestamp.",
    )
    covariance_json: Optional[dict] = Field(
        default=None,
        description="2x2 covariance matrix as JSON [[a,b],[c,d]].",
    )
    created_at: datetime = Field(
        default_factory=now_ist,
        description="Timestamp when the fix was computed.",
    )

    @field_validator("latitude")
    @classmethod
    def validate_latitude(cls, val: float) -> float:
        if not (-90.0 <= val <= 90.0):
            raise ValueError("Latitude must be between -90 and 90 degrees.")
        return val

    @field_validator("longitude")
    @classmethod
    def validate_longitude(cls, val: float) -> float:
        if not (-180.0 <= val <= 180.0):
            raise ValueError("Longitude must be between -180 and 180 degrees.")
        return val

    @field_validator("confidence_radius_meters")
    @classmethod
    def validate_confidence_radius(cls, val: float) -> float:
        if val < 0.0:
            raise ValueError("Confidence radius must be non-negative.")
        return val
