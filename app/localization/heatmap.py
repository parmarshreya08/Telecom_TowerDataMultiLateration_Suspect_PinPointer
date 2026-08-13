"""
2D kernel density estimate over cached localization fixes.
Returns a weighted lattice-point GeoJSON that leaflet.heat renders as a
probability heatmap (the PS headline feature: density narrowing to block/street).

Lattice points are the chosen format (§4 of the plan): backend owns the math,
frontend stays thin.
"""

from typing import Any, Optional

import numpy as np
from scipy.stats import gaussian_kde

from app.localization.gis_utils import GISUtils


def _make_kde(pts: np.ndarray, weights: np.ndarray, bandwidth: Optional[float]) -> gaussian_kde:
    if bandwidth is None:
        return gaussian_kde(pts.T, weights=weights)
    return gaussian_kde(pts.T, weights=weights, bw_method=bandwidth)


def compute_heatmap(
    fixes: list[Any],
    resolution_m: int = 50,
    bandwidth: Optional[float] = None,
    buffer_m: int = 150,
) -> dict[str, Any]:
    """
    Builds a FeatureCollection of lattice points, each with a normalized
    intensity weight (0..1), from a KDE over the fixes' UTM coordinates.

    Fixes are weighted by 1 / confidence_radius_meters (tighter fix = hotter).
    """
    if not fixes:
        return {"type": "FeatureCollection", "features": [], "metadata": {"count": 0}}

    pts_raw = [GISUtils.latlon_to_utm(f.latitude, f.longitude) for f in fixes]
    pts = np.array([p[:2] for p in pts_raw], dtype=np.float64)
    zone = pts_raw[0][2]

    weights = np.array([
        1.0 / f.confidence_radius_meters if f.confidence_radius_meters else 1.0
        for f in fixes
    ], dtype=np.float64)

    # KDE accepts either N-dim samples or weighted samples (N, n_pts)
    try:
        kde = _make_kde(pts, weights, bandwidth)
    except np.linalg.LinAlgError:
        # ponytail: <4 fixes form a rank-1 (singular) covariance → add deterministic
        # independent-axis jitter and retry; a static suspect yields a tiny bump anyway.
        idx = np.arange(len(pts))
        pts = pts + np.stack([(idx * 0.5) % 0.5, (idx * 0.7) % 0.5], axis=1)
        kde = _make_kde(pts, weights, bandwidth)

    min_x, min_y = pts.min(axis=0)
    max_x, max_y = pts.max(axis=0)
    pad_x, pad_y = buffer_m, buffer_m

    xs = np.arange(min_x - pad_x, max_x + pad_x + resolution_m, resolution_m)
    ys = np.arange(min_y - pad_y, max_y + pad_y + resolution_m, resolution_m)
    # Snap grid nodes onto sample coordinates so a coarse grid can't miss the peak.
    xs = np.unique(np.concatenate([xs, pts[:, 0]]))
    ys = np.unique(np.concatenate([ys, pts[:, 1]]))
    gx, gy = np.meshgrid(xs, ys)
    grid = np.vstack([gx.ravel(), gy.ravel()])

    density = kde(grid).ravel()
    peak = density.max()
    if peak <= 0:
        return {"type": "FeatureCollection", "features": [], "metadata": {"count": 0}}
    intensity = density / peak

    features = []
    for (x, y, w) in zip(gx.ravel(), gy.ravel(), intensity):
        lat, lon = GISUtils.utm_to_latlon(float(x), float(y), zone)
        features.append({
            "type": "Feature",
            "geometry": {"type": "Point", "coordinates": [round(lon, 6), round(lat, 6)]},
            "properties": {"weight": round(float(w), 4)},
        })

    return {
        "type": "FeatureCollection",
        "features": features,
        "metadata": {
            "count": len(features),
            "fixes": len(fixes),
            "resolution_m": resolution_m,
            "bandwidth": kde.covariance_factor(),
        },
    }
