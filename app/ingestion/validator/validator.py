"""
Data validation engine for the E-Rakshak pipeline.
Applies domain validation rules to filter out malformed telecommunication data.
"""

from typing import Any

from app.core.logging import logger
from app.exceptions.validation import IngestionValidationError
from app.ingestion.validator.rules import (
    IndiaGeoCoordinatesRule,
    IndianMsisdnRule,
    PastOrPresentTimestampRule,
)


class IngestionValidator:
    """
    Validation engine that executes constraint rule audits.
    """

    def __init__(self) -> None:
        self.msisdn_rule = IndianMsisdnRule()
        self.geo_rule = IndiaGeoCoordinatesRule()
        self.time_rule = PastOrPresentTimestampRule()

    def validate_raw_records(
        self, records: list[dict[str, Any]], file_type: str
    ) -> list[dict[str, Any]]:
        """
        Validates raw dict records. Drops failed records and logs validation errors.

        Args:
            records: Raw dictionary list extracted from operator logs.
            file_type: Category of log (CDR, TowerDump, SpotDump).

        Returns:
            List of validated raw dictionaries.
        """
        logger.info("validating_records", count=len(records), file_type=file_type)

        valid_records: list[dict[str, Any]] = []
        errors_count = 0

        for idx, record in enumerate(records):
            is_valid = True
            error_details: dict[str, str] = {}

            # 1. Phone number validation (for CDR or SpotDump)
            if file_type in ("CDR", "SpotDump"):
                # Check potential target/subscriber identifier keys
                phone_keys = ["calling_no", "calling_party", "msisdn", "target_number", "phone_number"]
                phone_val = None
                for key in phone_keys:
                    if key in record:
                        phone_val = record[key]
                        break
                
                if phone_val and not self.msisdn_rule.validate(phone_val):
                    is_valid = False
                    error_details["msisdn"] = self.msisdn_rule.error_message

            # 2. Coordinates validation (for TowerDump)
            if file_type == "TowerDump":
                lat_val = record.get("latitude")
                lon_val = record.get("longitude")
                if lat_val and lon_val:
                    try:
                        coords = (float(lat_val), float(lon_val))
                        if not self.geo_rule.validate(coords):
                            is_valid = False
                            error_details["coordinates"] = self.geo_rule.error_message
                    except (ValueError, TypeError):
                        is_valid = False
                        error_details["coordinates"] = "Latitude and longitude must be valid floating numbers."

            # 3. Timestamps validation (for CDR or SpotDump)
            if file_type in ("CDR", "SpotDump"):
                time_keys = ["datetime", "start_time", "call_date", "timestamp_str", "event_timestamp"]
                time_val = None
                for key in time_keys:
                    if key in record:
                        time_val = record[key]
                        break
                
                # If we have a datetime object or parseable string, check bounds
                # If it's a raw string in the raw dict, it will be parsed later during normalization,
                # but if we can parse it now, we validate it.
                if isinstance(time_val, str):
                    try:
                        # Attempt standard ISO parser or basic format match
                        from app.utils.datetime_utils import parse_telecom_datetime
                        dt = parse_telecom_datetime(time_val)
                        if not self.time_rule.validate(dt):
                            is_valid = False
                            error_details["timestamp"] = self.time_rule.error_message
                    except Exception:
                        # Parsing failures will be raised during normalization;
                        # we can log or ignore validation for now.
                        pass

            if is_valid:
                valid_records.append(record)
            else:
                errors_count += 1
                logger.warn(
                    "record_validation_failed",
                    index=idx,
                    error_details=error_details,
                    record_preview={k: str(v)[:30] for k, v in record.items()}
                )

        logger.info(
            "validation_completed",
            total_records=len(records),
            valid_records=len(valid_records),
            dropped_records=errors_count
        )

        return valid_records
