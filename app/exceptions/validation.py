"""
Exceptions raised during domain schema validation stages.
"""

class IngestionValidationError(Exception):
    """Base exception for all domain and rule validation errors in E-Rakshak."""
    def __init__(self, message: str, details: dict = None):
        super().__init__(message)
        self.message = message
        self.details = details or {}


class InvalidPhoneNumberError(IngestionValidationError):
    """Raised when a subscriber identifier (MSISDN) fails length or prefix tests."""
    pass


class InvalidCoordinatesError(IngestionValidationError):
    """Raised when tower or GPS coordinates fall outside valid bounds (e.g. India borders)."""
    pass


class MalformedTimestampError(IngestionValidationError):
    """Raised when timestamps fail to parse or are set in the future."""
    pass


class BusinessRuleViolationError(IngestionValidationError):
    """Raised when a record violates custom verification rules."""
    pass
