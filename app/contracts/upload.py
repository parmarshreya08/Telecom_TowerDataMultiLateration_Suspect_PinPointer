"""
UploadMetadata contract model.
Tracks raw logs uploaded by investigators, including checksum signatures for file deduplication.
"""

from datetime import datetime
from uuid import UUID

from pydantic import BaseModel, Field, field_validator

from app.contracts.enums import Operator, SourceType


class UploadMetadata(BaseModel):
    """
    Metadata representation of an uploaded telecom log file.
    Provides tracking, validation, and file integrity audits.
    """
    upload_id: UUID = Field(
        ..., 
        description="Unique identifier generated for this upload run.",
        examples=["123e4567-e89b-12d3-a456-426614174000"]
    )
    case_id: str = Field(
        ..., 
        description="Unique identifier reference for the case files.",
        examples=["CASE-2026-DEL-091"]
    )
    source_type: SourceType = Field(
        ..., 
        description="Dataset file category.",
        examples=[SourceType.CDR]
    )
    operator: Operator = Field(
        ..., 
        description="Source telecom provider.",
        examples=[Operator.AIRTEL]
    )
    original_filename: str = Field(
        ..., 
        description="Original name of the file before uploading.",
        examples=["airtel_cdr_9999988888.csv"]
    )
    stored_filename: str = Field(
        ..., 
        description="Unique randomized local file name on storage.",
        examples=["4a6e87f1-5b72-4d22-8ccb-a27efb5e5c2d.csv"]
    )
    sha256: str = Field(
        ..., 
        description="SHA-256 checksum of the file content for deduplication.",
        examples=["e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855"]
    )
    mime_type: str = Field(
        ..., 
        description="MIME identifier of the file structure.",
        examples=["text/csv"]
    )
    file_size_bytes: int = Field(
        ..., 
        description="Files size expressed in bytes.",
        examples=[10485760]
    )
    uploaded_by: str = Field(
        ..., 
        description="Identifier of the investigating officer or system uploader.",
        examples=["Officer_Shreyash"]
    )
    uploaded_at: datetime = Field(
        ..., 
        description="Timestamp indicating when the upload transaction completed."
    )

    @field_validator("original_filename", "stored_filename")
    @classmethod
    def validate_filenames(cls, val: str) -> str:
        """
        Validates that filenames are non-empty and stripped.
        """
        clean = val.strip()
        if not clean:
            raise ValueError("Filename cannot be empty.")
        return clean

    @field_validator("sha256")
    @classmethod
    def validate_sha256(cls, val: str) -> str:
        """
        Validates that sha256 string contains exactly 64 hexadecimal characters.
        """
        clean = val.strip().lower()
        if len(clean) != 64:
            raise ValueError("SHA-256 checksum must be exactly 64 characters long.")
        if not all(c in "0123456789abcdef" for c in clean):
            raise ValueError("SHA-256 checksum must contain only hexadecimal characters.")
        return clean

    @field_validator("file_size_bytes")
    @classmethod
    def validate_file_size(cls, val: int) -> int:
        """
        Validates that file size is a positive integer.
        """
        if val <= 0:
            raise ValueError("File size must be a positive integer greater than zero.")
        return val
