"""
Measurement Frame and Measurement Tower contracts.
Represents the structured payload delivered to the Trilateration Engine.
"""

from datetime import datetime
from typing import Optional
from uuid import UUID

from pydantic import BaseModel, Field, field_validator

from app.contracts.enums import FrameStatus


class MeasurementTower(BaseModel):
    """
    Geographical location and signal observation metrics for a single cell transceiver.
    """
    tower_id: UUID = Field(
        ..., 
        description="Reference to the physical tower transceiver ID.",
        examples=["4a6e87f1-5b72-4d22-8ccb-a27efb5e5c2d"]
    )
    cgi: str = Field(
        ..., 
        description="Cell Global Identity (MCC-MNC-LAC-CellID).",
        examples=["404-20-4321-9876"]
    )
    latitude: float = Field(
        ..., 
        description="WGS84 latitude coordinate.",
        examples=[19.0760]
    )
    longitude: float = Field(
        ..., 
        description="WGS84 longitude coordinate.",
        examples=[72.8777]
    )
    azimuth: Optional[float] = Field(
        default=None, 
        description="Sector azimuth direction in degrees (0-360).",
        examples=[180.0]
    )
    beamwidth: Optional[float] = Field(
        default=None, 
        description="Horizontal beamwidth coverage angle in degrees (0-360).",
        examples=[65.0]
    )
    signal_strength: Optional[float] = Field(
        default=None, 
        description="Received signal strength (RSSI) in dBm.",
        examples=[-78.0]
    )
    timing_advance: Optional[int] = Field(
        default=None, 
        description="Cellular Timing Advance index parameter.",
        examples=[3]
    )
    rtt: Optional[float] = Field(
        default=None, 
        description="Network Round Trip Time in milliseconds.",
        examples=[12.4]
    )
    pseudorange_meters: Optional[float] = Field(
        default=None, 
        description="Estimated ranges/distances from handset to cell site in meters.",
        examples=[234.5]
    )
    is_catalog: bool = Field(
        default=True,
        description="True when resolved from the authoritative tower_records catalog. "
                    "False when resolved via OpenCellID fallback (rogue-BTS whitelist excludes these).",
    )

    @field_validator("latitude")
    @classmethod
    def validate_latitude(cls, val: float) -> float:
        """
        Validates latitude coordinate limits.
        """
        if not (-90.0 <= val <= 90.0):
            raise ValueError("Latitude must be between -90 and 90 degrees.")
        return val

    @field_validator("longitude")
    @classmethod
    def validate_longitude(cls, val: float) -> float:
        """
        Validates longitude coordinate limits.
        """
        if not (-180.0 <= val <= 180.0):
            raise ValueError("Longitude must be between -180 and 180 degrees.")
        return val

    @field_validator("azimuth", "beamwidth")
    @classmethod
    def validate_antenna_degrees(cls, val: Optional[float]) -> Optional[float]:
        """
        Validates degree fields are within the 0 to 360 range.
        """
        if val is not None:
            if not (0.0 <= val <= 360.0):
                raise ValueError("Antenna azimuth and beamwidth angles must be between 0 and 360 degrees.")
        return val

    @field_validator("pseudorange_meters")
    @classmethod
    def validate_pseudorange(cls, val: Optional[float]) -> Optional[float]:
        """
        Validates estimated distance is positive (>0).
        """
        if val is not None:
            if val <= 0.0:
                raise ValueError("Pseudorange distance must be a positive number greater than 0.")
        return val

    @field_validator("timing_advance")
    @classmethod
    def validate_timing_advance(cls, val: Optional[int]) -> Optional[int]:
        if val is not None and not (0 <= val <= 1282):
            raise ValueError("Timing Advance must be between 0 and 1282.")
        return val

    @field_validator("rtt")
    @classmethod
    def validate_rtt(cls, val: Optional[float]) -> Optional[float]:
        if val is not None and not (0 < val < 10000):
            raise ValueError("RTT must be between 0 and 10000 ms.")
        return val
        

class MeasurementFrame(BaseModel):
    """
    Unified payload grouping multiple tower observations for a single suspect.
    Serves as the execution boundary to the trilateration engine.
    """
    frame_id: UUID = Field(
        ..., 
        description="Unique identifier for the compiled spatial-temporal frame."
    )
    upload_id: UUID = Field(
        ..., 
        description="Link to the ingestion batch metadata record."
    )
    subscriber_identifier: str = Field(
        ..., 
        description="Suspect identity target (MSISDN/phone number or IMSI).",
        examples=["919876543210"]
    )
    timestamp: datetime = Field(
        ..., 
        description="DateTime snapshot associated with this grouped frame."
    )
    towers: list[MeasurementTower] = Field(
        ..., 
        description="List of observed towers. Must contain at least 3 elements to allow trilateration solver."
    )
    sim_swap: bool = Field(
        default=False,
        description="True when this frame's records contain more than one distinct IMSI "
                    "on the same device (SIM swap / multi-SIM device handover).",
    )
    status: FrameStatus = Field(
        ..., 
        description="Status indicator assessing frame validation completion.",
        examples=[FrameStatus.READY]
    )

    @field_validator("towers")
    @classmethod
    def validate_minimum_towers(cls, val: list[MeasurementTower]) -> list[MeasurementTower]:
        """
        Asserts that at least 1 cell observation point is present.
        """
        if len(val) < 1:
            raise ValueError("MeasurementFrame requires at least 1 observed cell tower.")
        return val
