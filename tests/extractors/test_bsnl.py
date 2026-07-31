"""
Unit tests for BSNLExtractor.
Verifies parsing of standard files, skipping of malformed rows, preambles, and missing columns.
"""

from typing import Any
from uuid import uuid4
import pytest

from app.contracts.enums import CallType, Operator, SourceType
from app.ingestion.extractors.bsnl import BSNLExtractor


@pytest.fixture
def extractor() -> BSNLExtractor:
    """
    Instance fixture for BSNLExtractor.
    """
    return BSNLExtractor()


def test_bsnl_extractor_valid_csv(tmp_path: Any, extractor: BSNLExtractor) -> None:
    """
    Tests parsing a standard BSNL CDR CSV containing headers and data.
    """
    file_path = tmp_path / "bsnl_valid.csv"
    content = (
        "Target/A-Party Number,Call Type,Type of Connection,Other/B-party Number,LRN of B-Party Number,Translation of LRN,Call Date,Call Initiation Time,Call Duration,First BTS Location,First Cell Global ID,Last BTS Location,Last Cell Global ID,SMS Centre No.,Service Type,IMEI,IMSI,Original Calling Party,Roaming Network/Circle,Switch/MSC ID,In TG,Out TG\n"
        "919999988888,MOC,Voice,919999977777,919999977777,Translation,2026-07-29,10:00:00,120,BTS Location A,404-45-1234-5678,BTS Location Last,404-45-1234-5679,919999900000,Service,358765432109876,404450123456789,Original,Roaming,Switch-1,In-1,Out-1\n"
        "919999988888,MTC,,919999977777,,29/07/2026,2026-07-29,10:05:00,45,FirstBTS,404-45-1234-5678,,,,,358765432109876,404450123456789,,,,,,\n"
    )
    file_path.write_text(content)

    upload_id = uuid4()
    records = extractor.extract(str(file_path), upload_id)
    assert len(records) == 2

    r1 = records[0]
    assert r1.operator == Operator.BSNL
    assert r1.source_type == SourceType.CDR
    assert r1.upload_id == upload_id
    assert r1.phone_number == "919999988888"
    assert r1.imei == "358765432109876"
    assert r1.imsi == "404450123456789"
    assert r1.cgi == "404-45-1234-5678"
    assert r1.mcc == 404
    assert r1.mnc == 45
    assert r1.lac == 1234
    assert r1.cell_id == 5678
    assert r1.duration_seconds == 120
    assert r1.call_type == CallType.OUTGOING
    assert r1.record_number == 1
    # Verify raw fields preservation
    assert r1.raw_fields["Target/A-Party Number"] == "919999988888"
    assert r1.raw_fields["Other/B-party Number"] == "919999977777"
    assert r1.raw_fields["Type of Connection"] == "Voice"
    assert r1.raw_fields["First BTS Location"] == "BTS Location A"
    assert r1.raw_fields["Last Cell Global ID"] == "404-45-1234-5679"
    assert r1.raw_fields["Roaming Network/Circle"] == "Roaming"

    r2 = records[1]
    assert r2.operator == Operator.BSNL
    assert r2.upload_id == upload_id
    assert r2.phone_number == "919999988888"
    assert r2.cgi == "404-45-1234-5678"
    assert r2.mcc == 404
    assert r2.mnc == 45
    assert r2.lac == 1234
    assert r2.cell_id == 5678
    assert r2.duration_seconds == 45
    assert r2.call_type == CallType.INCOMING
    assert r2.record_number == 2
    assert r2.raw_fields["First BTS Location"] == "FirstBTS"


def test_bsnl_extractor_missing_optional_columns(tmp_path: Any, extractor: BSNLExtractor) -> None:
    """
    Checks that the extractor functions when optional fields (Call Initiation Time, IMEI, IMSI) are missing/empty.
    """
    file_path = tmp_path / "bsnl_missing_opts.csv"
    content = (
        "Target/A-Party Number,Call Date,First Cell Global ID\n"
        "919999988888,2026-07-29,404-45-1234-5678\n"
    )
    file_path.write_text(content)

    upload_id = uuid4()
    records = extractor.extract(str(file_path), upload_id)
    assert len(records) == 1

    r = records[0]
    assert r.phone_number == "919999988888"
    assert r.cgi == "404-45-1234-5678"
    assert r.upload_id == upload_id
    assert r.imei is None
    assert r.imsi is None
    assert r.duration_seconds == 0  # defaults to 0


def test_bsnl_extractor_non_standard_cgi(tmp_path: Any, extractor: BSNLExtractor) -> None:
    """
    Checks that non-standard cell ID format is preserved in cgi and components are None.
    """
    file_path = tmp_path / "bsnl_non_std_cgi.csv"
    content = (
        "Target/A-Party Number,Call Date,First Cell Global ID\n"
        "919999988888,2026-07-29,some_raw_cell_id_value\n"
    )
    file_path.write_text(content)

    upload_id = uuid4()
    records = extractor.extract(str(file_path), upload_id)
    assert len(records) == 1

    r = records[0]
    assert r.cgi == "some_raw_cell_id_value"
    assert r.mcc is None
    assert r.mnc is None
    assert r.lac is None
    assert r.cell_id is None


def test_bsnl_extractor_malformed_rows(tmp_path: Any, extractor: BSNLExtractor) -> None:
    """
    Verifies malformed rows are skipped (logged) without interrupting the complete run.
    """
    file_path = tmp_path / "bsnl_malformed.csv"
    content = (
        "Target/A-Party Number,Call Date,First Cell Global ID\n"
        "919999988888,2026-07-29,404-45-1234-5678\n"  # Valid
        "919999988888,,404-45-1234-5678\n"            # Malformed (missing Call Date)
        "919999988888,invalid_date,404-45-1234-5678\n" # Malformed (bad date)
        "919999988888,2026-07-29,404-45-1234-5678\n"  # Valid
    )
    file_path.write_text(content)

    upload_id = uuid4()
    records = extractor.extract(str(file_path), upload_id)
    assert len(records) == 2  # Only row 1 and row 4 are valid
    assert records[0].record_number == 1
    assert records[1].record_number == 4


def test_bsnl_extractor_metadata_preamble(tmp_path: Any, extractor: BSNLExtractor) -> None:
    """
    Asserts headers density scanning correctly ignores file metadata comments at the top.
    """
    file_path = tmp_path / "bsnl_preamble.csv"
    content = (
        "Investigation Title: Suspect Phone Ingress Map\n"
        "Generated By: TeleCom ISP Server\n"
        "Target Cell Circle: Delhi NCR\n"
        "\n"
        "Target/A-Party Number,Call Date,First Cell Global ID\n"
        "919999988888,2026-07-29,404-45-1234-5678\n"
    )
    file_path.write_text(content)

    upload_id = uuid4()
    records = extractor.extract(str(file_path), upload_id)
    assert len(records) == 1
    assert records[0].phone_number == "919999988888"
    assert records[0].cgi == "404-45-1234-5678"


def test_bsnl_extractor_empty_file(tmp_path: Any, extractor: BSNLExtractor) -> None:
    """
    Asserts empty files return an empty list of records.
    """
    file_path = tmp_path / "bsnl_empty.csv"
    file_path.write_text("")

    upload_id = uuid4()
    records = extractor.extract(str(file_path), upload_id)
    assert records == []
