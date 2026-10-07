"""
Integration tests for LocalizationEngine multi-method solver dispatch,
adaptive Kalman filter R scaling, and GeoJSON serialization.
"""

from datetime import datetime, timedelta
from uuid import uuid4
import numpy as np
import pytest

from app.contracts.enums import FrameStatus
from app.contracts.localization import LocalizationFix
from app.contracts.measurement import MeasurementFrame, MeasurementTower
from app.localization.engine import LocalizationEngine
from app.localization.kalman_filter import KalmanTracker

T0 = datetime(2026, 8, 1, 10, 0, 0)


def create_mock_tower(cgi: str, lat: float, lon: float, ta: int = 5, az: float = 45.0, bw: float = 65.0) -> MeasurementTower:
    return MeasurementTower(
        tower_id=uuid4(),
        cgi=cgi,
        latitude=lat,
        longitude=lon,
        azimuth=az,
        beamwidth=bw,
        signal_strength=-75.0,
        timing_advance=ta,
        rtt=40.0,
        pseudorange_meters=float(ta * 78.12),
        is_catalog=True,
    )


def test_engine_three_tower_multilateration_selection():
    engine = LocalizationEngine(utm_zone=43, target_type="pedestrian")
    towers = [
        create_mock_tower("404-20-1-1", 21.1702, 72.8211, ta=6, az=45.0),
        create_mock_tower("404-20-1-2", 21.1902, 72.8311, ta=6, az=135.0),
        create_mock_tower("404-20-1-3", 21.1752, 72.8411, ta=6, az=225.0),
    ]
    frame = MeasurementFrame(
        frame_id=uuid4(),
        upload_id=uuid4(),
        subscriber_identifier="919876543210",
        timestamp=T0,
        towers=towers,
        status=FrameStatus.READY,
    )

    fixes = engine.compute_fixes([frame], case_id="CASE-001")
    assert len(fixes) == 1
    fix = fixes[0]
    assert fix.fix_method == "multilateration"
    assert fix.n_towers == 3
    assert fix.confidence_radius_meters > 0


def test_engine_two_tower_selection():
    engine = LocalizationEngine(utm_zone=43, target_type="pedestrian")
    towers = [
        create_mock_tower("404-20-1-1", 21.1702, 72.8211, ta=8, az=45.0),
        create_mock_tower("404-20-1-2", 21.1802, 72.8311, ta=8, az=315.0),
    ]
    frame = MeasurementFrame(
        frame_id=uuid4(),
        upload_id=uuid4(),
        subscriber_identifier="919876543210",
        timestamp=T0,
        towers=towers,
        status=FrameStatus.READY,
    )

    fixes = engine.compute_fixes([frame], case_id="CASE-001")
    assert len(fixes) == 1
    fix = fixes[0]
    assert fix.fix_method == "two_tower"
    assert fix.n_towers == 2
    assert fix.confidence_radius_meters > 0


def test_engine_single_tower_selection():
    engine = LocalizationEngine(utm_zone=43, target_type="pedestrian")
    towers = [
        create_mock_tower("404-20-1-1", 21.1702, 72.8211, ta=4, az=90.0),
    ]
    frame = MeasurementFrame(
        frame_id=uuid4(),
        upload_id=uuid4(),
        subscriber_identifier="919876543210",
        timestamp=T0,
        towers=towers,
        status=FrameStatus.READY,
    )

    fixes = engine.compute_fixes([frame], case_id="CASE-001")
    assert len(fixes) == 1
    fix = fixes[0]
    assert fix.fix_method == "single_sector"
    assert fix.n_towers == 1
    assert fix.confidence_radius_meters > 50.0


def test_kalman_r_scaling_for_weak_fixes():
    # Kalman measurement noise R_k must scale up proportionally when measurement uncertainty is high
    tracker = KalmanTracker(dt=1.0, base_measurement_std=25.0, target_type="pedestrian")

    # Initial fix
    res1 = tracker.update(np.array([1000.0, 1000.0]), residual_rms=10.0, gdop=1.2, measurement_uncertainty=25.0)
    assert res1["initialized"]

    # Tight 3-tower fix update (unc = 20m)
    res_tight = tracker.update(np.array([1005.0, 1002.0]), residual_rms=15.0, gdop=1.5, measurement_uncertainty=20.0)

    # Coarse single-sector fix update (unc = 300m)
    tracker_coarse = KalmanTracker(dt=1.0, base_measurement_std=25.0, target_type="pedestrian")
    tracker_coarse.update(np.array([1000.0, 1000.0]), residual_rms=10.0, gdop=1.2, measurement_uncertainty=25.0)
    res_coarse = tracker_coarse.update(np.array([1005.0, 1002.0]), residual_rms=15.0, gdop=10.0, measurement_uncertainty=300.0)

    # Adaptive R scale for coarse fix must be much higher than for tight fix
    assert res_coarse["adaptive_R_scale"] > res_tight["adaptive_R_scale"] * 5.0


def test_engine_to_geojson_properties():
    engine = LocalizationEngine(utm_zone=43, target_type="pedestrian")
    towers_1 = [create_mock_tower("404-20-1-1", 21.1702, 72.8211, ta=4)]
    towers_2 = [
        create_mock_tower("404-20-1-1", 21.1702, 72.8211, ta=8),
        create_mock_tower("404-20-1-2", 21.1802, 72.8311, ta=8),
    ]

    f1 = MeasurementFrame(
        frame_id=uuid4(), upload_id=uuid4(), subscriber_identifier="919876543210",
        timestamp=T0, towers=towers_1, status=FrameStatus.READY,
    )
    f2 = MeasurementFrame(
        frame_id=uuid4(), upload_id=uuid4(), subscriber_identifier="919876543210",
        timestamp=T0 + timedelta(minutes=5), towers=towers_2, status=FrameStatus.READY,
    )

    fixes = engine.compute_fixes([f1, f2], case_id="CASE-001")
    geojson = engine.to_geojson(fixes, frames=[f1, f2])

    point_features = [f for f in geojson["features"] if f["geometry"]["type"] == "Point"]
    assert len(point_features) == 2

    # Check first fix properties (single sector)
    p1 = point_features[0]["properties"]
    assert p1["fix_method"] == "single_sector"
    assert p1["confidence_badge"] == "Coarse (1 sector)"

    # Check second fix properties (two tower)
    p2 = point_features[1]["properties"]
    assert p2["fix_method"] == "two_tower"
    assert p2["confidence_badge"] == "Low confidence (2 towers)"
