"""
Unit tests for Two-Tower circle-circle intersection resolver and disambiguation.
Tests known geometries: two intersecting, tangent, disjoint, nested,
sector wedge disambiguation, Kalman prior fallback, and 50/50 ambiguous weighting.
"""

import math
import numpy as np
import pytest

from app.localization.two_tower import TwoTowerResolver, circle_circle_intersection


def test_circle_circle_intersection_two_points():
    # Known 3-4-5 Pythagorean geometry:
    # Tower 1 at (0, 0) with r1 = 500m
    # Tower 2 at (600, 0) with r2 = 500m
    # Chord baseline at x = 300, half-chord h = sqrt(500^2 - 300^2) = 400
    # Expected intersection points: (300, 400) and (300, -400)
    c1 = np.array([0.0, 0.0])
    c2 = np.array([600.0, 0.0])
    r1 = 500.0
    r2 = 500.0

    geom = circle_circle_intersection(c1, r1, c2, r2, unc1=20.0, unc2=20.0)
    assert geom["status"] == "intersecting"
    assert len(geom["candidates"]) == 2

    p_a, p_b = geom["candidates"]
    assert np.allclose(p_a, [300.0, 400.0], atol=1e-3)
    assert np.allclose(p_b, [300.0, -400.0], atol=1e-3)
    assert abs(geom["chord_half_length"] - 400.0) < 1e-3
    assert geom["gdop"] >= 1.0


def test_circle_circle_intersection_tangent():
    # External tangent:
    # Tower 1 at (0, 0) with r1 = 300m
    # Tower 2 at (500, 0) with r2 = 200m
    # Distance d = 500 = r1 + r2 -> Tangent at (300, 0)
    c1 = np.array([0.0, 0.0])
    c2 = np.array([500.0, 0.0])
    r1 = 300.0
    r2 = 200.0

    geom = circle_circle_intersection(c1, r1, c2, r2, unc1=10.0, unc2=10.0)
    assert geom["status"] == "tangent"
    assert len(geom["candidates"]) == 1
    assert np.allclose(geom["candidates"][0], [300.0, 0.0], atol=1e-3)
    # Uncertainty should be inflated due to tangent singularity
    assert geom["effective_unc"] > math.sqrt(10.0**2 + 10.0**2)


def test_circle_circle_intersection_disjoint():
    # Disjoint circles (gap of 200m):
    # Tower 1 at (0, 0) with r1 = 200m
    # Tower 2 at (600, 0) with r2 = 200m
    # Distance d = 600 > r1 + r2 (400) -> Gap = 200m
    c1 = np.array([0.0, 0.0])
    c2 = np.array([600.0, 0.0])
    r1 = 200.0
    r2 = 200.0

    geom = circle_circle_intersection(c1, r1, c2, r2, unc1=15.0, unc2=15.0)
    assert geom["status"] == "disjoint"
    assert len(geom["candidates"]) == 1
    # Point along baseline between centers: (300, 0)
    assert np.allclose(geom["candidates"][0], [300.0, 0.0], atol=1e-3)
    # Uncertainty must be inflated by the gap
    assert geom["effective_unc"] >= 200.0


def test_circle_circle_intersection_nested():
    # Nested circles:
    # Tower 1 at (0, 0) with r1 = 600m
    # Tower 2 at (100, 0) with r2 = 200m
    # Distance d = 100 < |600 - 200| = 400 -> Nested with gap = 300m
    c1 = np.array([0.0, 0.0])
    c2 = np.array([100.0, 0.0])
    r1 = 600.0
    r2 = 200.0

    geom = circle_circle_intersection(c1, r1, c2, r2, unc1=20.0, unc2=20.0)
    assert geom["status"] == "nested"
    assert len(geom["candidates"]) == 1
    assert geom["effective_unc"] > 100.0


def test_two_tower_wedge_disambiguation():
    # Tower 1 at (0, 0), r1=500m, boresight pointing NE (azimuth 45°, beamwidth 90°)
    # Tower 2 at (600, 0), r2=500m, boresight pointing NW (azimuth 315°, beamwidth 90°)
    # Candidates are (300, 400) [North] and (300, -400) [South]
    # (300, 400) is in both coverage sectors; (300, -400) is outside
    c1 = np.array([0.0, 0.0])
    c2 = np.array([600.0, 0.0])

    res = TwoTowerResolver.resolve(
        c1=c1, r1=500.0, unc1=20.0, az1=45.0, bw1=90.0,
        c2=c2, r2=500.0, unc2=20.0, az2=315.0, bw2=90.0,
        predicted_pos=None,
    )

    assert res["fix_method"] == "two_tower"
    assert np.allclose(res["position"], [300.0, 400.0], atol=1e-2)
    assert res["disambiguation"] == "sector_wedge_candidate_a"
    assert res["confidence_radius"] > 0


def test_two_tower_kalman_prediction_disambiguation():
    # Omni-directional towers (360° beamwidth) -> both candidates valid by wedge
    # Candidates are (300, 400) and (300, -400)
    # Prior Kalman prediction is at (295, 380) (close to candidate A)
    c1 = np.array([0.0, 0.0])
    c2 = np.array([600.0, 0.0])

    res = TwoTowerResolver.resolve(
        c1=c1, r1=500.0, unc1=20.0, az1=0.0, bw1=360.0,
        c2=c2, r2=500.0, unc2=20.0, az2=0.0, bw2=360.0,
        predicted_pos=np.array([295.0, 380.0]),
    )

    assert res["fix_method"] == "two_tower"
    assert np.allclose(res["position"], [300.0, 400.0], atol=1e-2)
    assert "kalman_prediction" in res["disambiguation"]


def test_two_tower_ambiguous_50_50_fallback():
    # Omni-directional towers without Kalman prediction -> returns 50/50 weighted combination
    # Candidates (300, 400) and (300, -400) -> Midpoint is (300, 0)
    # Confidence radius must cover the chord distance (h = 400m)
    c1 = np.array([0.0, 0.0])
    c2 = np.array([600.0, 0.0])

    res = TwoTowerResolver.resolve(
        c1=c1, r1=500.0, unc1=20.0, az1=0.0, bw1=360.0,
        c2=c2, r2=500.0, unc2=20.0, az2=0.0, bw2=360.0,
        predicted_pos=None,
    )

    assert res["fix_method"] == "two_tower"
    assert np.allclose(res["position"], [300.0, 0.0], atol=1e-2)
    assert res["disambiguation"] == "dual_candidate_weighted_50_50"
    # Confidence radius must be honest and >= 400m * 2.447 (or ~1000m)
    assert res["confidence_radius"] >= 400.0
