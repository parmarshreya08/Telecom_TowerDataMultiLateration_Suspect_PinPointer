"""
Unit tests validating robust column mapping, unified timestamps, and
TA/RTT/RSSI parsing for Jio, Vi, and BSNL extractors.
"""

from uuid import uuid4
import pytest
from app.contracts.enums import CallType, Operator, SourceType
from app.ingestion.extractors.jio import JioExtractor
from app.ingestion.extractors.vi import ViExtractor
from app.ingestion.extractors.bsnl import BSNLExtractor


def test_jio_extractor_robust_parsing(tmp_path):
    file_path = tmp_path / "jio_robust.csv"
    # Content mimicking sample_data/jio/jio_cdr_surat.csv
    content = (
        "calling_party,called_party,direction,duration_sec,start_time,cgi_code,signal_dbm,ta,rtt,imei_number,imsi_code\n"
        "919765432109,919812345670,OUT,120,2026-08-01 08:00:00,405-867-200-1,-78,14,52.0,358765432109876,405867012345678\n"
    )
    file_path.write_text(content)

    extractor = JioExtractor()
    upload_id = uuid4()
    records = extractor.extract(str(file_path), upload_id)

    assert len(records) == 1
    r = records[0]
    assert r.operator == Operator.JIO
    assert r.phone_number == "919765432109"
    assert r.cgi == "405-867-200-1"
    assert r.mcc == 405
    assert r.mnc == 867
    assert r.lac == 200
    assert r.cell_id == 1
    assert r.timestamp.year == 2026
    assert r.timestamp.month == 8
    assert r.timestamp.day == 1
    assert r.timestamp.hour == 8
    assert r.duration_seconds == 120
    assert r.signal_strength == -78.0
    assert r.timing_advance == 14
    assert r.rtt == 52.0
    assert r.imei == "358765432109876"
    assert r.imsi == "405867012345678"


def test_vi_extractor_robust_parsing(tmp_path):
    file_path = tmp_path / "vi_robust.csv"
    # Content mimicking sample_data/vi/vi_cdr_surat.csv
    content = (
        "msisdn,imei,imsi,call_date,call_time,cell_global_id,call_type,call_duration,signal_strength,timing_advance,rtt\n"
        "919654321098,860123456789012,404209876543210,2026-08-01,08:05:00,404-20-300-2,MOC,88,-83,10,42.0\n"
    )
    file_path.write_text(content)

    extractor = ViExtractor()
    upload_id = uuid4()
    records = extractor.extract(str(file_path), upload_id)

    assert len(records) == 1
    r = records[0]
    assert r.operator == Operator.VI
    assert r.phone_number == "919654321098"
    assert r.cgi == "404-20-300-2"
    assert r.mcc == 404
    assert r.mnc == 20
    assert r.lac == 300
    assert r.cell_id == 2
    assert r.timestamp.year == 2026
    assert r.timestamp.month == 8
    assert r.timestamp.day == 1
    assert r.timestamp.hour == 8
    assert r.timestamp.minute == 5
    assert r.duration_seconds == 88
    assert r.signal_strength == -83.0
    assert r.timing_advance == 10
    assert r.rtt == 42.0


def test_bsnl_extractor_robust_parsing(tmp_path):
    file_path = tmp_path / "bsnl_robust.csv"
    # Content mimicking sample_data/bsnl/bsnl_cdr_surat.csv
    content = (
        "target_number,calling_number,equipment_imei,subscriber_imsi,call_date,call_initiation_time,cgi,call_direction,duration_sec,signal_strength,timing_advance,rtt\n"
        "919543210987,919812345670,860987654321098,404810987654321,2026-08-01,08:00:00,404-81-400-1,OUT,118,-80,12,48.0\n"
    )
    file_path.write_text(content)

    extractor = BSNLExtractor()
    upload_id = uuid4()
    records = extractor.extract(str(file_path), upload_id)

    assert len(records) == 1
    r = records[0]
    assert r.operator == Operator.BSNL
    assert r.phone_number == "919543210987"
    assert r.cgi == "404-81-400-1"
    assert r.mcc == 404
    assert r.mnc == 81
    assert r.lac == 400
    assert r.cell_id == 1
    assert r.timestamp.year == 2026
    assert r.timestamp.month == 8
    assert r.timestamp.day == 1
    assert r.timestamp.hour == 8
    assert r.duration_seconds == 118
    assert r.signal_strength == -80.0
    assert r.timing_advance == 12
    assert r.rtt == 48.0
