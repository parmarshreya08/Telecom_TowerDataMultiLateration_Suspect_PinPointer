"""
Checksum and hashing helpers for E-Rakshak deduplication logic.
"""

import hashlib
from app.core.logging import logger


def calculate_file_hash(file_path: str) -> str:
    """
    Computes SHA-256 hash of the target file to facilitate deduplication checks.

    Args:
        file_path: Absolute local path to the file.

    Returns:
        Hexadecimal SHA-256 checksum string.
    """
    sha256 = hashlib.sha256()
    
    try:
        # Read in 64KB chunks
        with open(file_path, "rb") as f:
            while chunk := f.read(65536):
                sha256.update(chunk)
        
        checksum = sha256.hexdigest()
        logger.debug("checksum_calculated", path=file_path, hash=checksum)
        return checksum
    except Exception as e:
        logger.error("failed_to_calculate_checksum", path=file_path, error=str(e))
        raise
