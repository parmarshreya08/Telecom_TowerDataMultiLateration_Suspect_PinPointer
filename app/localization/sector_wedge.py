"""
Sector wedge model for tower antenna coverage.
Generates shapely polygons representing the angular sector each tower covers,
used for initial position estimation and NLOS validation.

Azimuth convention: 0° = North, 90° = East, clockwise.
Beamwidth: angular width of the antenna sector (e.g., 60°).
"""

import math
from typing import Optional

import numpy as np
from shapely.geometry import Point, Polygon


def make_sector_polygon(
    center_x: float,
    center_y: float,
    radius: float,
    azimuth_deg: float,
    beamwidth_deg: float,
    num_arc_points: int = 36,
) -> Polygon:
    """
    Creates a sector (pie-slice) polygon in UTM coordinates.
    """
    half_bw = beamwidth_deg / 2.0
    # Convert azimuth (0=N, CW) to math angle (0=E, CCW)
    math_start = math.radians(90.0 - (azimuth_deg + half_bw))
    math_end = math.radians(90.0 - (azimuth_deg - half_bw))

    angles = np.linspace(math_start, math_end, num_arc_points)
    arc = [
        (center_x + radius * math.cos(a), center_y + radius * math.sin(a))
        for a in angles
    ]

    return Polygon([(center_x, center_y)] + arc + [(center_x, center_y)])


def intersect_sectors(polygons: list[Polygon]) -> Optional[Polygon]:
    """
    Computes the intersection of multiple sector polygons.
    Returns None if no common region exists.
    """
    if not polygons:
        return None
    result = polygons[0]
    for p in polygons[1:]:
        result = result.intersection(p)
        if result.is_empty:
            return None
    return result


def centroid_of_intersection(polygons: list[Polygon]) -> Optional[tuple[float, float]]:
    """
    Returns the centroid (x, y) of the intersection of sector polygons,
    or None if no intersection exists.
    """
    region = intersect_sectors(polygons)
    if region is None:
        return None
    c = region.centroid
    return (c.x, c.y)


def point_in_sector(
    px: float,
    py: float,
    center_x: float,
    center_y: float,
    radius: float,
    azimuth_deg: float,
    beamwidth_deg: float,
) -> bool:
    """
    Checks if a point falls within a tower's sector wedge.
    """
    dx = px - center_x
    dy = py - center_y
    dist = math.sqrt(dx * dx + dy * dy)
    if dist > radius:
        return False

    point_math = math.degrees(math.atan2(dy, dx))
    point_az = (90.0 - point_math) % 360.0
    az = azimuth_deg % 360.0
    half_bw = beamwidth_deg / 2.0

    diff = (point_az - az + 180.0) % 360.0 - 180.0
    return abs(diff) <= half_bw


if __name__ == "__main__":
    # Self-test: 3 towers, all sectors pointing toward center at (50, 50)
    # Tower at (-50, -50) pointing NE (az=45), bw=120 (wide)
    # Tower at (150, -50) pointing NW (az=135), bw=120
    # Tower at (50, 150) pointing S (az=180), bw=120
    towers = [
        (-50.0, -50.0, 150.0, 45.0, 120.0),   # NE toward center
        (150.0, -50.0, 150.0, 315.0, 120.0),  # NW toward center
        (50.0, 150.0, 150.0, 180.0, 120.0),   # S toward center
    ]
    polys = [make_sector_polygon(tx, ty, r, az, bw) for tx, ty, r, az, bw in towers]
    region = intersect_sectors(polys)
    assert region is not None, "sectors should intersect"
    assert not region.is_empty

    c = centroid_of_intersection(polys)
    assert c is not None
    err = math.sqrt((c[0] - 50) ** 2 + (c[1] - 50) ** 2)
    assert err < 40.0, f"centroid too far: {err:.1f}m"

    assert point_in_sector(50, 50, -50, -50, 150, 45, 120)
    assert not point_in_sector(-50, -50, 50, 50, 150, 45, 120)

    print(f"sector_wedge.py self-test OK (centroid=({c[0]:.1f}, {c[1]:.1f}), err={err:.1f}m)")
