"""
Unit tests for ExtractorFactory.
Checks standard routing and exception validation.
"""

import pytest

from app.contracts.detection import DetectionResult
from app.contracts.enums import Operator, SourceType
from app.exceptions.parsing import ExtractorNotFoundError
from app.ingestion.extractors.airtel import AirtelExtractor
from app.ingestion.extractors.bsnl import BSNLExtractor
from app.ingestion.extractors.factory import ExtractorFactory
from app.ingestion.extractors.jio import JioExtractor
from app.ingestion.extractors.vi import ViExtractor


def test_factory_returns_airtel_extractor() -> None:
    """
    Asserts Airtel CDR classification returns AirtelExtractor.
    """
    res = DetectionResult(
        operator=Operator.AIRTEL,
        source_type=SourceType.CDR,
        confidence=0.95,
        detected_by="TelecomFileDetector",
        extractor_name="AirtelExtractor",
        matched_columns=["Target No", "First CGI"]
    )
    extractor = ExtractorFactory.get_extractor(res)
    assert isinstance(extractor, AirtelExtractor)


def test_factory_returns_jio_extractor() -> None:
    """
    Asserts Jio CDR classification returns JioExtractor.
    """
    res = DetectionResult(
        operator=Operator.JIO,
        source_type=SourceType.CDR,
        confidence=0.88,
        detected_by="TelecomFileDetector",
        extractor_name="JioExtractor",
        matched_columns=["Calling Party", "First Cell ID"]
    )
    extractor = ExtractorFactory.get_extractor(res)
    assert isinstance(extractor, JioExtractor)


def test_factory_returns_vi_extractor() -> None:
    """
    Asserts Vi CDR classification returns ViExtractor.
    """
    res = DetectionResult(
        operator=Operator.VI,
        source_type=SourceType.CDR,
        confidence=0.91,
        detected_by="TelecomFileDetector",
        extractor_name="ViExtractor",
        matched_columns=["Target /A PARTY NUMBER"]
    )
    extractor = ExtractorFactory.get_extractor(res)
    assert isinstance(extractor, ViExtractor)


def test_factory_returns_bsnl_extractor() -> None:
    """
    Asserts BSNL CDR classification returns BSNLExtractor.
    """
    res = DetectionResult(
        operator=Operator.BSNL,
        source_type=SourceType.CDR,
        confidence=0.85,
        detected_by="TelecomFileDetector",
        extractor_name="BSNLExtractor",
        matched_columns=["Target/A-Party Number"]
    )
    extractor = ExtractorFactory.get_extractor(res)
    assert isinstance(extractor, BSNLExtractor)


def test_factory_unknown_operator_raises_not_found() -> None:
    """
    Asserts Operator.UNKNOWN results in ExtractorNotFoundError.
    """
    res = DetectionResult(
        operator=Operator.UNKNOWN,
        source_type=SourceType.CDR,
        confidence=0.0,
        detected_by="TelecomFileDetector",
        extractor_name="UnknownExtractor",
        matched_columns=[]
    )
    with pytest.raises(ExtractorNotFoundError) as excinfo:
        ExtractorFactory.get_extractor(res)
    assert "No database extractor configuration registered" in str(excinfo.value)
