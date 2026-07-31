"""
Validation & Enrichment processing service for telecom records.
"""

from typing import List, Set
import structlog
from pydantic import BaseModel, Field

from app.contracts.subscriber import SubscriberEventRecord
from app.processing.validator import ProcessingValidator

logger = structlog.get_logger()


class ValidatedSubscriberRecord(BaseModel):
    """
    Wrapper for a validated and enriched SubscriberEventRecord.
    Maintains the original extracted record immutable and associates metadata.
    """
    record: SubscriberEventRecord = Field(..., description="The original immutable SubscriberEventRecord.")
    normalized_phone_number: str = Field(..., description="The normalized Indian phone number in standard 12-digit format.")
    quality_score: float = Field(..., description="Data completeness quality score (0.0 to 1.0).")
    warnings: List[str] = Field(default_factory=list, description="Warnings generated during validation rules execution.")


class ValidationStatistics(BaseModel):
    """
    Ingestion validation and deduplication run statistics.
    """
    total_records: int = Field(..., description="Total input records processed.")
    valid_records: int = Field(..., description="Number of valid, unique records after deduplication.")
    rejected_records: int = Field(..., description="Number of records rejected due to validation failures.")
    duplicate_records: int = Field(..., description="Number of duplicate records skipped.")
    unique_cgis: int = Field(..., description="Number of unique CGIs observed.")


class ValidationResult(BaseModel):
    """
    Outcome payload of the Validation & Enrichment stage.
    """
    valid_records: List[ValidatedSubscriberRecord] = Field(..., description="Deduplicated valid records wrapped with processing metadata.")
    rejected_records: List[SubscriberEventRecord] = Field(..., description="Rejected records that failed critical validation rules.")
    warning_records: List[ValidatedSubscriberRecord] = Field(..., description="Subset of valid records that generated warning-level rules.")
    validation_statistics: ValidationStatistics = Field(..., description="Run statistics.")
    unique_cgi_set: Set[str] = Field(..., description="Set of unique CGIs observed.")


def calculate_quality_score(record: SubscriberEventRecord) -> float:
    """
    Computes completeness quality score (0.0 to 1.0) based on optional fields presence.
    - Required fields (always present for valid records): phone_number, timestamp, cgi.
    - Optional fields contributing points: imei, imsi, MCC+MNC, LAC+CellID, non-zero duration.
    """
    points = 0
    total_checks = 5

    # 1. IMEI
    if record.imei and str(record.imei).strip():
        points += 1
    # 2. IMSI
    if record.imsi and str(record.imsi).strip():
        points += 1
    # 3. MCC and MNC (both)
    if record.mcc is not None and record.mnc is not None:
        points += 1
    # 4. LAC and Cell ID (both)
    if record.lac is not None and record.cell_id is not None:
        points += 1
    # 5. Call duration is non-zero (implies connection duration completeness)
    if record.duration_seconds and record.duration_seconds > 0:
        points += 1

    # Base quality score is 0.5 (for valid phone, timestamp, cgi), and remaining 0.5 is scaled by points
    score = 0.5 + 0.5 * (points / total_checks)
    return round(score, 2)


class ProcessingService:
    """
    Service that orchestrates the Validation & Enrichment stage.
    """

    def __init__(self, clock_skew_seconds: int = 300) -> None:
        self.validator = ProcessingValidator(clock_skew_seconds=clock_skew_seconds)

    def process_records(self, records: List[SubscriberEventRecord]) -> ValidationResult:
        """
        Validates, deduplicates, and enriches subscriber event records without mutating them.
        """
        logger.info("validation_started", count=len(records))

        valid_before_dedup: List[ValidatedSubscriberRecord] = []
        rejected_records: List[SubscriberEventRecord] = []

        # 1. Validation phase
        for record in records:
            is_valid, errors, warnings, normalized_phone = self.validator.validate_record(record)
            if is_valid:
                normalized_phone_val = normalized_phone or ""
                score = calculate_quality_score(record)

                validated_rec = ValidatedSubscriberRecord(
                    record=record,
                    normalized_phone_number=normalized_phone_val,
                    quality_score=score,
                    warnings=warnings
                )
                valid_before_dedup.append(validated_rec)
            else:
                rejected_records.append(record)
                logger.warn(
                    "record_rejected",
                    event_id=str(record.event_id),
                    upload_id=str(record.upload_id),
                    errors=errors
                )

        # 2. Deduplication phase
        seen_keys = set()
        valid_records: List[ValidatedSubscriberRecord] = []
        warning_records: List[ValidatedSubscriberRecord] = []
        duplicate_count = 0

        for val_rec in valid_before_dedup:
            rec = val_rec.record
            key = (
                str(rec.upload_id),
                val_rec.normalized_phone_number,
                rec.timestamp.isoformat() if rec.timestamp else "",
                str(rec.cgi),
                str(rec.call_type.value) if rec.call_type else ""
            )
            if key in seen_keys:
                duplicate_count += 1
                logger.info(
                    "duplicate_detected",
                    event_id=str(rec.event_id),
                    upload_id=str(rec.upload_id)
                )
            else:
                seen_keys.add(key)
                valid_records.append(val_rec)
                if val_rec.warnings:
                    warning_records.append(val_rec)

        # 3. Enrichment phase (build unique CGI set)
        unique_cgi_set = {val_rec.record.cgi for val_rec in valid_records if val_rec.record.cgi}

        # 4. Generate statistics
        statistics = ValidationStatistics(
            total_records=len(records),
            valid_records=len(valid_records),
            rejected_records=len(rejected_records),
            duplicate_records=duplicate_count,
            unique_cgis=len(unique_cgi_set)
        )

        logger.info(
            "validation_completed",
            total_records=statistics.total_records,
            valid_records=statistics.valid_records,
            rejected_records=statistics.rejected_records,
            duplicate_records=statistics.duplicate_records,
            unique_cgis=statistics.unique_cgis
        )

        return ValidationResult(
            valid_records=valid_records,
            rejected_records=rejected_records,
            warning_records=warning_records,
            validation_statistics=statistics,
            unique_cgi_set=unique_cgi_set
        )
