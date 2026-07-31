"""
TowerRecord contract model.
Represents static physical cell tower sites and radiation sector parameters.
"""

from typing import Optional
from uuid import UUID

from pydantic import BaseModel, Field, field_validator

from app.contracts.enums import Operator, RadioTechnology


class TowerRecord(BaseModel):
    """
    Standard representation of a cell site transmitter configuration.
    """
    tower_id: UUID = Field(
        ..., 
        description="Unique identifier generated for this tower transceiver record.",
        examples=["4a6e87f1-5b72-4d22-8ccb-a27efb5e5c2d"]
    )
    operator: Operator = Field(
        ..., 
        description="Source telecom provider operating this site.",
        examples=[Operator.VI]
    )
    radio: RadioTechnology = Field(
        ..., 
        description="Radio access technology standard utilized.",
        examples=[RadioTechnology.LTE]
    )
    mcc: int = Field(
        ..., 
        description="Mobile Country Code.",
        examples=[404]
    )
    mnc: int = Field(
        ..., 
        description="Mobile Network Code.",
        examples=[20]
    )
    lac: int = Field(
        ..., 
        description="Location Area Code.",
        examples=[4321]
    )
    cell_id: int = Field(
        ..., 
        description="Cell Identifier.",
        examples=[9876]
    )
    cgi: str = Field(
        ..., 
        description="Cell Global Identity (MCC-MNC-LAC-CellID).",
        examples=["404-20-4321-9876"]
    )
    latitude: float = Field(
        ..., 
        description="WGS84 latitude coordinate of the cell tower location.",
        examples=[19.0760]
    )
    longitude: float = Field(
        ..., 
        description="WGS84 longitude coordinate of the cell tower location.",
        examples=[72.8777]
    )
    azimuth: Optional[float] = Field(
        default=None, 
        description="Direction of transmission sector orientation in degrees (0-360).",
        examples=[120.0]
    )
    beamwidth: Optional[float] = Field(
        default=None, 
        description="Horizontal beamwidth radiation angle of antenna in degrees (0-360).",
        examples=[65.0]
    )
    range_meters: Optional[float] = Field(
        default=None, 
        description="Estimated circular signal coverage range in meters.",
        examples=[1200.0]
    )
    site_address: Optional[str] = Field(
        default=None, 
        description="Physical site address location string.",
        examples=["Bandra West, Mumbai, Maharashtra 400050"]
    )

    @field_validator("latitude")
    @classmethod
    def validate_latitude(cls, val: float) -> float:
        """
        Validates WGS84 latitude bounds.
        """
        if not (-90.0 <= val <= 90.0):
            raise ValueError("Latitude must be between -90 and 90 degrees.")
        return val

    @field_validator("longitude")
    @classmethod
    def validate_longitude(cls, val: float) -> float:
        """
        Validates WGS84 longitude bounds.
        """
        if not (-180.0 <= val <= 180.0):
            raise ValueError("Longitude must be between -180 and 180 degrees.")
        return val

    @field_validator("azimuth", "beamwidth")
    @classmethod
    def validate_antenna_degrees(cls, val: Optional[float]) -> Optional[float]:
        """
        Validates degrees fields are within the 0 to 360 range.
        """
        if val is not None:
            if not (0.0 <= val <= 360.0):
                raise ValueError("Antenna azimuth and beamwidth angles must be between 0 and 360 degrees.")
        return val

    @field_validator("range_meters")
    @classmethod
    def validate_range(cls, val: Optional[float]) -> Optional[float]:
        """
        Validates signal coverage range is positive (>0).
        """
        if val is not None:
            if val <= 0.0:
                raise ValueError("Signal range must be a positive number greater than 0.")
        return val

    @field_validator("mcc", "mnc", "lac", "cell_id")
    @classmethod
    def validate_codes_non_negative(cls, val: int) -> int:
        """
        Validates telecom identifier integers are non-negative.
        """
        if val < 0:
            raise ValueError("Telecom identifiers (MCC, MNC, LAC, Cell ID) must be non-negative.")
        return val
