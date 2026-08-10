"""
Unit tests for the refactored TelecomFileDetector.
Validates operator/source classification, exception throwing, and metadata skipping.
"""

from typing import Any
import pytest

from app.contracts.enums import Operator, SourceType
from app.exceptions.parsing import (
    InvalidFileTypeError,
    MissingHeadersError,
)
from app.ingestion.detector.detector import TelecomFileDetector


@pytest.fixture
def detector() -> TelecomFileDetector:
    """
    Instance fixture for TelecomFileDetector.
    """
    return TelecomFileDetector()


def test_detect_airtel_cdr(tmp_path: Any, detector: TelecomFileDetector) -> None:
    """
    Tests identification of Airtel CDR.
    """
    file_path = tmp_path / "airtel_test.csv"
    headers = "Target No,First CGI,First CGI Lat/Long,IMEI,Called No\n"
    file_path.write_text(headers)

    res = detector.detect(str(file_path))
    assert res.operator == Operator.AIRTEL
    assert res.source_type == SourceType.CDR
    assert res.confidence > 0.0
    assert res.extractor_name == "AirtelExtractor"


def test_detect_vi_cdr(tmp_path: Any, detector: TelecomFileDetector) -> None:
    """
    Tests identification of Vi CDR with metadata preamble lines.
    """
    file_path = tmp_path / "vi_test.csv"
    content = (
        "Investigation Code: CASE-123\n"
        "Date: 2026-07-29\n"
        "\n"
        "Target /A PARTY NUMBER,First BTS Location,First Cell Global Id,Duration\n"
        "919999988888,Site A,404-20-1-1,120\n"
    )
    file_path.write_text(content)

    res = detector.detect(str(file_path))
    assert res.operator == Operator.VI
    assert res.source_type == SourceType.CDR
    assert res.confidence > 0.0
    assert res.extractor_name == "ViExtractor"


def test_detect_bsnl_cdr(tmp_path: Any, detector: TelecomFileDetector) -> None:
    """
    Tests identification of BSNL CDR.
    """
    file_path = tmp_path / "bsnl_test.csv"
    headers = "Target/A-Party Number,First BTS Location,Lat-,Long-,equipment_imei\n"
    file_path.write_text(headers)

    res = detector.detect(str(file_path))
    assert res.operator == Operator.BSNL
    assert res.source_type == SourceType.CDR
    assert res.confidence > 0.0
    assert res.extractor_name == "BSNLExtractor"


def test_detect_jio_cdr(tmp_path: Any, detector: TelecomFileDetector) -> None:
    """
    Tests identification of Jio CDR.
    """
    file_path = tmp_path / "jio_test.csv"
    headers = "Calling Party,First Cell ID,Roaming Circle Name,ta,cgi_code\n"
    file_path.write_text(headers)

    res = detector.detect(str(file_path))
    assert res.operator == Operator.JIO
    assert res.source_type == SourceType.CDR
    assert res.confidence > 0.0
    assert res.extractor_name == "JioExtractor"


def test_detect_tower_dump(tmp_path: Any, detector: TelecomFileDetector) -> None:
    """
    Tests identification of Operator Tower Dump.
    """
    file_path = tmp_path / "tower_test.csv"
    headers = "ECGI,Band,PCI,RSRP,RSRQ,azimuth,beamwidth,range_meters,frequency_band\n"
    file_path.write_text(headers)

    res = detector.detect(str(file_path))
    assert res.source_type == SourceType.TOWER_DUMP
    assert res.extractor_name == "TowerDumpExtractor"


def test_detect_spot_dump(tmp_path: Any, detector: TelecomFileDetector) -> None:
    """
    Tests identification of Spot Dump.
    """
    file_path = tmp_path / "spot_test.csv"
    headers = "Google Map,Lat,Long,Operator,Circle,phone_number\n"
    file_path.write_text(headers)

    res = detector.detect(str(file_path))
    assert res.source_type == SourceType.SPOT_DUMP
    assert res.extractor_name == "SpotDumpExtractor"


def test_detect_unsupported_file_extension(detector: TelecomFileDetector) -> None:
    """
    Ensures truly unsupported files (e.g. .docx) throw InvalidFileTypeError.
    """
    with pytest.raises(InvalidFileTypeError) as excinfo:
        detector.detect("unsupported_extension.docx")
    assert "Unsupported file type" in str(excinfo.value)


def test_detect_file_not_found(detector: TelecomFileDetector) -> None:
    """
    Ensures non-existent files throw FileNotFoundError.
    """
    with pytest.raises(FileNotFoundError):
        detector.detect("non_existent_file.csv")


def test_detect_empty_file(tmp_path: Any, detector: TelecomFileDetector) -> None:
    """
    Ensures empty CSV files throw MissingHeadersError.
    """
    file_path = tmp_path / "empty_test.csv"
    file_path.write_text("")

    with pytest.raises(MissingHeadersError) as excinfo:
        detector.detect(str(file_path))
    assert "No valid header row" in str(excinfo.value)


def test_detect_unknown_operator_returns_unknown(tmp_path: Any, detector: TelecomFileDetector) -> None:
    """
    Ensures headers without matching operator columns returns Operator.UNKNOWN (instead of raising).
    """
    file_path = tmp_path / "unknown_op.csv"
    headers = "UnrelatedColA,UnrelatedColB,Calling Number,Called Number\n"
    file_path.write_text(headers)

    res = detector.detect(str(file_path))
    assert res.operator == Operator.UNKNOWN
    assert res.confidence == 0.0
    assert res.matched_columns == []


def test_detect_unknown_source_type_returns_unknown(tmp_path: Any, detector: TelecomFileDetector) -> None:
    """
    Ensures headers without matching data columns returns SourceType.UNKNOWN (instead of raising).
    """
    file_path = tmp_path / "unknown_source.csv"
    headers = "airtel,jio,vi,bsnl\n"
    file_path.write_text(headers)

    res = detector.detect(str(file_path))
    assert res.source_type == SourceType.UNKNOWN
    assert res.confidence == 0.0
    assert res.matched_columns == []
