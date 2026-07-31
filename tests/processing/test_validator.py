"""
Unit tests for the Validation & Enrichment processing stage.
"""

from datetime import datetime, timezone, timedelta
from uuid import uuid4, UUID
import pytest

from app.contracts.enums import CallType, Operator, SourceType
from app.contracts.subscriber import SubscriberEventRecord
from app.processing.service import ProcessingService, calculate_quality_score


def create_mock_record(
    phone_number: str = "9876543210",
    cgi: str = "404-45-1234-5678",
    timestamp: datetime = None,
    call_type: CallType = CallType.OUTGOING,
    duration_seconds: int = 60,
    imei: str = "123456789012345",
    imsi: str = "123456789012345",
    mcc: int = 404,
    mnc: int = 45,
    lac: int = 1234,
    cell_id: int = 5678,
    upload_id: UUID = None
) -> SubscriberEventRecord:
    """
    Helper to generate a mock SubscriberEventRecord.
    """
    if timestamp is None:
        timestamp = datetime.now()
    if upload_id is None:
        upload_id = uuid4()
    return SubscriberEventRecord(
        event_id=uuid4(),
        upload_id=upload_id,
        operator=Operator.AIRTEL,
        source_type=SourceType.CDR,
        phone_number=phone_number,
        imei=imei,
        imsi=imsi,
        timestamp=timestamp,
        call_type=call_type,
        duration_seconds=duration_seconds,
        cgi=cgi,
        mcc=mcc,
        mnc=mnc,
        lac=lac,
        cell_id=cell_id,
        tower_latitude=None,
        tower_longitude=None,
        signal_strength=None,
        timing_advance=None,
        rtt=None,
        source_file="test_cdr.csv",
        record_number=1,
        raw_fields={}
    )


def test_processing_service_valid_records() -> None:
    """
    Verifies valid records process correctly and phone number is normalized in the wrapper.
    """
    service = ProcessingService()
    record = create_mock_record(phone_number="+91 98765 43210")

    result = service.process_records([record])

    assert len(result.valid_records) == 1
    assert len(result.rejected_records) == 0
    assert len(result.warning_records) == 0

    # Normalization check
    assert result.valid_records[0].normalized_phone_number == "919876543210"

    # Immutability check: the original record is untouched
    assert result.valid_records[0].record.phone_number == "+91 98765 43210"

    # Stats check
    stats = result.validation_statistics
    assert stats.total_records == 1
    assert stats.valid_records == 1
    assert stats.rejected_records == 0
    assert stats.duplicate_records == 0
    assert stats.unique_cgis == 1


def test_phone_number_normalization_variants() -> None:
    """
    Verifies normalization of various Indian phone formats.
    """
    service = ProcessingService()
    formats = [
        "+919876543210",
        "919876543210",
        "09876543210",
        "9876543210",
        " 98765-43210 "
    ]
    records = [create_mock_record(phone_number=fmt) for fmt in formats]

    result = service.process_records(records)

    assert len(result.valid_records) == 5
    for val_rec in result.valid_records:
        assert val_rec.normalized_phone_number == "919876543210"


def test_processing_service_warning_unknown_call_type() -> None:
    """
    Asserts records with CallType.UNKNOWN are accepted but emit warnings.
    """
    service = ProcessingService()
    record = create_mock_record(call_type=CallType.UNKNOWN)

    result = service.process_records([record])

    assert len(result.valid_records) == 1
    assert len(result.rejected_records) == 0
    assert len(result.warning_records) == 1
    assert "Call type is UNKNOWN" in result.warning_records[0].warnings


def test_timestamp_clock_skew_validation() -> None:
    """
    Tests clock skew tolerance logic for future timestamps.
    """
    service = ProcessingService(clock_skew_seconds=60)  # 1 min skew limit

    # 1. Tolerable future timestamp (30s future)
    tolerable_time = datetime.now() + timedelta(seconds=30)
    tolerable_rec = create_mock_record(timestamp=tolerable_time)

    # 2. Too far future timestamp (2 mins future)
    too_future_time = datetime.now() + timedelta(minutes=2)
    too_future_rec = create_mock_record(timestamp=too_future_time)

    result = service.process_records([tolerable_rec, too_future_rec])

    assert len(result.valid_records) == 1
    assert len(result.rejected_records) == 1
    assert result.valid_records[0].record.event_id == tolerable_rec.event_id
    assert result.rejected_records[0].event_id == too_future_rec.event_id


def test_quality_score_completeness() -> None:
    """
    Tests quality score calculation across different metadata states.
    """
    # 1. Complete record (IMEI, IMSI, MCC/MNC, LAC/CID, non-zero duration)
    # Total Checks = 5 points -> score = 0.5 + 0.5 * 1.0 = 1.0
    rec_complete = create_mock_record(duration_seconds=60)
    score_complete = calculate_quality_score(rec_complete)
    assert score_complete == 1.0

    # 2. Minimal record (IMEI/IMSI missing, MCC/MNC/LAC/CID missing, duration zero)
    # Total Checks = 0 points -> score = 0.5 + 0.0 = 0.5
    rec_minimal = create_mock_record(
        imei=None,
        imsi=None,
        mcc=None,
        mnc=None,
        lac=None,
        cell_id=None,
        duration_seconds=0
    )
    score_minimal = calculate_quality_score(rec_minimal)
    assert score_minimal == 0.5

    # 3. Partial record (IMEI present, IMSI missing, MCC/MNC present, LAC/CID missing, duration > 0)
    # Checks: IMEI(+1), MCC/MNC(+1), duration(+1) = 3 points -> score = 0.5 + 0.5 * 3/5 = 0.8
    rec_partial = create_mock_record(
        imsi=None,
        lac=None,
        cell_id=None,
        duration_seconds=10
    )
    score_partial = calculate_quality_score(rec_partial)
    assert score_partial == 0.8


def test_record_validation_failures() -> None:
    """
    Verifies rejection on negative duration, missing CGI, nil upload ID, etc.
    """
    from unittest.mock import MagicMock
    service = ProcessingService()

    upload_id = uuid4()

    def mock_rec(phone="9876543210", cgi="404-45-1234-5678", upload=upload_id, duration=60, imei=None, imsi=None, timestamp=None):
        m = MagicMock(spec=SubscriberEventRecord)
        m.phone_number = phone
        m.cgi = cgi
        m.upload_id = upload
        m.duration_seconds = duration
        m.imei = imei
        m.imsi = imsi
        m.timestamp = timestamp or datetime.now()
        m.call_type = CallType.OUTGOING
        m.event_id = uuid4()
        return m

    # 1. Negative duration
    neg_duration = mock_rec(duration=-5)
    # 2. Missing CGI
    missing_cgi = mock_rec(cgi=" ")
    # 3. Nil upload ID
    nil_upload = mock_rec(upload=UUID("00000000-0000-0000-0000-000000000000"))
    # 4. Bad IMEI
    bad_imei = mock_rec(imei="12345")
    # 5. Bad IMSI
    bad_imsi = mock_rec(imsi="12345678901234567")

    result = service.process_records([neg_duration, missing_cgi, nil_upload, bad_imei, bad_imsi])

    assert len(result.valid_records) == 0
    assert len(result.rejected_records) == 5


def test_deduplication_of_records() -> None:
    """
    Tests deduplication of identical valid records using normalized phone numbers.
    """
    service = ProcessingService()

    upload_id = uuid4()
    timestamp = datetime(2026, 7, 29, 10, 0, 0)

    # Identical records (except phone format)
    r1 = create_mock_record(phone_number="9876543210", timestamp=timestamp, upload_id=upload_id)
    r2 = create_mock_record(phone_number="+91 98765 43210", timestamp=timestamp, upload_id=upload_id)
    r3 = create_mock_record(phone_number="09876543210", timestamp=timestamp, upload_id=upload_id)

    # Different timestamp
    r4 = create_mock_record(phone_number="9876543210", timestamp=timestamp + timedelta(seconds=1), upload_id=upload_id)

    result = service.process_records([r1, r2, r3, r4])

    # Should only keep r1 (or first) and r4
    assert len(result.valid_records) == 2
    assert result.validation_statistics.duplicate_records == 2
    assert result.validation_statistics.total_records == 4
    assert result.validation_statistics.valid_records == 2
