"""
Two-Tower Analytical Circle-Circle Intersection Resolver.
Resolves suspect position from 2 cell tower ranges (Timing Advance / RTT / Pseudorange),
disambiguates candidate solutions using sector azimuth/beamwidth wedges and Kalman predictions,
and computes honest geometric uncertainty inflation.

Fix Method: "two_tower"
"""

import math
from typing import Any, Optional

import numpy as np

from app.localization.sector_wedge import point_in_sector


def circle_circle_intersection(
    c1: np.ndarray,
    r1: float,
    c2: np.ndarray,
    r2: float,
    unc1: float = 20.0,
    unc2: float = 20.0,
) -> dict[str, Any]:
    """
    Computes analytical circle-circle intersection in 2D metric (UTM) coordinates.

    Handles:
    - Coincident / concentric centers
    - Disjoint circles (gap > 0 -> take point on baseline scaled by range ratio, inflate uncertainty)
    - Nested circles (one inside another -> take point along radial line, inflate uncertainty)
    - Tangent circles (1 point -> inflate uncertainty due to poor geometry)
    - Standard intersecting circles (up to 2 candidates, compute intersection angle and GDOP)

    :param c1: [x, y] coordinates of tower 1 in meters.
    :param r1: Estimated range from tower 1 in meters.
    :param c2: [x, y] coordinates of tower 2 in meters.
    :param r2: Estimated range from tower 2 in meters.
    :param unc1: 1-sigma range measurement uncertainty for tower 1.
    :param unc2: 1-sigma range measurement uncertainty for tower 2.
    :return: dict with candidate points, effective uncertainty, gdop, intersection angle, and geometry status.
    """
    c1 = np.asarray(c1, dtype=np.float64)
    c2 = np.asarray(c2, dtype=np.float64)
    r1 = max(float(r1), 5.0)
    r2 = max(float(r2), 5.0)
    unc1 = max(float(unc1), 1.0)
    unc2 = max(float(unc2), 1.0)

    diff = c2 - c1
    d = float(np.linalg.norm(diff))
    base_unc = float(math.sqrt(unc1 ** 2 + unc2 ** 2))

    # Case 1: Coincident / concentric centers
    if d < 1e-4:
        return {
            "status": "concentric",
            "candidates": [c1.copy()],
            "effective_unc": base_unc + max(r1, r2),
            "gdop": 20.0,
            "intersection_angle_deg": 0.0,
            "chord_half_length": 0.0,
        }

    u = diff / d  # unit vector from c1 to c2
    v = np.array([-u[1], u[0]], dtype=np.float64)  # perpendicular unit vector

    # Case 2: Disjoint circles (no intersection, too far apart)
    if d > (r1 + r2):
        gap = d - (r1 + r2)
        # Proportional point along baseline scaled by range ratio
        ratio = r1 / (r1 + r2)
        p = c1 + (r1 + gap * ratio) * u
        # Inflate uncertainty by the non-intersection gap (capped to avoid 100km conf).
        effective_unc = min(base_unc + gap, 5000.0)
        gdop = max(3.0, 1.0 + (gap / 100.0))
        return {
            "status": "disjoint",
            "candidates": [p],
            "effective_unc": effective_unc,
            "gdop": gdop,
            "intersection_angle_deg": 0.0,
            "chord_half_length": 0.0,
        }

    # Case 3: Nested circles (one circle entirely inside the other)
    if d < abs(r1 - r2):
        gap = abs(r1 - r2) - d
        if r1 > r2:
            p = c1 + (r1 - gap / 2.0) * u
        else:
            p = c2 - (r2 - gap / 2.0) * u
        effective_unc = min(base_unc + gap, 5000.0)
        gdop = max(3.0, 1.0 + (gap / 100.0))
        return {
            "status": "nested",
            "candidates": [p],
            "effective_unc": effective_unc,
            "gdop": gdop,
            "intersection_angle_deg": 0.0,
            "chord_half_length": 0.0,
        }

    # Case 4 & 5: Intersecting or Tangent circles
    a = (r1 ** 2 - r2 ** 2 + d ** 2) / (2.0 * d)
    h_sq = r1 ** 2 - a ** 2

    # Tangent threshold
    if h_sq <= 1e-4:
        p = c1 + a * u
        effective_unc = base_unc * 2.5
        return {
            "status": "tangent",
            "candidates": [p],
            "effective_unc": effective_unc,
            "gdop": 6.0,
            "intersection_angle_deg": 0.0,
            "chord_half_length": 0.0,
        }

    h = math.sqrt(h_sq)
    p0 = c1 + a * u
    p_a = p0 + h * v
    p_b = p0 - h * v

    # Intersection angle theta between radial lines from circle centers
    cos_theta = (r1 ** 2 + r2 ** 2 - d ** 2) / (2.0 * r1 * r2)
    cos_theta = max(-1.0, min(1.0, cos_theta))
    theta_rad = math.acos(cos_theta)
    theta_deg = math.degrees(theta_rad)
    sin_theta = math.sin(theta_rad)

    # Poor geometry when circles are nearly tangent -> inflate uncertainty via GDOP
    # Ideal orthogonal intersection has sin(90°) = 1.0 -> gdop_geom = 1.0
    gdop_geom = 1.0 / max(sin_theta, 0.15)
    effective_unc = base_unc * gdop_geom

    return {
        "status": "intersecting",
        "candidates": [p_a, p_b],
        "effective_unc": effective_unc,
        "gdop": max(1.5, gdop_geom),
        "intersection_angle_deg": theta_deg,
        "chord_half_length": h,
    }


class TwoTowerResolver:
    """
    Two-tower position solver with wedge disambiguation and Kalman prior fallback.
    """

    @staticmethod
    def resolve(
        c1: np.ndarray,
        r1: float,
        unc1: float,
        az1: Optional[float],
        bw1: Optional[float],
        c2: np.ndarray,
        r2: float,
        unc2: float,
        az2: Optional[float],
        bw2: Optional[float],
        predicted_pos: Optional[np.ndarray] = None,
    ) -> dict[str, Any]:
        """
        Solves 2-tower location with sector-wedge disambiguation and honest uncertainty.

        :param c1: [x, y] UTM position of tower 1.
        :param r1: Measured range to tower 1 (meters).
        :param unc1: 1-sigma uncertainty of range 1 (meters).
        :param az1: Sector azimuth of tower 1 (degrees).
        :param bw1: Sector beamwidth of tower 1 (degrees).
        :param c2: [x, y] UTM position of tower 2.
        :param r2: Measured range to tower 2 (meters).
        :param unc2: 1-sigma uncertainty of range 2 (meters).
        :param az2: Sector azimuth of tower 2 (degrees).
        :param bw2: Sector beamwidth of tower 2 (degrees).
        :param predicted_pos: [x, y] prior position estimate from Kalman filter prediction.
        :return: Solver result dict.
        """
        geom = circle_circle_intersection(c1, r1, c2, r2, unc1=unc1, unc2=unc2)
        candidates = geom["candidates"]
        effective_unc = geom["effective_unc"]
        gdop = geom["gdop"]

        # Default fallback values for azimuth / beamwidth if not provided
        az1_val = az1 if az1 is not None else 0.0
        bw1_val = bw1 if bw1 is not None else 360.0
        az2_val = az2 if az2 is not None else 0.0
        bw2_val = bw2 if bw2 is not None else 360.0

        if len(candidates) == 1:
            pos = candidates[0]
            # 95% confidence radius = ~2.447 * 1-sigma
            conf_radius = max(effective_unc * 2.447, 40.0)
            cov = np.eye(2, dtype=np.float64) * ((conf_radius / 2.447) ** 2)
            return {
                "position": pos,
                "confidence_radius": conf_radius,
                "gdop": gdop,
                "residual_rms": effective_unc * 0.5,
                "fix_method": "two_tower",
                "disambiguation": geom["status"],
                "candidates": [c.tolist() for c in candidates],
                "covariance": cov,
                "uncertainties": [unc1, unc2],
            }

        # 2 Candidates: Disambiguate using sector wedges
        p_a, p_b = candidates[0], candidates[1]

        # Margin on radius check to avoid edge clipping (1.5x range)
        in_t1_a = point_in_sector(p_a[0], p_a[1], c1[0], c1[1], r1 * 1.5, az1_val, bw1_val)
        in_t2_a = point_in_sector(p_a[0], p_a[1], c2[0], c2[1], r2 * 1.5, az2_val, bw2_val)
        valid_a = in_t1_a and in_t2_a

        in_t1_b = point_in_sector(p_b[0], p_b[1], c1[0], c1[1], r1 * 1.5, az1_val, bw1_val)
        in_t2_b = point_in_sector(p_b[0], p_b[1], c2[0], c2[1], r2 * 1.5, az2_val, bw2_val)
        valid_b = in_t1_b and in_t2_b

        chosen_pos: np.ndarray
        disambiguation_method: str
        extra_spread_m = 0.0

        if valid_a and not valid_b:
            chosen_pos = p_a
            disambiguation_method = "sector_wedge_candidate_a"
        elif valid_b and not valid_a:
            chosen_pos = p_b
            disambiguation_method = "sector_wedge_candidate_b"
        else:
            # Both or neither valid: fallback to Kalman predicted position if available
            if predicted_pos is not None:
                pred = np.asarray(predicted_pos, dtype=np.float64).flatten()[:2]
                dist_a = float(np.linalg.norm(p_a - pred))
                dist_b = float(np.linalg.norm(p_b - pred))
                if abs(dist_a - dist_b) > 5.0:
                    if dist_a < dist_b:
                        chosen_pos = p_a
                        disambiguation_method = "kalman_prediction_candidate_a"
                    else:
                        chosen_pos = p_b
                        disambiguation_method = "kalman_prediction_candidate_b"
                else:
                    # Equidistant from prediction: 50/50 weighted combination
                    chosen_pos = 0.5 * p_a + 0.5 * p_b
                    disambiguation_method = "dual_candidate_weighted_50_50"
                    extra_spread_m = geom["chord_half_length"]
            else:
                # No Kalman prediction: 50/50 weighted combination
                chosen_pos = 0.5 * p_a + 0.5 * p_b
                disambiguation_method = "dual_candidate_weighted_50_50"
                extra_spread_m = geom["chord_half_length"]

        # Combined 1-sigma uncertainty includes spatial separation if returning 50/50
        sigma_total = math.sqrt(effective_unc ** 2 + extra_spread_m ** 2)
        conf_radius = max(sigma_total * 2.447, 50.0)
        cov = np.eye(2, dtype=np.float64) * ((conf_radius / 2.447) ** 2)

        return {
            "position": chosen_pos,
            "confidence_radius": conf_radius,
            "gdop": gdop,
            "residual_rms": effective_unc * 0.5,
            "fix_method": "two_tower",
            "disambiguation": disambiguation_method,
            "candidates": [p_a.tolist(), p_b.tolist()],
            "covariance": cov,
            "uncertainties": [unc1, unc2],
        }
