"""
SubscriberEventRecord contract model.
Standardizes raw operator call, SMS, data logs, and spot dumps into a unified schema.
"""

from datetime import datetime
from typing import Any, Optional
from uuid import UUID

from pydantic import BaseModel, Field, field_validator

from app.contracts.enums import CallType, Operator, SourceType


class SubscriberEventRecord(BaseModel):
    """
    Normalized call detail record or spot dump activity entry.
    """
    event_id: UUID = Field(
        ..., 
        description="Unique identifier generated for this transaction row.",
        examples=["4a6e87f1-5b72-4d22-8ccb-a27efb5e5c2d"]
    )
    upload_id: UUID = Field(
        ..., 
        description="Link to the ingestion batch metadata record.",
        examples=["123e4567-e89b-12d3-a456-426614174000"]
    )
    operator: Operator = Field(
        ..., 
        description="Network operator brand provider.",
        examples=[Operator.JIO]
    )
    source_type: SourceType = Field(
        ..., 
        description="Data source categorization.",
        examples=[SourceType.CDR]
    )
    phone_number: Optional[str] = Field(
        default=None, 
        description="Subscriber phone number (MSISDN) in standard format.",
        examples=["919876543210"]
    )
    imei: Optional[str] = Field(
        default=None, 
        description="Handset equipment IMEI.",
        examples=["358765432109876"]
    )
    imsi: Optional[str] = Field(
        default=None, 
        description="SIM card IMSI code.",
        examples=["404450123456789"]
    )
    timestamp: datetime = Field(
        ..., 
        description="Transaction start datetime."
    )
    call_type: CallType = Field(
        ..., 
        description="Normalized category type of connection event.",
        examples=[CallType.OUTGOING]
    )
    duration_seconds: int = Field(
        ..., 
        description="Duration of the call in seconds (0 for data/SMS).",
        examples=[120]
    )
    cgi: str = Field(
        ..., 
        description="Cell Global Identity formatted as MCC-MNC-LAC-CI.",
        examples=["404-45-1234-5678"]
    )
    mcc: Optional[int] = Field(
        default=None, 
        description="Mobile Country Code.",
        examples=[404]
    )
    mnc: Optional[int] = Field(
        default=None, 
        description="Mobile Network Code.",
        examples=[45]
    )
    lac: Optional[int] = Field(
        default=None, 
        description="Location Area Code.",
        examples=[1234]
    )
    cell_id: Optional[int] = Field(
        default=None, 
        description="Local Cell Identifier.",
        examples=[5678]
    )
    tower_latitude: Optional[float] = Field(
        default=None, 
        description="WGS84 latitude coordinate of connected tower.",
        examples=[28.6139]
    )
    tower_longitude: Optional[float] = Field(
        default=None, 
        description="WGS84 longitude coordinate of connected tower.",
        examples=[77.2090]
    )
    signal_strength: Optional[float] = Field(
        default=None, 
        description="Received Signal Strength Indicator (RSSI) in dBm.",
        examples=[-85.0]
    )
    timing_advance: Optional[int] = Field(
        default=None, 
        description="Timing Advance network index parameter.",
        examples=[2]
    )
    rtt: Optional[float] = Field(
        default=None, 
        description="Round Trip Time in milliseconds.",
        examples=[15.5]
    )
    source_file: str = Field(
        ..., 
        description="Name of the source document file processed.",
        examples=["airtel_cdr_9999988888.csv"]
    )
    record_number: int = Field(
        ..., 
        description="Original row index/number inside the parsed file.",
        examples=[45]
    )
    raw_fields: dict[str, Any] = Field(
        ..., 
        description="Dictionary containing original operator row attributes before normalization."
    )

    @field_validator("duration_seconds")
    @classmethod
    def validate_duration(cls, val: int) -> int:
        """
        Validates that connection duration is non-negative.
        """
        if val < 0:
            raise ValueError("Duration cannot be negative.")
        return val

    @field_validator("tower_latitude")
    @classmethod
    def validate_latitude(cls, val: Optional[float]) -> Optional[float]:
        """
        Validates WGS84 latitude bounds.
        """
        if val is not None:
            if not (-90.0 <= val <= 90.0):
                raise ValueError("Latitude must be between -90 and 90 degrees.")
        return val

    @field_validator("tower_longitude")
    @classmethod
    def validate_longitude(cls, val: Optional[float]) -> Optional[float]:
        """
        Validates WGS84 longitude bounds.
        """
        if val is not None:
            if not (-180.0 <= val <= 180.0):
                raise ValueError("Longitude must be between -180 and 180 degrees.")
        return val

    @field_validator("phone_number")
    @classmethod
    def validate_phone(cls, val: Optional[str]) -> Optional[str]:
        """
        Validates standard MSISDN phone digit lengths.
        """
        if val is not None:
            clean = "".join(c for c in val if c.isdigit())
            if not (10 <= len(clean) <= 15):
                raise ValueError("Phone number must contain between 10 and 15 digits.")
        return val

    @field_validator("imei")
    @classmethod
    def validate_imei(cls, val: Optional[str]) -> Optional[str]:
        """
        Validates standard 15-digit IMEI format.
        """
        if val is not None:
            clean = "".join(c for c in val if c.isdigit())
            if len(clean) != 15:
                raise ValueError("IMEI must be exactly 15 digits long.")
        return val

    @field_validator("mcc", "mnc")
    @classmethod
    def validate_positive_operator_codes(cls, val: Optional[int]) -> Optional[int]:
        """
        Validates that MCC and MNC codes are positive (greater than 0).
        """
        if val is not None:
            if val <= 0:
                raise ValueError("MCC and MNC codes must be positive integers (>0).")
        return val

    @field_validator("lac", "cell_id")
    @classmethod
    def validate_non_negative_telecom_codes(cls, val: Optional[int]) -> Optional[int]:
        """
        Validates that LAC and Cell IDs are non-negative.
        """
        if val is not None:
            if val < 0:
                raise ValueError("LAC and Cell ID codes must be non-negative integers (>=0).")
        return val
