"""
E-Rakshak pipeline exceptions package.
"""

from app.exceptions.parsing import (
    ExtractionFailureError,
    ExtractorNotFoundError,
    IngestionParsingError,
    InvalidFileTypeError,
    MissingHeadersError,
    OperatorNotSupportedError,
)
from app.exceptions.upload import (
    CaseMismatchError,
    DuplicateUploadError,
    FileSizeLimitExceededError,
    IngestionUploadError,
    StorageWriteError,
)
from app.exceptions.validation import (
    BusinessRuleViolationError,
    IngestionValidationError,
    InvalidCoordinatesError,
    InvalidPhoneNumberError,
    MalformedTimestampError,
)

__all__ = [
    "IngestionParsingError",
    "OperatorNotSupportedError",
    "InvalidFileTypeError",
    "ExtractionFailureError",
    "ExtractorNotFoundError",
    "MissingHeadersError",
    "IngestionUploadError",
    "FileSizeLimitExceededError",
    "DuplicateUploadError",
    "StorageWriteError",
    "CaseMismatchError",
    "IngestionValidationError",
    "InvalidPhoneNumberError",
    "InvalidCoordinatesError",
    "MalformedTimestampError",
    "BusinessRuleViolationError",
]
