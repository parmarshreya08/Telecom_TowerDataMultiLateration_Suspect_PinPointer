"""
Single-Tower Sector Probability Region Resolver.
Constructs an annular sector wedge polygon based on Timing Advance (TA) step
or sector coverage range, computes the exact area centroid as position fix,
calculates 95% area containment confidence radius, and generates uniform sample
points for diffuse probability heatmap integration.

Fix Method: "single_sector"
"""

import math
from typing import Any, Optional

import numpy as np
from shapely.geometry import Point, Polygon

_TA_STEP_METERS = 78.12


def make_annular_sector_polygon(
    center_x: float,
    center_y: float,
    r_in: float,
    r_out: float,
    azimuth_deg: float,
    beamwidth_deg: float,
    num_arc_points: int = 36,
) -> Polygon:
    """
    Creates an annular sector wedge polygon in UTM coordinates.
    When r_in == 0, creates a standard pie-slice sector.
    """
    half_bw = beamwidth_deg / 2.0
    math_start = math.radians(90.0 - (azimuth_deg + half_bw))
    math_end = math.radians(90.0 - (azimuth_deg - half_bw))

    angles = np.linspace(math_start, math_end, num_arc_points)

    # Outer arc
    outer_arc = [
        (center_x + r_out * math.cos(a), center_y + r_out * math.sin(a))
        for a in angles
    ]

    if r_in > 0.0:
        # Inner arc in reverse order
        inner_arc = [
            (center_x + r_in * math.cos(a), center_y + r_in * math.sin(a))
            for a in reversed(angles)
        ]
        coords = outer_arc + inner_arc + [outer_arc[0]]
    else:
        coords = [(center_x, center_y)] + outer_arc + [(center_x, center_y)]

    return Polygon(coords)


def sample_annular_sector_points(
    center_x: float,
    center_y: float,
    r_in: float,
    r_out: float,
    azimuth_deg: float,
    beamwidth_deg: float,
    num_samples: int = 25,
    seed: Optional[int] = 42,
) -> np.ndarray:
    """
    Uniformly samples points across the annular sector area.
    Radial sampling uses r = sqrt(U(r_in^2, r_out^2)) for area uniformity.
    """
    rng = np.random.default_rng(seed)
    half_bw = beamwidth_deg / 2.0
    math_start = math.radians(90.0 - (azimuth_deg + half_bw))
    math_end = math.radians(90.0 - (azimuth_deg - half_bw))

    u_r = rng.uniform(r_in ** 2, r_out ** 2, size=num_samples)
    radii = np.sqrt(u_r)
    angles = rng.uniform(math_start, math_end, size=num_samples)

    xs = center_x + radii * np.cos(angles)
    ys = center_y + radii * np.sin(angles)
    return np.column_stack([xs, ys])


def compute_annular_confidence_radius(
    center_x: float,
    center_y: float,
    centroid_x: float,
    centroid_y: float,
    r_in: float,
    r_out: float,
    azimuth_deg: float,
    beamwidth_deg: float,
    percentile: float = 0.95,
) -> float:
    """
    Computes the distance from the centroid containing 95% of the annular sector area.
    Uses dense numerical grid sampling over the region for high precision.
    """
    # Sample 1000 points uniformly to evaluate distance CDF from centroid
    samples = sample_annular_sector_points(
        center_x, center_y, r_in, r_out, azimuth_deg, beamwidth_deg, num_samples=1000, seed=123
    )
    diffs = samples - np.array([centroid_x, centroid_y])
    distances = np.linalg.norm(diffs, axis=1)
    return float(np.percentile(distances, percentile * 100))


class SingleTowerResolver:
    """
    Resolves single-tower sector probability region, centroid fix, and honest uncertainty.
    """

    @staticmethod
    def resolve(
        center_x: float,
        center_y: float,
        timing_advance: Optional[int] = None,
        pseudorange_meters: Optional[float] = None,
        rtt: Optional[float] = None,
        azimuth_deg: Optional[float] = None,
        beamwidth_deg: Optional[float] = None,
        max_range_meters: float = 1500.0,
        ta_step_meters: float = _TA_STEP_METERS,
    ) -> dict[str, Any]:
        """
        Solves single-tower sector fix with annular wedge polygon and 95% confidence radius.

        :param center_x: Tower UTM X coordinate.
        :param center_y: Tower UTM Y coordinate.
        :param timing_advance: Timing Advance index (if available).
        :param pseudorange_meters: Explicit pseudorange (if available).
        :param rtt: Network Round Trip Time in ms (if available).
        :param azimuth_deg: Antenna sector azimuth in degrees (default 0.0).
        :param beamwidth_deg: Antenna beamwidth in degrees (default 65.0).
        :param max_range_meters: Maximum tower range when no TA is available.
        :param ta_step_meters: Radial step distance per Timing Advance unit.
        :return: Solver result dict.
        """
        azimuth = float(azimuth_deg) if azimuth_deg is not None else 0.0
        beamwidth = float(beamwidth_deg) if beamwidth_deg is not None else 65.0

        # Determine annular bounds
        r_in: float
        r_out: float
        has_ta_band = False

        if timing_advance is not None and timing_advance >= 0:
            ta = float(timing_advance)
            r_in = max(0.0, (ta - 0.5) * ta_step_meters)
            r_out = (ta + 0.5) * ta_step_meters
            has_ta_band = True
        elif pseudorange_meters is not None and pseudorange_meters > 0:
            pr = float(pseudorange_meters)
            half_step = ta_step_meters / 2.0
            r_in = max(0.0, pr - half_step)
            r_out = pr + half_step
            has_ta_band = True
        elif rtt is not None and rtt > 0:
            one_way_m = (float(rtt) * 1000.0) / 2.0
            half_step = ta_step_meters / 2.0
            r_in = max(0.0, one_way_m - half_step)
            r_out = one_way_m + half_step
            has_ta_band = True
        else:
            # Full coverage wedge out to max range
            r_in = 0.0
            r_out = max(max_range_meters, 500.0)

        # Build Polygon & Centroid
        poly = make_annular_sector_polygon(center_x, center_y, r_in, r_out, azimuth, beamwidth)
        centroid = poly.centroid
        centroid_pos = np.array([centroid.x, centroid.y], dtype=np.float64)

        # Compute honest 95% confidence radius
        conf_radius = compute_annular_confidence_radius(
            center_x, center_y, centroid.x, centroid.y, r_in, r_out, azimuth, beamwidth, percentile=0.95
        )
        conf_radius = max(conf_radius, 40.0)

        # Covariance matrix representing the spatial spread
        sigma = conf_radius / 2.447
        cov = np.eye(2, dtype=np.float64) * (sigma ** 2)

        # Generate sample points for diffuse probability heatmap representation
        samples = sample_annular_sector_points(
            center_x, center_y, r_in, r_out, azimuth, beamwidth, num_samples=25
        )

        return {
            "position": centroid_pos,
            "confidence_radius": conf_radius,
            "gdop": 10.0 if has_ta_band else 25.0,  # Coarse geometry indicator
            "residual_rms": (r_out - r_in) / 2.0,
            "fix_method": "single_sector",
            "ta_inner_m": r_in if has_ta_band else None,
            "ta_outer_m": r_out if has_ta_band else None,
            "covariance": cov,
            "polygon": poly,
            "sample_points": samples,
            "uncertainties": [(r_out - r_in) / 2.0],
        }
