"""
Unit tests for validation rules in the pipeline.
"""

from datetime import datetime, timedelta, timezone
import pytest
from app.ingestion.validator.rules import (
    IndiaGeoCoordinatesRule,
    IndianMsisdnRule,
    PastOrPresentTimestampRule,
)


def test_indian_msisdn_rule() -> None:
    rule = IndianMsisdnRule()
    # Valid phone numbers
    assert rule.validate("9876543210") is True
    assert rule.validate("+919876543210") is True
    assert rule.validate("919876543210") is True
    assert rule.validate("  9876543210  ") is True

    # Invalid phone numbers
    assert rule.validate("1234567890") is False  # Must start with 6-9
    assert rule.validate("9876543") is False  # Too short
    assert rule.validate("9876543210123") is False  # Too long
    assert rule.validate("987654321a") is False  # Contains letters
    assert rule.validate(None) is False


def test_india_geo_coordinates_rule() -> None:
    rule = IndiaGeoCoordinatesRule()
    # Delhi (Inside India bounds)
    assert rule.validate((28.6139, 77.2090)) is True
    # Mumbai (Inside India bounds)
    assert rule.validate((19.0760, 72.8777)) is True

    # Outside India bounds
    assert rule.validate((0.0, 0.0)) is False
    assert rule.validate((51.5074, -0.1278)) is False  # London
    assert rule.validate("invalid_tuple") is False
    assert rule.validate((28.6, "not_float")) is False


def test_past_or_present_timestamp_rule() -> None:
    rule = PastOrPresentTimestampRule()
    
    # Past
    assert rule.validate(datetime.now() - timedelta(days=1)) is True
    # Present
    assert rule.validate(datetime.now()) is True
    
    # Future
    assert rule.validate(datetime.now() + timedelta(days=1)) is False
    assert rule.validate("invalid_datetime") is False
