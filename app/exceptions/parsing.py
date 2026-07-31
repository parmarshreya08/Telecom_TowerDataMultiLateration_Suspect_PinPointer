"""
Exceptions raised during operator and file parsing/extraction stages.
"""

class IngestionParsingError(Exception):
    """Base exception for all parsing and extraction errors in E-Rakshak."""
    def __init__(self, message: str, details: dict = None):
        super().__init__(message)
        self.message = message
        self.details = details or {}


class OperatorNotSupportedError(IngestionParsingError):
    """Raised when the operator specified or detected is not supported."""
    pass


class InvalidFileTypeError(IngestionParsingError):
    """Raised when the file format or extension is invalid for the parser."""
    pass


class ExtractionFailureError(IngestionParsingError):
    """Raised when data extraction from a document fails due to structure issues."""
    pass


class ExtractorNotFoundError(IngestionParsingError):
    """Raised when the requested operator extractor is not found in the factory registry."""
    pass


class MissingHeadersError(ExtractionFailureError):
    """Raised when required headers/columns are missing in the raw telecom file."""
    pass
