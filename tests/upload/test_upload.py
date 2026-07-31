"""
Unit tests for Upload Service, API endpoints, and File Utilities.
"""

from io import BytesIO
from typing import Any
from unittest.mock import AsyncMock, MagicMock, patch
import pytest
from fastapi import UploadFile, status
from fastapi.testclient import TestClient
from starlette.datastructures import Headers

from app.contracts.detection import DetectionResult
from app.contracts.enums import Operator, SourceType
from app.database.models.telecom import UploadMetadataModel
from app.utils.file_utils import generate_sha256, validate_uploaded_file


def test_file_utils_sha256_generation(tmp_path: Any) -> None:
    """
    Asserts streaming SHA-256 utility returns correct checksum for static files.
    """
    file_path = tmp_path / "hash_test.csv"
    file_path.write_text("Calling Party,First Cell ID\n")
    
    checksum = generate_sha256(str(file_path))
    assert len(checksum) == 64
    assert all(c in "0123456789abcdef" for c in checksum)


@pytest.mark.asyncio
async def test_file_utils_large_file_validation() -> None:
    """
    Ensures validation raises errors when file size exceeds maximum limits.
    """
    # Create mock file with large spool length
    mock_file = MagicMock()
    mock_file.tell.return_value = 101 * 1024 * 1024  # 101 MB

    upload_file = UploadFile(
        file=mock_file,
        filename="test.csv",
        headers=Headers({"content-type": "text/csv"})
    )

    with patch.object(UploadFile, "seek", AsyncMock()):
        with pytest.raises(ValueError) as excinfo:
            await validate_uploaded_file(upload_file, max_size_mb=100)
        assert "exceeds the maximum limit" in str(excinfo.value)


@pytest.mark.asyncio
async def test_file_utils_empty_file_validation() -> None:
    """
    Ensures validation rejects zero byte uploads.
    """
    mock_file = MagicMock()
    mock_file.tell.return_value = 0  # 0 bytes

    upload_file = UploadFile(
        file=mock_file,
        filename="test.csv",
        headers=Headers({"content-type": "text/csv"})
    )

    with patch.object(UploadFile, "seek", AsyncMock()):
        with pytest.raises(ValueError) as excinfo:
            await validate_uploaded_file(upload_file, max_size_mb=100)
        assert "Empty file uploaded" in str(excinfo.value)


def test_upload_endpoint_invalid_extension(client: TestClient) -> None:
    """
    Verifies that Excel files are rejected with 400 Bad Request.
    """
    # Excel content representation
    file_payload = {"file": ("dataset.xlsx", b"dummy xlsx contents", "application/vnd.ms-excel")}
    form_payload = {"case_id": "CASE-1", "uploaded_by": "Officer_A"}

    response = client.post("/api/upload", files=file_payload, data=form_payload)
    assert response.status_code == status.HTTP_400_BAD_REQUEST
    assert "Unsupported extension" in response.json()["detail"]


@patch("app.services.upload_service.generate_sha256", return_value="e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855")
@patch("app.services.upload_service.TelecomFileDetector.detect")
@patch("app.database.repository.TelecomRepository.get_upload_by_hash")
@patch("app.database.repository.TelecomRepository.create_upload_metadata")
@patch("app.services.upload_service.save_uploaded_file", return_value=123)
def test_upload_endpoint_success(
    mock_save: MagicMock,
    mock_create: MagicMock,
    mock_get: MagicMock,
    mock_detect: MagicMock,
    mock_hash: MagicMock,
    client: TestClient
) -> None:
    """
    Tests successful upload routing, detector execution, and metadata creation.
    """
    mock_get.return_value = None  # Not a duplicate
    mock_detect.return_value = DetectionResult(
        operator=Operator.AIRTEL,
        source_type=SourceType.CDR,
        confidence=1.0,
        detected_by="mock",
        extractor_name="AirtelExtractor",
        matched_columns=["Target No"]
    )
    
    # Airtel headers matching AIRTEL_SIGNATURE in signatures.py
    csv_content = b"Target No,First CGI,First CGI Lat/Long,IMEI,Called No\n"
    file_payload = {"file": ("airtel.csv", BytesIO(csv_content), "text/csv")}
    form_payload = {"case_id": "CASE-99", "uploaded_by": "Officer_B"}

    response = client.post("/api/upload", files=file_payload, data=form_payload)
    assert response.status_code == status.HTTP_201_CREATED
    
    data = response.json()
    assert data["case_id"] == "CASE-99"
    assert data["duplicate"] is False
    assert data["original_filename"] == "airtel.csv"
    assert data["detection"]["operator"] == Operator.AIRTEL.value
    assert data["detection"]["source_type"] == SourceType.CDR.value
    assert data["detection"]["extractor_name"] == "AirtelExtractor"


@patch("app.services.upload_service.generate_sha256", return_value="somehash")
@patch("app.database.repository.TelecomRepository.get_upload_by_hash")
@patch("app.services.upload_service.save_uploaded_file", return_value=123)
def test_upload_endpoint_duplicate(
    mock_save: MagicMock,
    mock_get: MagicMock,
    mock_hash: MagicMock,
    client: TestClient
) -> None:
    """
    Tests duplicate handling where database matching SHA-256 returns duplicate=true.
    """
    # Mock return existing model
    existing = UploadMetadataModel(
        upload_id="4a6e87f1-5b72-4d22-8ccb-a27efb5e5c2d",
        case_id="CASE-99",
        source_type=SourceType.CDR.value,
        operator=Operator.AIRTEL.value,
        original_filename="old_file.csv",
        stored_filename="old_stored_file.csv",
        sha256="somehash",
        mime_type="text/csv",
        file_size_bytes=123,
        uploaded_by="Officer_C",
        uploaded_at="2026-07-29T12:00:00"
    )
    mock_get.return_value = existing

    csv_content = b"Target No,First CGI,First CGI Lat/Long,IMEI,Called No\n"
    file_payload = {"file": ("airtel.csv", BytesIO(csv_content), "text/csv")}
    form_payload = {"case_id": "CASE-99", "uploaded_by": "Officer_B"}

    response = client.post("/api/upload", files=file_payload, data=form_payload)
    assert response.status_code == status.HTTP_201_CREATED
    
    data = response.json()
    assert data["duplicate"] is True
    assert data["upload_id"] == "4a6e87f1-5b72-4d22-8ccb-a27efb5e5c2d"
