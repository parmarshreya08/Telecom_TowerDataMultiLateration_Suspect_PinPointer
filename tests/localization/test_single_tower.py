"""
Unit tests for Single-Tower sector probability region resolver.
Tests annular wedge polygon construction, centroid estimation, 95% confidence radius,
and uniform sample points for heatmap integration.
"""

import math
import numpy as np
import pytest
from shapely.geometry import Point

from app.localization.single_tower import (
    SingleTowerResolver,
    make_annular_sector_polygon,
    sample_annular_sector_points,
    compute_annular_confidence_radius,
)


def test_single_tower_annular_wedge_polygon_geometry():
    # Tower at (1000, 1000), TA=4 (r_in = 3.5*78.12 = 273.42, r_out = 4.5*78.12 = 351.54)
    # Azimuth = 90° (East), Beamwidth = 60° (span: 60° to 120° in azimuth / -30° to +30° in math angle)
    center_x, center_y = 1000.0, 1000.0
    r_in = 273.42
    r_out = 351.54
    azimuth = 90.0
    beamwidth = 60.0

    poly = make_annular_sector_polygon(center_x, center_y, r_in, r_out, azimuth, beamwidth)
    assert poly.is_valid
    assert not poly.is_empty
    assert poly.area > 0

    # Boresight point at midpoint radius: (1000 + 312.48, 1000)
    mid_r = (r_in + r_out) / 2.0
    inside_point = Point(center_x + mid_r, center_y)
    assert poly.contains(inside_point)

    # Point to the West (opposite direction) must not be contained
    outside_point = Point(center_x - mid_r, center_y)
    assert not poly.contains(outside_point)


def test_single_tower_with_ta_step_resolution():
    center_x, center_y = 5000.0, 5000.0
    res = SingleTowerResolver.resolve(
        center_x=center_x,
        center_y=center_y,
        timing_advance=4,
        azimuth_deg=90.0,  # East
        beamwidth_deg=60.0,
    )

    assert res["fix_method"] == "single_sector"
    assert res["ta_inner_m"] is not None
    assert res["ta_outer_m"] is not None

    # Centroid should be east of tower: x > center_x and y ≈ center_y
    pos = res["position"]
    assert pos[0] > center_x + 250.0
    assert abs(pos[1] - center_y) < 5.0

    # 95% Confidence radius should be non-zero and honest
    assert res["confidence_radius"] > 50.0
    assert res["covariance"] is not None


def test_single_tower_without_ta_full_coverage_wedge():
    center_x, center_y = 2000.0, 2000.0
    res = SingleTowerResolver.resolve(
        center_x=center_x,
        center_y=center_y,
        timing_advance=None,
        azimuth_deg=0.0,  # North
        beamwidth_deg=65.0,
        max_range_meters=1500.0,
    )

    assert res["fix_method"] == "single_sector"
    assert res["ta_inner_m"] is None

    # Centroid should be north of tower: y > center_y and x ≈ center_x
    pos = res["position"]
    assert pos[1] > center_y + 500.0
    assert abs(pos[0] - center_x) < 5.0

    # Coarse 95% radius for full sector is large (> 500m)
    assert res["confidence_radius"] > 500.0


def test_single_tower_uniform_sampling_inside_polygon():
    center_x, center_y = 0.0, 0.0
    r_in = 100.0
    r_out = 500.0
    azimuth = 45.0
    beamwidth = 90.0

    poly = make_annular_sector_polygon(center_x, center_y, r_in, r_out, azimuth, beamwidth)
    samples = sample_annular_sector_points(
        center_x, center_y, r_in, r_out, azimuth, beamwidth, num_samples=50, seed=42
    )

    assert len(samples) == 50
    # Almost all sampled points should lie within the polygon buffer
    contained = sum(1 for p in samples if poly.buffer(1.0).contains(Point(p[0], p[1])))
    assert contained >= 48, f"Only {contained}/50 samples inside polygon"
