"""
LocalizationFix contract model.
Represents a single resolved suspect position fix produced by the
trilateration + Kalman localization engine, ready for GeoJSON serialization.
"""

from datetime import datetime
from typing import Any, Optional
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
    geocoded_address: Optional[str] = Field(
        default=None,
        description="Persisted reverse-geocoded address label.",
    )
    rogue_cgis: list[str] = Field(
        default_factory=list,
        description="CGIs in this fix's measurement frame that were NOT in the tower_records "
                    "catalog (rogue BTS / IMSI-catcher candidates) and were excluded from the solve.",
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


class TowerMeasurementInput(BaseModel):
    """
    Input schema for a single cell transceiver measurement in standalone API calls.
    """
    tower_id: Optional[UUID] = Field(default=None, description="Optional transceiver ID.")
    cgi: str = Field(default="404-20-0000-0000", description="Cell Global Identity (MCC-MNC-LAC-CellID).")
    latitude: float = Field(..., ge=-90.0, le=90.0, description="WGS84 latitude coordinate.")
    longitude: float = Field(..., ge=-180.0, le=180.0, description="WGS84 longitude coordinate.")
    azimuth: Optional[float] = Field(default=None, ge=0.0, le=360.0, description="Sector azimuth in degrees.")
    beamwidth: Optional[float] = Field(default=None, ge=0.0, le=360.0, description="Beamwidth in degrees.")
    signal_strength: Optional[float] = Field(default=None, description="Received signal strength (RSSI) in dBm.")
    timing_advance: Optional[int] = Field(default=None, description="LTE Timing Advance index.")
    rtt: Optional[float] = Field(default=None, description="Network Round Trip Time in ms.")
    pseudorange_meters: Optional[float] = Field(default=None, gt=0.0, description="Explicit pseudorange in meters.")
    is_catalog: bool = Field(default=True, description="True if tower is from authoritative catalog.")


class SingleFrameInput(BaseModel):
    """
    Group of tower observations at a single instant in time.
    """
    timestamp: Optional[datetime] = Field(default_factory=now_ist, description="Observation timestamp.")
    towers: list[TowerMeasurementInput] = Field(..., min_length=3, description="List of observed towers (min 3 for trilateration).")


class LocalizationEstimateRequest(BaseModel):
    """
    Standalone request payload for localization engine estimation.
    """
    subscriber_identifier: str = Field(default="EXTERNAL_TARGET", description="Suspect identity target (MSISDN/IMSI).")
    case_id: str = Field(default="EXTERNAL_QUERY", description="Case reference identifier.")
    target_type: str = Field(default="pedestrian", description="Target mobility profile: 'pedestrian' or 'vehicle'.")
    frames: list[SingleFrameInput] = Field(..., min_length=1, description="One or more frames of tower observations.")
    apply_kalman: bool = Field(default=True, description="Whether to apply Kalman tracking across consecutive frames.")
    include_velocity: bool = Field(default=False, description="Whether to include velocity vectors in output fixes (default False).")
    utm_zone: int = Field(default=0, description="Fixed UTM zone (0 for auto-derivation per frame).")



class LocalizationEstimateResponse(BaseModel):
    """
    Response containing resolved localization fixes and map GeoJSON.
    """
    status: str = Field(default="success")
    fix_count: int = Field(..., description="Number of successfully resolved position fixes.")
    fixes: list[LocalizationFix] = Field(..., description="List of resolved LocalizationFix records.")
    geojson: dict = Field(..., description="GeoJSON FeatureCollection representing fixes and ellipses for map rendering.")
    rogue_cgis_detected: list[str] = Field(default_factory=list, description="Rogue BTS/IMSI-catcher CGIs detected and excluded.")


# ── JSON Export Contract Models ─────────────────────────────


class JsonExportCase(BaseModel):
    id: str = Field(..., description="Investigation case ID")
    title: str = Field(..., description="Case title / investigation name")
    target_identifiers: dict[str, Any] = Field(
        default_factory=dict,
        description="Dictionary of target phone numbers, IMEIs, IMSIs, etc."
    )


class JsonExportParameters(BaseModel):
    solver: str = Field(default="cheung_lee_jpl", description="Multilateration solver algorithm")
    huber_k: float = Field(default=1.345, description="Huber robust M-estimation tuning constant")
    kalman_q_r_config: dict[str, Any] = Field(
        default_factory=lambda: {
            "process_noise_q": 1.0,
            "measurement_noise_r": 25.0,
            "target_type": "pedestrian",
        },
        description="Kalman filter process and measurement noise configuration"
    )
    utm_zone: int = Field(default=43, description="UTM projection zone")
    chi2_gate: float = Field(default=9.21, description="Chi-squared innovation rejection gate threshold")


class JsonExportRawVsFiltered(BaseModel):
    raw_lat: Optional[float] = Field(default=None, description="Raw trilateration solve latitude")
    raw_lon: Optional[float] = Field(default=None, description="Raw trilateration solve longitude")


class JsonExportFix(BaseModel):
    timestamp: str = Field(..., description="ISO8601 UTC timestamp of the observation/fix")
    lat: float = Field(..., description="Resolved WGS84 latitude")
    lon: float = Field(..., description="Resolved WGS84 longitude")
    speed_mps: Optional[float] = Field(default=None, description="Estimated target speed in meters per second")
    heading_deg: Optional[float] = Field(default=None, description="Estimated target heading in degrees (0-360, 0=North)")
    confidence_radius_95_m: float = Field(..., description="95% confidence radius in meters")
    gdop: Optional[float] = Field(default=None, description="Geometric Dilution of Precision")
    n_towers: int = Field(default=3, description="Number of towers used in resolving this fix")
    fix_method: str = Field(
        default="multilateration",
        description="Fix method: 'multilateration', 'two_tower', or 'single_sector'"
    )
    address: Optional[str] = Field(default=None, description="Reverse-geocoded street/block address")
    towers_used: list[str] = Field(default_factory=list, description="List of CGIs of towers used in this fix")
    raw_vs_filtered: Optional[JsonExportRawVsFiltered] = Field(
        default=None,
        description="Comparison of raw trilateration position vs Kalman filtered position"
    )


class JsonExportTrace(BaseModel):
    type: str = Field(default="LineString", description="GeoJSON geometry type")
    coordinates: list[list[float]] = Field(
        default_factory=list,
        description="List of [lon, lat] coordinates representing the suspect movement trajectory"
    )


class JsonExportHeatmapSummary(BaseModel):
    peak_lat: Optional[float] = Field(default=None, description="Latitude of highest probability heatmap intensity peak")
    peak_lon: Optional[float] = Field(default=None, description="Longitude of highest probability heatmap intensity peak")
    area_50pct_m2: Optional[float] = Field(default=None, description="Area in m² of the 50% probability core zone")
    area_90pct_m2: Optional[float] = Field(default=None, description="Area in m² of the 90% probability search zone")


class JsonExportIntegrity(BaseModel):
    sha256_of_payload: str = Field(
        ...,
        description="SHA-256 hash computed over canonical JSON of all payload fields except 'integrity'"
    )
    audit_entry_id: Optional[str] = Field(
        default=None,
        description="UUID of the forensic audit log entry recorded in the database"
    )


class JsonExportPayload(BaseModel):
    schema_version: str = Field(default="1.0", description="Forensic JSON schema version")
    case: JsonExportCase = Field(..., description="Case metadata and target identifiers")
    generated_at: str = Field(..., description="ISO8601 UTC timestamp of export generation")
    generated_by: str = Field(..., description="Identifier or name of officer generating the export")
    parameters: JsonExportParameters = Field(..., description="Mathematical solver and filtering parameters")
    fixes: list[JsonExportFix] = Field(default_factory=list, description="Array of resolved location fixes")
    trace: JsonExportTrace = Field(..., description="GeoJSON LineString movement trajectory")
    heatmap_summary: JsonExportHeatmapSummary = Field(..., description="Spatial summary of the probability heatmap")
    integrity: JsonExportIntegrity = Field(..., description="Cryptographic integrity verification and audit reference")


