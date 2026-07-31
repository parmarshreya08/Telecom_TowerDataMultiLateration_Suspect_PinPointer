"""
Validation rules for the Validation & Enrichment stage.
Each rule verifies a specific constraint on SubscriberEventRecord.
"""

from abc import ABC, abstractmethod
from datetime import datetime, timedelta, timezone
import re
from typing import Any, Optional, Tuple
from uuid import UUID

from app.contracts.enums import CallType
from app.contracts.subscriber import SubscriberEventRecord


class ProcessingRule(ABC):
    """
    Abstract base class for processing validation rules.
    """

    @abstractmethod
    def validate(self, record: SubscriberEventRecord) -> Tuple[bool, str, Optional[str], Optional[Any]]:
        """
        Validates a SubscriberEventRecord against the rule.

        Returns:
            A tuple of (is_valid, level, reason, extra_data) where:
                - is_valid: True if the rule passes (either 'ok' or 'warning'), False if it fails ('error').
                - level: Validation level ('ok', 'warning', 'error').
                - reason: Descriptive message explaining warnings or errors.
                - extra_data: Rule-specific metadata produced during validation (e.g. normalized values).
        """
        pass


class UploadIdRule(ProcessingRule):
    """
    Validates that upload_id is present and is not a nil UUID.
    """
    NIL_UUID = UUID("00000000-0000-0000-0000-000000000000")

    def validate(self, record: SubscriberEventRecord) -> Tuple[bool, str, Optional[str], Optional[Any]]:
        if not record.upload_id:
            return False, "error", "Upload ID is missing", None
        if record.upload_id == self.NIL_UUID:
            return False, "error", "Upload ID is nil UUID", None
        return True, "ok", None, None


class TimestampRule(ProcessingRule):
    """
    Validates that timestamp exists and is not set in the future beyond a clock skew limit.
    """

    def __init__(self, clock_skew_seconds: int = 300) -> None:
        self.clock_skew_seconds = clock_skew_seconds

    def validate(self, record: SubscriberEventRecord) -> Tuple[bool, str, Optional[str], Optional[Any]]:
        if not record.timestamp:
            return False, "error", "Timestamp is missing", None

        now = datetime.now(timezone.utc) if record.timestamp.tzinfo else datetime.now()
        skew_limit = now + timedelta(seconds=self.clock_skew_seconds)

        if record.timestamp > skew_limit:
            return (
                False,
                "error",
                f"Timestamp '{record.timestamp}' is in the future beyond {self.clock_skew_seconds}s clock skew",
                None
            )
        return True, "ok", None, None


class PhoneNumberRule(ProcessingRule):
    """
    Validates and normalizes Indian mobile phone numbers (MSISDN).
    Supports stripping prefixes like +91, 91, and leading 0.
    Standardizes numbers into the 12-digit format '91xxxxxxxxx'.
    """

    def validate(self, record: SubscriberEventRecord) -> Tuple[bool, str, Optional[str], Optional[Any]]:
        if not record.phone_number:
            return False, "error", "Phone number is missing", None

        normalized = self.normalize_phone(record.phone_number)
        if normalized:
            return True, "ok", None, normalized

        return False, "error", f"Invalid Indian phone number format: '{record.phone_number}'", None

    @staticmethod
    def normalize_phone(phone: str) -> Optional[str]:
        """
        Normalizes various Indian formats into a standard 12-digit format (91xxxxxxxxx).
        """
        if not phone:
            return None

        # Clean non-digits
        clean = re.sub(r"\D", "", phone)

        # Strip leading zeros
        if clean.startswith("0"):
            clean = clean.lstrip("0")

        # 10 digit number starting with [6-9]
        if len(clean) == 10 and re.match(r"^[6-9]\d{9}$", clean):
            return "91" + clean

        # 12 digit number starting with 91 followed by [6-9]
        if len(clean) == 12 and clean.startswith("91") and re.match(r"^91[6-9]\d{9}$", clean):
            return clean

        return None


class CgiRule(ProcessingRule):
    """
    Validates that CGI exists and is not empty.
    """

    def validate(self, record: SubscriberEventRecord) -> Tuple[bool, str, Optional[str], Optional[Any]]:
        if not record.cgi or not str(record.cgi).strip():
            return False, "error", "CGI is missing or empty", None
        return True, "ok", None, None


class CallTypeRule(ProcessingRule):
    """
    Validates that call_type is valid.
    If call_type is CallType.UNKNOWN, it emits a warning instead of rejecting.
    """

    def validate(self, record: SubscriberEventRecord) -> Tuple[bool, str, Optional[str], Optional[Any]]:
        if not record.call_type:
            return False, "error", "Call type is missing", None

        if record.call_type == CallType.UNKNOWN:
            return True, "warning", "Call type is UNKNOWN", None

        if record.call_type not in CallType:
            return False, "error", f"Invalid call type value: '{record.call_type}'", None

        return True, "ok", None, None


class DurationRule(ProcessingRule):
    """
    Validates that duration_seconds is non-negative.
    A duration of zero is valid.
    """

    def validate(self, record: SubscriberEventRecord) -> Tuple[bool, str, Optional[str], Optional[Any]]:
        if record.duration_seconds is None:
            return False, "error", "Duration is missing", None

        if record.duration_seconds < 0:
            return False, "error", f"Duration is negative: {record.duration_seconds}", None

        return True, "ok", None, None


class ImeiRule(ProcessingRule):
    """
    Validates IMEI format (exactly 15 digits) if present.
    """

    def validate(self, record: SubscriberEventRecord) -> Tuple[bool, str, Optional[str], Optional[Any]]:
        if not record.imei:
            return True, "ok", None, None

        clean = re.sub(r"\D", "", str(record.imei))
        if len(clean) == 15 and re.match(r"^\d{15}$", clean):
            return True, "ok", None, None

        return False, "error", f"Invalid IMEI format (expected 15 digits): '{record.imei}'", None


class ImsiRule(ProcessingRule):
    """
    Validates IMSI format (14 or 15 digits) if present.
    """

    def validate(self, record: SubscriberEventRecord) -> Tuple[bool, str, Optional[str], Optional[Any]]:
        if not record.imsi:
            return True, "ok", None, None

        clean = re.sub(r"\D", "", str(record.imsi))
        if (len(clean) == 14 or len(clean) == 15) and re.match(r"^\d{14,15}$", clean):
            return True, "ok", None, None

        return False, "error", f"Invalid IMSI format (expected 14-15 digits): '{record.imsi}'", None
