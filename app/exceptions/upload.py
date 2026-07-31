"""
Exceptions raised during file upload and ingestion initialization stages.
"""

class IngestionUploadError(Exception):
    """Base exception for all file upload errors in E-Rakshak."""
    def __init__(self, message: str, details: dict = None):
        super().__init__(message)
        self.message = message
        self.details = details or {}


class FileSizeLimitExceededError(IngestionUploadError):
    """Raised when the uploaded file exceeds the configured maximum size limit."""
    pass


class DuplicateUploadError(IngestionUploadError):
    """Raised when a file with the same SHA256 checksum has already been ingested."""
    pass


class StorageWriteError(IngestionUploadError):
    """Raised when writing the uploaded file to disk fails."""
    pass


class CaseMismatchError(IngestionUploadError):
    """Raised when the upload configuration doesn't match the active case records."""
    pass
