"""
DetectionResult contract model.
Represents classification results returned by the TelecomFileDetector.
"""

from pydantic import BaseModel, Field, field_validator

from app.contracts.enums import Operator, SourceType


class DetectionResult(BaseModel):
    """
    Unified contract holding classification outputs for uploaded files.
    """
    operator: Operator = Field(
        ..., 
        description="Identified telecom operator brand (e.g. Airtel, Jio, Vi, BSNL).",
        examples=[Operator.AIRTEL]
    )
    source_type: SourceType = Field(
        ..., 
        description="Identified dataset source type (e.g. CDR, TowerDump, SpotDump).",
        examples=[SourceType.CDR]
    )
    confidence: float = Field(
        ..., 
        description="Classification scoring confidence level between 0.0 and 1.0.",
        examples=[0.95]
    )
    detected_by: str = Field(
        ..., 
        description="Name of the detector class executing classification.",
        examples=["TelecomFileDetector"]
    )
    extractor_name: str = Field(
        ..., 
        description="Proposed extractor class name matching this operator/source combo.",
        examples=["AirtelExtractor"]
    )
    matched_columns: list[str] = Field(
        ..., 
        description="List of raw file header columns that matched classification rules."
    )

    @field_validator("confidence")
    @classmethod
    def validate_confidence(cls, val: float) -> float:
        """
        Validates confidence score is between 0.0 and 1.0.
        """
        if not (0.0 <= val <= 1.0):
            raise ValueError("Confidence score must be strictly between 0.0 and 1.0.")
        return val
