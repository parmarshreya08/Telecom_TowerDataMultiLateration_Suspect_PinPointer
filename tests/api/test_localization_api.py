"""
Unit and API Integration tests for the Standalone Localization Engine API.
Verifies open endpoints (/api/v1/localization/estimate and /estimate/single).
"""

import pytest
from fastapi.testclient import TestClient

from app.main import app

client = TestClient(app)


def test_estimate_localization_success_default_excludes_velocity():
    """
    Tests submitting a geometrically consistent 3-tower observation frame and verifying position fix + GeoJSON output.
    Verifies velocity_east and velocity_north are None by default.
    """
    payload = {
        "subscriber_identifier": "919876543210",
        "case_id": "TEST-CASE-001",
        "target_type": "pedestrian",
        "apply_kalman": True,
        "include_velocity": False,
        "frames": [
            {
                "timestamp": "2026-09-07T10:00:00Z",
                "towers": [
                    {
                        "cgi": "404-20-0001-0001",
                        "latitude": 21.1710,
                        "longitude": 72.8300,
                        "pseudorange_meters": 111.0,
                        "signal_strength": -75.0,
                        "azimuth": 180.0,
                        "beamwidth": 60.0,
                    },
                    {
                        "cgi": "404-20-0001-0002",
                        "latitude": 21.1700,
                        "longitude": 72.8310,
                        "pseudorange_meters": 103.0,
                        "signal_strength": -80.0,
                        "azimuth": 270.0,
                        "beamwidth": 60.0,
                    },
                    {
                        "cgi": "404-20-0001-0003",
                        "latitude": 21.1690,
                        "longitude": 72.8290,
                        "pseudorange_meters": 150.0,
                        "signal_strength": -70.0,
                        "azimuth": 45.0,
                        "beamwidth": 60.0,
                    },
                ],
            }
        ],
    }

    response = client.post("/api/v1/localization/estimate", json=payload)
    assert response.status_code == 200, response.text
    data = response.json()

    assert data["status"] == "success"
    assert data["fix_count"] == 1

    fix = data["fixes"][0]
    assert fix["subscriber_identifier"] == "919876543210"
    assert "latitude" in fix
    assert "longitude" in fix
    assert fix["velocity_east"] is None
    assert fix["velocity_north"] is None
    assert fix["confidence_radius_meters"] > 0

    assert data["geojson"]["type"] == "FeatureCollection"


def test_estimate_localization_includes_velocity_when_requested():
    """
    Verifies velocity_east and velocity_north are populated when include_velocity=True across consecutive frames.
    """
    payload = {
        "subscriber_identifier": "919876543210",
        "case_id": "TEST-CASE-002",
        "target_type": "pedestrian",
        "apply_kalman": True,
        "include_velocity": True,
        "frames": [
            {
                "timestamp": "2026-09-07T10:00:00Z",
                "towers": [
                    {"cgi": "404-20-0001-0001", "latitude": 21.1710, "longitude": 72.8300, "pseudorange_meters": 111.0},
                    {"cgi": "404-20-0001-0002", "latitude": 21.1700, "longitude": 72.8310, "pseudorange_meters": 103.0},
                    {"cgi": "404-20-0001-0003", "latitude": 21.1690, "longitude": 72.8290, "pseudorange_meters": 150.0},
                ],
            },
            {
                "timestamp": "2026-09-07T10:01:00Z",
                "towers": [
                    {"cgi": "404-20-0001-0001", "latitude": 21.1712, "longitude": 72.8302, "pseudorange_meters": 111.0},
                    {"cgi": "404-20-0001-0002", "latitude": 21.1702, "longitude": 72.8312, "pseudorange_meters": 103.0},
                    {"cgi": "404-20-0001-0003", "latitude": 21.1692, "longitude": 72.8292, "pseudorange_meters": 150.0},
                ],
            },
        ],
    }

    response = client.post("/api/v1/localization/estimate", json=payload)
    assert response.status_code == 200, response.text
    data = response.json()
    assert data["fix_count"] == 2
    fix2 = data["fixes"][1]
    assert fix2["velocity_east"] is not None
    assert fix2["velocity_north"] is not None


def test_estimate_single_frame_convenience_endpoint():
    """
    Tests single frame endpoint with minimum 3 towers.
    """
    single_frame_payload = {
        "timestamp": "2026-09-07T10:05:00Z",
        "towers": [
            {"cgi": "404-20-0002-0001", "latitude": 21.1710, "longitude": 72.8300, "pseudorange_meters": 111.0},
            {"cgi": "404-20-0002-0002", "latitude": 21.1700, "longitude": 72.8310, "pseudorange_meters": 103.0},
            {"cgi": "404-20-0002-0003", "latitude": 21.1690, "longitude": 72.8290, "pseudorange_meters": 150.0},
        ],
    }

    response = client.post(
        "/api/v1/localization/estimate/single?subscriber_identifier=TEST_NUM&target_type=pedestrian",
        json=single_frame_payload,
    )
    assert response.status_code == 200, response.text
    data = response.json()
    assert data["status"] == "success"
    assert data["fix_count"] == 1
    assert data["fixes"][0]["velocity_east"] is None


def test_estimate_localization_less_than_3_towers_validation_error():
    """
    Verifies 422 Unprocessable Entity error when fewer than 3 towers are provided.
    """
    invalid_payload = {
        "subscriber_identifier": "919876543210",
        "frames": [
            {
                "towers": [
                    {"latitude": 21.1702, "longitude": 72.8311},
                    {"latitude": 21.1750, "longitude": 72.8350},
                ]
            }
        ],
    }
    response = client.post("/api/v1/localization/estimate", json=invalid_payload)
    assert response.status_code in [400, 422]
