"""
RF / SDR ground-verification contracts.
Payloads for officer-carried SDR scans used to produce a last-50-m micro-fix.
"""

from datetime import datetime
from typing import Optional

from pydantic import BaseModel, Field, field_validator


class RfScan(BaseModel):
    """
    A single over-the-air RF scan taken at a known scanner position.

    ``rssi_dbm`` and ``bearing_deg`` feed the log-distance path-loss model
    and bearing intersection; ``frequency_mhz`` selects the path-loss exponent.
    """
    timestamp: datetime = Field(
        ...,
        description="UTC timestamp of the RF scan.",
    )
    latitude: float = Field(
        ...,
        description="WGS84 latitude of the scanner at scan time.",
    )
    longitude: float = Field(
        ...,
        description="WGS84 longitude of the scanner at scan time.",
    )
    frequency_mhz: float = Field(
        ...,
        gt=0,
        description="RF centre frequency of the detected signal in MHz.",
        examples=[935.0],
    )
    rssi_dbm: float = Field(
        ...,
        description="Received Signal Strength Indicator in dBm.",
        examples=[-78.0],
    )
    bearing_deg: Optional[float] = Field(
        default=None,
        description="Compass bearing (0-360, true north) to the signal source.",
        examples=[210.0],
    )
    scanner_accuracy_meters: Optional[float] = Field(
        default=5.0,
        gt=0,
        description="GPS accuracy of the scanner position in meters.",
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

    @field_validator("bearing_deg")
    @classmethod
    def validate_bearing(cls, val: Optional[float]) -> Optional[float]:
        if val is not None and not (0.0 <= val <= 360.0):
            raise ValueError("Bearing must be between 0 and 360 degrees.")
        return val


class RfVerificationResult(BaseModel):
    """
    Outcome of running ground-verification over a set of RF scans.
    """
    micro_fix_latitude: Optional[float] = Field(
        default=None,
        description="Resolved micro-fix latitude, or None if not resolvable.",
    )
    micro_fix_longitude: Optional[float] = Field(
        default=None,
        description="Resolved micro-fix longitude, or None if not resolvable.",
    )
    estimated_distance_meters: Optional[float] = Field(
        default=None,
        description="Path-loss estimated distance from the scanner in meters.",
    )
    confidence_radius_meters: Optional[float] = Field(
        default=None,
        description="95% confidence radius of the micro-fix in meters.",
    )
    method: str = Field(
        default="log_distance_path_loss",
        description="Verification method applied.",
    )
    skipped_scan_count: int = Field(
        default=0,
        description="Number of scans skipped (missing bearing, out of range, etc.).",
    )