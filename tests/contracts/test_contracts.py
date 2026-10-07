"""
Unit tests validating Pydantic contract schemas and constraints.
"""

from datetime import datetime
from uuid import uuid4

import pytest
from pydantic import ValidationError

from app.contracts.enums import CallType, FrameStatus, Operator, RadioTechnology, SourceType
from app.contracts.measurement import MeasurementFrame, MeasurementTower
from app.contracts.subscriber import SubscriberEventRecord
from app.contracts.tower import TowerRecord
from app.contracts.upload import UploadMetadata


def test_upload_metadata_success() -> None:
    """
    Validates correct UploadMetadata mapping.
    """
    meta = UploadMetadata(
        upload_id=uuid4(),
        case_id="CASE-123",
        source_type=SourceType.CDR,
        operator=Operator.AIRTEL,
        original_filename="airtel_cdr.csv",
        stored_filename="temp_airtel_cdr.csv",
        sha256="e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855",
        mime_type="text/csv",
        file_size_bytes=5000,
        uploaded_by="Officer_A",
        uploaded_at=datetime.utcnow()
    )
    assert meta.original_filename == "airtel_cdr.csv"
    assert meta.file_size_bytes == 5000


def test_upload_metadata_invalid_sha() -> None:
    """
    Ensures SHA-256 length constraint fires validation errors.
    """
    with pytest.raises(ValidationError) as excinfo:
        UploadMetadata(
            upload_id=uuid4(),
            case_id="CASE-123",
            source_type=SourceType.CDR,
            operator=Operator.AIRTEL,
            original_filename="airtel_cdr.csv",
            stored_filename="temp_airtel_cdr.csv",
            sha256="too-short-hash",  # Invalid
            mime_type="text/csv",
            file_size_bytes=5000,
            uploaded_by="Officer_A",
            uploaded_at=datetime.utcnow()
        )
    assert "SHA-256 checksum must be exactly 64 characters" in str(excinfo.value)


def test_subscriber_event_validation() -> None:
    """
    Checks constraints on SubscriberEventRecord.
    """
    # Negative duration check
    with pytest.raises(ValidationError) as excinfo:
        SubscriberEventRecord(
            event_id=uuid4(),
            upload_id=uuid4(),
            operator=Operator.JIO,
            source_type=SourceType.CDR,
            phone_number="919876543210",
            timestamp=datetime.utcnow(),
            call_type=CallType.INCOMING,
            duration_seconds=-5,  # Invalid negative duration
            cgi="404-45-1234-5678",
            source_file="source.csv",
            record_number=1,
            raw_fields={}
        )
    assert "Duration cannot be negative" in str(excinfo.value)


def test_tower_record_azimuth_validation() -> None:
    """
    Checks azimuth and coordinate constraints on TowerRecord.
    """
    # Azimuth out of bounds
    with pytest.raises(ValidationError) as excinfo:
        TowerRecord(
            tower_id=uuid4(),
            operator=Operator.VI,
            radio=RadioTechnology.LTE,
            mcc=404,
            mnc=20,
            lac=4321,
            cell_id=9876,
            cgi="404-20-4321-9876",
            latitude=28.6139,
            longitude=77.2090,
            azimuth=450.0,  # Invalid (>360)
            site_address="Mumbai"
        )
    assert "azimuth and beamwidth angles must be between 0 and 360" in str(excinfo.value)


def test_measurement_frame_minimum_towers_enforced() -> None:
    """
    Enforces minimum 3 towers constraint on MeasurementFrame.
    """
    t1 = MeasurementTower(
        tower_id=uuid4(),
        cgi="404-10-1-1",
        latitude=28.0,
        longitude=77.0
    )
    t2 = MeasurementTower(
        tower_id=uuid4(),
        cgi="404-10-1-2",
        latitude=28.1,
        longitude=77.1
    )
    t3 = MeasurementTower(
        tower_id=uuid4(),
        cgi="404-10-1-3",
        latitude=28.2,
        longitude=77.2
    )

    # Success cases with 3, 2, and 1 tower
    frame3 = MeasurementFrame(
        frame_id=uuid4(),
        upload_id=uuid4(),
        subscriber_identifier="919876543210",
        timestamp=datetime.utcnow(),
        towers=[t1, t2, t3],
        status=FrameStatus.READY
    )
    assert len(frame3.towers) == 3

    frame2 = MeasurementFrame(
        frame_id=uuid4(),
        upload_id=uuid4(),
        subscriber_identifier="919876543210",
        timestamp=datetime.utcnow(),
        towers=[t1, t2],
        status=FrameStatus.READY
    )
    assert len(frame2.towers) == 2

    frame1 = MeasurementFrame(
        frame_id=uuid4(),
        upload_id=uuid4(),
        subscriber_identifier="919876543210",
        timestamp=datetime.utcnow(),
        towers=[t1],
        status=FrameStatus.READY
    )
    assert len(frame1.towers) == 1

    # Fail case with 0 towers
    with pytest.raises(ValidationError) as excinfo:
        MeasurementFrame(
            frame_id=uuid4(),
            upload_id=uuid4(),
            subscriber_identifier="919876543210",
            timestamp=datetime.utcnow(),
            towers=[],  # Invalid (<1)
            status=FrameStatus.READY
        )
    assert "requires at least 1 observed cell tower" in str(excinfo.value)
