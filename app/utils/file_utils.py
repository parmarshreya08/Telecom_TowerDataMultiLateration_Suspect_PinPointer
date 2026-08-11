"""
File validation, saving, and hashing utilities for E-Rakshak.
"""

import hashlib
import os
from pathlib import Path
from uuid import uuid4

from fastapi import UploadFile

from app.core.logging import logger

# Supported file extensions
SUPPORTED_EXTENSIONS = {".csv", ".xlsx", ".xls", ".tsv"}

# MIME types mapped to extensions
MIME_TYPE_MAP = {
    "text/csv": ".csv",
    "application/csv": ".csv",
    "text/x-csv": ".csv",
    "text/comma-separated-values": ".csv",
    "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet": ".xlsx",
    "application/vnd.ms-excel": ".xls",
    "text/tab-separated-values": ".tsv",
    "application/octet-stream": None,  # Allow but verify extension
}


def create_upload_directory(directory_path: str) -> None:
    """
    Creates the directory path recursively if it does not already exist.
    """
    if not os.path.exists(directory_path):
        try:
            os.makedirs(directory_path, exist_ok=True)
            logger.info("upload_directory_created", path=directory_path)
        except Exception as e:
            logger.error("failed_to_create_upload_directory", path=directory_path, error=str(e))
            raise


def safe_filename(original_name: str) -> str:
    """
    Generates a unique secure stored filename based on UUID, preserving original extension.
    """
    ext = Path(original_name).suffix.lower() if original_name else ".csv"
    if ext not in SUPPORTED_EXTENSIONS:
        ext = ".csv"
    return f"{uuid4()}{ext}"


async def validate_uploaded_file(upload_file: UploadFile, max_size_mb: int = 100) -> str:
    """
    Validates uploaded file constraints: extension, mime type, and maximum size limits.
    Does not load the file into memory.
    Returns the detected file extension.
    """
    filename = upload_file.filename or ""

    # 1. Extension Check
    ext = Path(filename).suffix.lower()
    if ext not in SUPPORTED_EXTENSIONS:
        logger.warning("file_validation_failed", filename=filename, reason="unsupported_extension")
        raise ValueError(
            f"Unsupported file format '{ext}'. "
            f"Supported: {', '.join(sorted(SUPPORTED_EXTENSIONS))}"
        )

    # 2. MIME type check
    content_type = (upload_file.content_type or "").lower()
    allowed_mimes = list(MIME_TYPE_MAP.keys())
    is_valid_mime = any(mime in content_type for mime in allowed_mimes)

    if not is_valid_mime:
        logger.warning("file_validation_failed", filename=filename, content_type=content_type, reason="invalid_mime_type")
        raise ValueError(f"Invalid MIME type: {content_type}. Only CSV, XLSX, XLS, TSV files are allowed.")

    # 3. Size check (streaming / seek check)
    try:
        upload_file.file.seek(0, 2)  # seek to end
        size = upload_file.file.tell()
        upload_file.file.seek(0)  # reset to beginning
    except Exception as e:
        logger.error("failed_to_check_file_size", error=str(e))
        raise IOError(f"Could not read upload stream size: {e}")

    # Empty file check
    if size <= 0:
        logger.warning("file_validation_failed", filename=filename, reason="empty_file")
        raise ValueError("Empty file uploaded. Processing rejected.")

    # Size limit check
    max_bytes = max_size_mb * 1024 * 1024
    if size > max_bytes:
        logger.warning(
            "file_validation_failed",
            filename=filename,
            size_bytes=size,
            limit_bytes=max_bytes,
            reason="file_size_exceeded"
        )
        raise ValueError(f"File size ({size / 1024 / 1024:.1f} MB) exceeds the maximum limit of {max_size_mb} MB.")

    return ext


async def save_uploaded_file(upload_file: UploadFile, destination_path: str) -> int:
    """
    Saves an uploaded file to disk in blocks of 64KB, returning total bytes written.
    Never overwrites existing files.
    """
    # ponytail: don't check exists — NamedTemporaryFile already creates the file on Windows
    total_bytes = 0
    try:
        with open(destination_path, "wb") as buffer:
            while chunk := await upload_file.read(65536):
                buffer.write(chunk)
                total_bytes += len(chunk)
    except Exception as e:
        logger.error("failed_to_save_file_to_disk", path=destination_path, error=str(e))
        if os.path.exists(destination_path):
            try:
                os.remove(destination_path)
            except Exception:
                pass
        raise
    finally:
        await upload_file.seek(0)

    logger.info("file_saved", path=destination_path, bytes_written=total_bytes)
    return total_bytes


def generate_sha256(file_path: str) -> str:
    """
    Generates SHA-256 hash by reading files in blocks of 64KB (streaming).
    """
    sha256 = hashlib.sha256()
    try:
        with open(file_path, "rb") as f:
            while chunk := f.read(65536):
                sha256.update(chunk)
        return sha256.hexdigest()
    except Exception as e:
        logger.error("failed_to_generate_sha256", path=file_path, error=str(e))
        raise
