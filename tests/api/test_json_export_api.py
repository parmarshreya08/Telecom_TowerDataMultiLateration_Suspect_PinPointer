"""
Integration and API tests for the Forensic JSON Export endpoints.
Verifies RBAC enforcement, Pydantic schema adherence, cryptographic hash verification,
empty-case behavior, and 404 handling.
"""

from datetime import datetime, timezone
import hashlib
import json
from unittest.mock import AsyncMock, MagicMock
from uuid import uuid4

import pytest
from fastapi.testclient import TestClient

from app.contracts.localization import JsonExportPayload
from app.core.deps import get_current_officer, get_db_session
from app.database.models import OfficerModel
from app.database.models.telecom import CaseModel, LocalizationFixModel, MeasurementFrameModel
from app.main import app


@pytest.fixture
def client():
    return TestClient(app)


@pytest.fixture
def admin_officer():
    return OfficerModel(
        officer_id=uuid4(),
        officer_name="Admin Officer",
        email="admin@erakshak.gov.in",
        password_hash="hash",
        role="ADMIN",
        is_active=True,
    )


@pytest.fixture
def inspector_officer():
    return OfficerModel(
        officer_id=uuid4(),
        officer_name="Inspector Officer",
        email="inspector@erakshak.gov.in",
        password_hash="hash",
        role="INSPECTOR",
        is_active=True,
    )


def test_export_json_unauthenticated_returns_401(client):
    """
    Unauthenticated requests (missing Bearer token) must be rejected with 401 Unauthorized.
    """
    app.dependency_overrides.clear()
    res1 = client.get("/api/cases/CASE-TEST-001/export/json")
    assert res1.status_code == 401

    res2 = client.get("/api/case/CASE-TEST-001/export/json")
    assert res2.status_code == 401


def test_export_json_nonexistent_case_returns_404(client, admin_officer):
    """
    Exporting a non-existent case ID must return 404 Not Found.
    """
    mock_db = AsyncMock()
    # Mock case query returning None
    mock_case_result = MagicMock()
    mock_case_result.scalar_one_or_none.return_value = None
    mock_db.execute.return_value = mock_case_result

    app.dependency_overrides[get_current_officer] = lambda: admin_officer
    app.dependency_overrides[get_db_session] = lambda: mock_db

    try:
        response = client.get("/api/cases/NONEXISTENT-CASE/export/json")
        assert response.status_code == 404
        assert "not found" in response.json()["detail"].lower()
    finally:
        app.dependency_overrides.clear()


def test_export_json_rbac_forbidden_for_unassigned_inspector(client, inspector_officer):
    """
    Inspectors without assignment or creator rights on a case must be rejected with 403 Forbidden.
    """
    mock_db = AsyncMock()

    # Case exists but was created by someone else
    case_obj = CaseModel(
        case_id="CASE-RESTRICTED",
        case_name="Restricted Operation",
        case_number="CASE-RES-001",
        created_by="Other Officer",
        status="Active",
    )
    mock_case_res = MagicMock()
    mock_case_res.scalar_one_or_none.return_value = case_obj

    # No assignments exist
    mock_assignment_res = MagicMock()
    mock_assignment_res.scalar_one_or_none.return_value = None

    mock_db.execute.side_effect = [mock_case_res, mock_assignment_res]

    app.dependency_overrides[get_current_officer] = lambda: inspector_officer
    app.dependency_overrides[get_db_session] = lambda: mock_db

    try:
        response = client.get("/api/cases/CASE-RESTRICTED/export/json")
        assert response.status_code == 403
        assert "access denied" in response.json()["detail"].lower()
    finally:
        app.dependency_overrides.clear()


def test_export_json_success_with_fixes_and_valid_hash(client, admin_officer):
    """
    Verifies that a valid export request returns 200 OK, attachment header,
    valid JsonExportPayload schema, and correct SHA-256 integrity digest.
    """
    mock_db = AsyncMock()

    case_obj = CaseModel(
        case_id="CASE-SURAT-01",
        case_name="Surat Bank Robbery Investigation",
        case_number="FIR-2026-SRT-01",
        suspect_name="Ramesh Bhai",
        mobile_number="919876543210",
        description="Armed robbery case",
        created_by="Admin Officer",
        status="Active",
    )
    mock_case_res = MagicMock()
    mock_case_res.scalar_one_or_none.return_value = case_obj

    fix1 = LocalizationFixModel(
        fix_id=uuid4(),
        case_id="CASE-SURAT-01",
        frame_id=uuid4(),
        subscriber_identifier="919876543210",
        timestamp=datetime(2026, 10, 7, 10, 0, 0),
        latitude=21.170216,
        longitude=72.830876,
        velocity_east=1.2,
        velocity_north=0.9,
        confidence_radius_meters=32.4,
        gdop=1.55,
        residual_rms=0.005,
        geocoded_address="Ring Road, Surat",
    )

    mock_fixes_res = MagicMock()
    mock_fixes_res.scalars.return_value.all.return_value = [fix1]

    mock_frames_res = MagicMock()
    mock_frames_res.scalars.return_value.all.return_value = []

    # Setup db.execute sequence (Admin skips check_case_access db query)
    mock_db.execute.side_effect = [
        mock_case_res,   # case fetch
        mock_fixes_res,  # repo.get_localization_fixes
        mock_frames_res, # repo.get_frames_by_case
    ]

    app.dependency_overrides[get_current_officer] = lambda: admin_officer
    app.dependency_overrides[get_db_session] = lambda: mock_db

    try:
        # Test /api/cases/...
        mock_db.execute.side_effect = [
            mock_case_res,
            mock_fixes_res,
            mock_frames_res,
        ]
        response = client.get("/api/cases/CASE-SURAT-01/export/json")
        assert response.status_code == 200
        assert response.headers["content-type"] == "application/json"
        assert 'attachment; filename="e-rakshak_CASE-SURAT-01_export.json"' in response.headers["content-disposition"]

        data = response.json()

        # Pydantic schema validation
        payload = JsonExportPayload.model_validate(data)
        assert payload.case.id == "CASE-SURAT-01"
        assert payload.case.title == "Surat Bank Robbery Investigation"
        assert len(payload.fixes) == 1
        assert payload.fixes[0].lat == 21.170216
        assert payload.fixes[0].speed_mps == 1.5  # sqrt(1.2^2 + 0.9^2) = 1.5
        assert payload.trace.coordinates == [[72.830876, 21.170216]]

        # Verify cryptographic SHA-256 hash
        clean_dict = {k: v for k, v in data.items() if k != "integrity"}
        canonical_json = json.dumps(clean_dict, sort_keys=True, separators=(",", ":"), ensure_ascii=False)
        expected_hash = hashlib.sha256(canonical_json.encode("utf-8")).hexdigest()

        assert payload.integrity.sha256_of_payload == expected_hash

        # Test alias /api/case/...
        mock_db.execute.side_effect = [
            mock_case_res,
            mock_fixes_res,
            mock_frames_res,
        ]
        response_alias = client.get("/api/case/CASE-SURAT-01/export/json")
        assert response_alias.status_code == 200
        assert 'attachment; filename="e-rakshak_CASE-SURAT-01_export.json"' in response_alias.headers["content-disposition"]
    finally:
        app.dependency_overrides.clear()


def test_export_json_empty_case_returns_valid_payload(client, admin_officer):
    """
    Verifies that exporting a case with 0 fixes returns 200 OK, empty fixes array,
    and a valid cryptographic signature.
    """
    mock_db = AsyncMock()

    case_obj = CaseModel(
        case_id="CASE-EMPTY-02",
        case_name="Fresh Investigation Without Fixes",
        case_number="FIR-2026-EMPTY-02",
        created_by="Admin Officer",
        status="Active",
    )
    mock_case_res = MagicMock()
    mock_case_res.scalar_one_or_none.return_value = case_obj

    mock_fixes_res = MagicMock()
    mock_fixes_res.scalars.return_value.all.return_value = []

    mock_frames_res = MagicMock()
    mock_frames_res.scalars.return_value.all.return_value = []

    mock_db.execute.side_effect = [
        mock_case_res,
        mock_fixes_res,
        mock_frames_res,
    ]

    app.dependency_overrides[get_current_officer] = lambda: admin_officer
    app.dependency_overrides[get_db_session] = lambda: mock_db

    try:
        response = client.get("/api/cases/CASE-EMPTY-02/export/json")
        assert response.status_code == 200
        data = response.json()

        payload = JsonExportPayload.model_validate(data)
        assert payload.case.id == "CASE-EMPTY-02"
        assert len(payload.fixes) == 0
        assert payload.trace.coordinates == []

        clean_dict = {k: v for k, v in data.items() if k != "integrity"}
        canonical_json = json.dumps(clean_dict, sort_keys=True, separators=(",", ":"), ensure_ascii=False)
        expected_hash = hashlib.sha256(canonical_json.encode("utf-8")).hexdigest()

        assert payload.integrity.sha256_of_payload == expected_hash
    finally:
        app.dependency_overrides.clear()
