"""
Unit tests for Forensic JSON export generation and cryptographic integrity verification.
"""

from datetime import datetime, timezone
import hashlib
import json
import math
from types import SimpleNamespace
from uuid import uuid4

import pytest

from app.contracts.localization import JsonExportPayload
from app.localization.exports import compute_payload_sha256, export_json


def test_compute_payload_sha256_canonical_and_tamper_evident():
    """
    Verifies that compute_payload_sha256 ignores the 'integrity' block,
    is canonical (order-independent across key insertions), and detects payload tampering.
    """
    sample_payload = {
        "schema_version": "1.0",
        "case": {"id": "CASE-1", "title": "Test Case"},
        "generated_at": "2026-10-07T12:00:00Z",
        "generated_by": "officer-1",
        "parameters": {"solver": "cheung_lee_jpl", "utm_zone": 43},
        "fixes": [],
        "trace": {"type": "LineString", "coordinates": []},
        "heatmap_summary": {"peak_lat": None, "peak_lon": None},
        "integrity": {"sha256_of_payload": "dummy", "audit_entry_id": "audit-123"},
    }

    hash1 = compute_payload_sha256(sample_payload)
    assert isinstance(hash1, str)
    assert len(hash1) == 64  # SHA-256 hex string

    # Changing integrity block must not change hash
    sample_payload["integrity"]["audit_entry_id"] = "different-audit"
    sample_payload["integrity"]["sha256_of_payload"] = "different-hash"
    hash2 = compute_payload_sha256(sample_payload)
    assert hash1 == hash2

    # Modifying actual content MUST change hash
    sample_payload["case"]["title"] = "Tampered Case Title"
    hash3 = compute_payload_sha256(sample_payload)
    assert hash1 != hash3


def test_export_json_validates_pydantic_schema_and_integrity_hash():
    """
    Verifies that export_json generates a complete payload adhering strictly to
    JsonExportPayload schema with a valid cryptographic SHA-256 hash.
    """
    fix1 = SimpleNamespace(
        fix_id=uuid4(),
        case_id="CASE-JSON-001",
        frame_id=uuid4(),
        subscriber_identifier="919876543210",
        timestamp=datetime(2026, 10, 7, 10, 0, 0, tzinfo=timezone.utc),
        latitude=21.170216,
        longitude=72.830876,
        velocity_east=1.5,
        velocity_north=2.0,
        confidence_radius_meters=35.5,
        gdop=1.65,
        residual_rms=0.012,
        geocoded_address="Ring Road, Surat",
        towers_used=["404-45-101-1", "404-45-101-2", "404-45-101-3"],
    )
    fix2 = SimpleNamespace(
        fix_id=uuid4(),
        case_id="CASE-JSON-001",
        frame_id=uuid4(),
        subscriber_identifier="919876543210",
        timestamp=datetime(2026, 10, 7, 10, 5, 0, tzinfo=timezone.utc),
        latitude=21.172500,
        longitude=72.833000,
        velocity_east=0.0,
        velocity_north=0.0,
        confidence_radius_meters=42.0,
        gdop=1.80,
        residual_rms=0.018,
        geocoded_address="Majura Gate, Surat",
        towers_used=["404-45-101-2", "404-45-101-3", "404-45-101-4"],
    )

    case_info = {
        "case_id": "CASE-JSON-001",
        "case_name": "Operation Surat Safe",
        "mobile_number": "919876543210",
        "suspect_name": "Suspect Target X",
        "imei": "864209041234567",
        "imsi": "404450987654321",
    }

    audit_id = str(uuid4())
    officer_id = str(uuid4())

    payload = export_json(
        case=case_info,
        fixes=[fix1, fix2],
        case_id="CASE-JSON-001",
        officer_id=officer_id,
        audit_entry_id=audit_id,
        utm_zone=43,
    )

    # 1. Pydantic Schema Validation
    validated = JsonExportPayload.model_validate(payload)
    assert validated.schema_version == "1.0"
    assert validated.case.id == "CASE-JSON-001"
    assert validated.case.title == "Operation Surat Safe"
    assert validated.case.target_identifiers.get("msisdn") == "919876543210"
    assert validated.case.target_identifiers.get("imei") == "864209041234567"
    assert validated.generated_by == officer_id

    # 2. Parameters Validation
    assert validated.parameters.solver == "cheung_lee_jpl"
    assert validated.parameters.utm_zone == 43
    assert validated.parameters.huber_k == 1.345
    assert validated.parameters.chi2_gate == 9.21

    # 3. Fixes Verification
    assert len(validated.fixes) == 2
    f1 = validated.fixes[0]
    assert f1.lat == 21.170216
    assert f1.lon == 72.830876
    assert f1.confidence_radius_95_m == 35.5
    assert f1.speed_mps == 2.5  # sqrt(1.5^2 + 2.0^2) = 2.5
    assert f1.heading_deg is not None
    assert f1.n_towers == 3
    assert f1.fix_method == "multilateration"
    assert f1.address == "Ring Road, Surat"
    assert f1.towers_used == ["404-45-101-1", "404-45-101-2", "404-45-101-3"]
    assert f1.raw_vs_filtered is not None
    assert f1.raw_vs_filtered.raw_lat == 21.170216

    f2 = validated.fixes[1]
    assert f2.speed_mps is None or f2.speed_mps == 0.0

    # 4. Trace Verification
    assert validated.trace.type == "LineString"
    assert len(validated.trace.coordinates) == 2
    assert validated.trace.coordinates[0] == [72.830876, 21.170216]
    assert validated.trace.coordinates[1] == [72.833, 21.1725]

    # 5. Heatmap Summary Verification
    assert validated.heatmap_summary.peak_lat is not None
    assert validated.heatmap_summary.peak_lon is not None

    # 6. Cryptographic Hash Verification
    clean_dict = {k: v for k, v in payload.items() if k != "integrity"}
    canonical_json = json.dumps(clean_dict, sort_keys=True, separators=(",", ":"), ensure_ascii=False)
    expected_hash = hashlib.sha256(canonical_json.encode("utf-8")).hexdigest()

    assert payload["integrity"]["sha256_of_payload"] == expected_hash
    assert payload["integrity"]["audit_entry_id"] == audit_id


def test_export_json_empty_case_behaviour():
    """
    Verifies that exporting an empty case (0 fixes) produces a valid JSON structure,
    empty arrays, null heatmap metrics, and a valid cryptographic hash.
    """
    case_info = {
        "case_id": "CASE-EMPTY-999",
        "case_name": "Empty Investigation",
        "mobile_number": "919000000000",
    }

    payload = export_json(
        case=case_info,
        fixes=[],
        case_id="CASE-EMPTY-999",
        officer_id="officer-admin",
        audit_entry_id="audit-empty-1",
    )

    # Validate against Pydantic schema
    validated = JsonExportPayload.model_validate(payload)
    assert validated.case.id == "CASE-EMPTY-999"
    assert len(validated.fixes) == 0
    assert validated.trace.coordinates == []
    assert validated.heatmap_summary.peak_lat is None
    assert validated.heatmap_summary.peak_lon is None
    assert validated.heatmap_summary.area_50pct_m2 is None
    assert validated.heatmap_summary.area_90pct_m2 is None

    # Verify SHA-256 hash
    clean_dict = {k: v for k, v in payload.items() if k != "integrity"}
    canonical_json = json.dumps(clean_dict, sort_keys=True, separators=(",", ":"), ensure_ascii=False)
    expected_hash = hashlib.sha256(canonical_json.encode("utf-8")).hexdigest()

    assert validated.integrity.sha256_of_payload == expected_hash
    assert validated.integrity.audit_entry_id == "audit-empty-1"


def test_export_json_two_tower_and_single_sector_methods():
    """
    Verifies fix_method resolution for 2-tower and single-sector fixes.
    """
    fix_2tower = SimpleNamespace(
        fix_id=uuid4(),
        case_id="CASE-METHODS",
        frame_id=uuid4(),
        subscriber_identifier="919876543210",
        timestamp=datetime.now(timezone.utc),
        latitude=21.170,
        longitude=72.830,
        confidence_radius_meters=150.0,
        gdop=None,
        towers_used=["404-45-1-1", "404-45-1-2"],
    )
    fix_1tower = SimpleNamespace(
        fix_id=uuid4(),
        case_id="CASE-METHODS",
        frame_id=uuid4(),
        subscriber_identifier="919876543210",
        timestamp=datetime.now(timezone.utc),
        latitude=21.175,
        longitude=72.835,
        confidence_radius_meters=500.0,
        gdop=None,
        towers_used=["404-45-1-1"],
    )

    payload = export_json(
        case={"case_id": "CASE-METHODS", "case_name": "Methods Test"},
        fixes=[fix_2tower, fix_1tower],
    )

    validated = JsonExportPayload.model_validate(payload)
    assert validated.fixes[0].fix_method == "two_tower"
    assert validated.fixes[0].n_towers == 2
    assert validated.fixes[1].fix_method == "single_sector"
    assert validated.fixes[1].n_towers == 1
