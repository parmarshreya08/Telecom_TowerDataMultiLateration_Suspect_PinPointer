"""Heatmap KDE unit tests."""

from types import SimpleNamespace

from app.localization.heatmap import compute_heatmap


def _fix(lat: float, lon: float, conf: float):
    return SimpleNamespace(latitude=lat, longitude=lon, confidence_radius_meters=conf)


def test_empty_fixes_returns_empty_collection():
    out = compute_heatmap([])
    assert out["features"] == []
    assert out["metadata"]["count"] == 0


def test_heatmap_produces_weighted_lattice_points():
    fixes = [_fix(21.1702, 72.8211, 30), _fix(21.1704, 72.8213, 40), _fix(21.1700, 72.8209, 25)]
    out = compute_heatmap(fixes, resolution_m=50)
    assert len(out["features"]) > 0
    weights = [f["properties"]["weight"] for f in out["features"]]
    assert max(weights) <= 1.0
    assert all(w >= 0.0 for w in weights)


def test_tighter_fix_carries_higher_weight_near_peak():
    # Two fixes close together; the low-confidence (tight) one should drive the peak.
    fixes = [_fix(21.1702, 72.8211, 10), _fix(21.1703, 72.8212, 80)]
    out = compute_heatmap(fixes, resolution_m=100)
    peak = max(out["features"], key=lambda f: f["properties"]["weight"])
    # Peak lattice point should lie near the tight fix coordinate.
    near = [peak["geometry"]["coordinates"][1], peak["geometry"]["coordinates"][0]]
    assert abs(near[0] - 21.1702) < 0.002
    assert abs(near[1] - 72.8211) < 0.002


def test_heatmap_one_fix_returns_circular():
    fixes = [_fix(21.1702, 72.8211, 100)]
    out = compute_heatmap(fixes, resolution_m=50)
    assert len(out["features"]) > 0
    weights = [f["properties"]["weight"] for f in out["features"]]
    assert 1.0 in weights
    assert out["metadata"]["fixes"] == 1


def test_heatmap_two_fixes_returns_corridor():
    fixes = [_fix(21.1702, 72.8211, 100), _fix(21.1712, 72.8221, 100)]
    out = compute_heatmap(fixes, resolution_m=50)
    assert len(out["features"]) > 0
    assert out["metadata"]["fixes"] == 2


def test_heatmap_collinear_fixes_fallback():
    fixes = [_fix(21.1700, 72.8200, 100), _fix(21.1701, 72.8201, 100), _fix(21.1702, 72.8202, 100)]
    out = compute_heatmap(fixes, resolution_m=50)
    assert len(out["features"]) > 0
    assert out["metadata"]["fixes"] == 3
    assert out["metadata"].get("fallback") == "multipoint_corridor"