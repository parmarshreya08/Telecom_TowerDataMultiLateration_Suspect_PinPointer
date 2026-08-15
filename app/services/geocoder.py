"""Reverse geocoder service via OSM Nominatim with grid cache and robust fallbacks."""

import time
from typing import Optional

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

    # Extract all relevant landmark details
    landmark = None
    for key in ("amenity", "railway", "shop", "tourism", "historic", "office", "leisure", "building"):
        if addr.get(key):
            landmark = str(addr[key])
            break

    # Extract street level details
    road = addr.get("road") or addr.get("pedestrian") or addr.get("path") or addr.get("street") or addr.get("highway")
    
    # Extract locality hierarchy details
    neighbourhood = addr.get("neighbourhood")
    suburb = addr.get("suburb") or addr.get("village") or addr.get("hamlet") or addr.get("neighbourhood_district")
    city = addr.get("city") or addr.get("town") or addr.get("municipality")
    district = addr.get("district") or addr.get("county")
    state = addr.get("state")
    postcode = addr.get("postcode")

    # Combine parts into a structured descriptive address
    parts = []
    if landmark:
        parts.append(f"Near {landmark}")
    if road:
        parts.append(str(road))
    if neighbourhood:
        parts.append(str(neighbourhood))
    if suburb and suburb != neighbourhood:
        parts.append(str(suburb))
    if city:
        parts.append(str(city))
    if district and district != city:
        parts.append(str(district))
    if state:
        parts.append(str(state))
    if postcode:
        parts.append(str(postcode))

    if parts:
        return ", ".join(parts)

    name = data.get("display_name")
    if name:
        return name.strip()

    return "Unknown area"


def reverse_geocode(lat: float, lon: float, fallback_area: Optional[str] = None) -> str:
    global _last_call
    key = _grid_key(lat, lon)
    cached = _cache.get(key)
    if cached:
        return cached

    # Pre-configure fallback label representing Latitude + Longitude + Area/locality
    if fallback_area:
        label = f"{lat:.6f}, {lon:.6f} ({fallback_area})"
    else:
        label = f"{lat:.6f}, {lon:.6f} (Unknown area)"

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
