"""
Date and time parsing utilities.
Supports parsing telecom log timestamps in multiple standard formats.
"""

from datetime import datetime, timezone, timedelta
import re
from typing import Any

IST = timezone(timedelta(hours=5, minutes=30))


def now_ist() -> datetime:
    """
    Current Indian Standard Time (UTC+5:30) as a naive datetime.

    The DB schema stores naive `timestamp` columns, so naive IST binds
    cleanly through asyncpg while reading as Indian wall-clock time.
    """
    return datetime.now(IST).replace(tzinfo=None)


def parse_iso_datetime_naive(value: str) -> datetime:
    """
    Parses an ISO-8601 string and normalizes to a naive IST datetime.

    Query filters (start/end) may arrive with a timezone suffix ("Z",
    "+05:30"); the DB stores naive IST timestamps, so an aware bound would
    crash asyncpg. Aware input is converted to IST then stripped.
    """
    dt = datetime.fromisoformat(value)
    if dt.tzinfo is not None:
        dt = dt.astimezone(IST).replace(tzinfo=None)
    return dt


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
