"""Reverse geocoder service via OSM Nominatim with grid cache."""

import time

import httpx

NOMINATIM_URL = "https://nominatim.openstreetmap.org/reverse"
USER_AGENT = "E-Rakshak/1.0 (hackathon)"
_GRID_DEG = 0.0004
_MIN_INTERVAL = 1.0

_cache: dict[tuple[float, float], str] = {}
_last_call = 0.0

_http_get = httpx.get  # seam for tests


def _grid_key(lat: float, lon: float) -> tuple[float, float]:
    return (round(lat / _GRID_DEG) * _GRID_DEG, round(lon / _GRID_DEG) * _GRID_DEG)


def _label_from_address(data: dict) -> str:
    addr = data.get("address") or {}
    for key in ("road", "pedestrian", "suburb", "neighbourhood", "hamlet", "village", "town", "city"):
        if addr.get(key):
            return str(addr[key])
    name = data.get("display_name") or ""
    return name.split(",")[0].strip() if name else "Unknown area"


def reverse_geocode(lat: float, lon: float) -> str:
    global _last_call
    key = _grid_key(lat, lon)
    cached = _cache.get(key)
    if cached:
        return cached

    label = "Unknown area"
    try:
        elapsed = time.monotonic() - _last_call
        if elapsed < _MIN_INTERVAL:
            time.sleep(_MIN_INTERVAL - elapsed)
        resp = _http_get(
            NOMINATIM_URL,
            params={"format": "jsonv2", "lat": lat, "lon": lon, "zoom": 16},
            headers={"User-Agent": USER_AGENT},
            timeout=5.0,
        )
        _last_call = time.monotonic()
        if resp.status_code == 200:
            label = _label_from_address(resp.json())
    except Exception:
        pass

    _cache[key] = label
    return label


def attach_geocodes(geojson: dict) -> dict:
    """Sets properties.geocode on every Point feature of a GeoJSON FeatureCollection."""
    for feature in geojson.get("features", []):
        if feature.get("geometry", {}).get("type") == "Point":
            lon, lat = feature["geometry"]["coordinates"]
            feature["properties"]["geocode"] = reverse_geocode(lat, lon)
    return geojson


def clear_cache() -> None:
    _cache.clear()
