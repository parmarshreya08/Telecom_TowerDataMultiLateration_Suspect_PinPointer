"""
Date and time parsing utilities.
Supports parsing telecom log timestamps in multiple standard formats.
"""

from datetime import datetime, timezone
import re
from typing import Any


def parse_telecom_datetime(value: Any) -> datetime:
    """
    Parses various date-time format strings extracted from operator logs.
    
    Tolerates typical telecom layout varieties (e.g. slashes, ISO, separate sheets).

    Args:
        value: Datetime object, float timestamp, or formatted string.

    Returns:
        TimeZone-aware or naive datetime representing the parsed stamp.

    Raises:
        ValueError: If formatting is completely unrecognized.
    """
    if isinstance(value, datetime):
        return value

    if not value:
        raise ValueError("Empty timestamp value provided.")

    val_str = str(value).strip()

    # Clean double spacing
    val_str = re.sub(r"\s+", " ", val_str)

    # Standard formats
    formats = [
        # ISO / Jio format
        "%Y-%m-%dT%H:%M:%S%z",
        "%Y-%m-%dT%H:%M:%SZ",
        "%Y-%m-%d %H:%M:%S",
        # Airtel / Vi format
        "%d/%m/%Y %H:%M:%S",
        "%d-%m-%Y %H:%M:%S",
        # BSNL format
        "%Y/%m/%d %H:%M:%S",
        # Slashed and compact
        "%d/%m/%y %H:%M:%S",
        "%y/%m/%d %H:%M:%S",
    ]

    for fmt in formats:
        try:
            return datetime.strptime(val_str, fmt)
        except ValueError:
            continue

    # Attempt to match date-only stamps (time default 00:00:00)
    date_only_formats = [
        "%Y-%m-%d",
        "%d/%m/%Y",
        "%d-%m-%Y",
    ]
    for fmt in date_only_formats:
        try:
            return datetime.strptime(val_str, fmt)
        except ValueError:
            continue

    # Attempt regex extraction for custom combinations like "29-07-2026 10:30:15" 
    # where multiple spaces or hidden delimiters exist
    raise ValueError(f"Unsupported timestamp format: '{value}'")
