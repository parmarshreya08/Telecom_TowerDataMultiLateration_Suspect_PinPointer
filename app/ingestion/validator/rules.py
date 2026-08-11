"""
Validation rules for E-Rakshak telecom records validation stage.
Includes regex-based checks for phone numbers (MSISDN), range checks for coordinates, and timezone audits.
"""

from abc import ABC, abstractmethod
from datetime import datetime, timezone
import re
from typing import Any

from app.utils.datetime_utils import now_ist


class ValidationRule(ABC):
    """
    Abstract interface for single data constraint checks.
    """

    @abstractmethod
    def validate(self, field_value: Any) -> bool:
        """
        Validates the given field.

        Args:
            field_value: The value to validate.

        Returns:
            True if valid, False otherwise.
        """
        pass

    @property
    @abstractmethod
    def error_message(self) -> str:
        """
        The message returning when validation fails.
        """
        pass


class IndianMsisdnRule(ValidationRule):
    """
    Checks if a string is a valid Indian mobile number (MSISDN).
    Accepts 10-digit numbers or numbers prefixed with 91, +91.
    """

    def validate(self, field_value: Any) -> bool:
        if not field_value:
            return False
        clean = re.sub(r"\D", "", str(field_value))
        # Match standard Indian patterns
        # 10 digits starting with 6, 7, 8, 9
        # or 12 digits starting with 91 followed by 6, 7, 8, 9
        if len(clean) == 10:
            return bool(re.match(r"^[6-9]\d{9}$", clean))
        if len(clean) == 12 and clean.startswith("91"):
            return bool(re.match(r"^91[6-9]\d{9}$", clean))
        return False

    @property
    def error_message(self) -> str:
        return "Invalid MSISDN structure. Must be a 10-digit Indian phone number or prefixed with 91."


class IndiaGeoCoordinatesRule(ValidationRule):
    """
    Ensures latitude/longitude coordinates fall strictly within boundary bounds of India.
    Rough box bounds: Lat (8.0 to 38.0), Lon (68.0 to 98.0).
    """

    def validate(self, field_value: Any) -> bool:
        if not isinstance(field_value, tuple) or len(field_value) != 2:
            return False
        try:
            lat, lon = float(field_value[0]), float(field_value[1])
            return (8.0 <= lat <= 38.0) and (68.0 <= lon <= 98.0)
        except (ValueError, TypeError):
            return False

    @property
    def error_message(self) -> str:
        return "Coordinates out of bounds. Must fall within India's coordinates box [8.0-38.0 Lat, 68.0-98.0 Lon]."


class PastOrPresentTimestampRule(ValidationRule):
    """
    Ensures timestamps represent records that happened in the past or present, not future.
    """

    def validate(self, field_value: Any) -> bool:
        if not isinstance(field_value, datetime):
            return False
        # Treat naive datetime as system timezone or convert to UTC
        now = datetime.now(timezone.utc) if field_value.tzinfo else now_ist()
        return field_value <= now

    @property
    def error_message(self) -> str:
        return "Timestamp is set in the future."
