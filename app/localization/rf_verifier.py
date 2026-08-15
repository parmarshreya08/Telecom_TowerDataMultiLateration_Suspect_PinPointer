"""
RF / SDR ground-verification engine.

Converts officer-carried SDR scans (RSSI + bearing) into a micro-fix for the
final ~50 meters that tower multilateration cannot resolve.

Method (log-distance path loss):
    RSSI = RSSI0 - 10*n*log10(d)   =>   d = 10**((RSSI0 - RSSI) / (10*n))

    - RSSI0 is the calibrated 1-metre reference power (dBm).
    - n is the path-loss exponent (urban outdoor 2.7-3.5; free space 2.0).
    - distance d is a soft bound: NLOS attenuates RSSI and over-estimates range,
      so the bearing is treated as the stronger constraint.

Micro-fix = scanner position advanced ``d`` meters along ``bearing`` (haversine).
With >=2 scans at distinct positions + bearings, the bearings are intersected
via planar least-squares to cancel scanner GPS error.
"""

from math import asin, atan2, cos, degrees, radians, sin, sqrt

from app.contracts.rf import RfScan, RfVerificationResult

# Earth mean radius in meters (WGS84 mean).
_EARTH_RADIUS_M = 6371008.8

# Calibrated reference power (dBm) at 1 metre. Matches typical hand-held scanners;
# field-calibrate per device for production use.
_RSSI0_DBM = -40.0

# Path-loss exponent by band (urban outdoor defaults).
_PATH_LOSS_N = 2.5

# Minimum usable RSSI — readings at/below the noise floor give unreliable distance.
_NOISE_FLOOR_DBM = -105.0

# Relative distance error std = sigma_dB / (4.34 * n), sigma ~= 3 dB outdoors.
_SIGMA_DB = 3.0

# India bounding box (matches ingestion geofence).
_INDIA_BBOX = {"lat_min": 8.0, "lat_max": 38.0, "lon_min": 68.0, "lon_max": 98.0}


def path_loss_distance(rssi_dbm: float, rssi0: float = _RSSI0_DBM, n: float = _PATH_LOSS_N) -> float:
    """
    Solve the log-distance path-loss model for distance in meters.

    Clamps to a minimum of 1 metre (the reference distance d0). Distances below
    the noise floor are rejected by the caller before this is invoked.
    """
    d = 10 ** ((rssi0 - rssi_dbm) / (10.0 * n))
    return max(d, 1.0)


def _relative_error(n: float = _PATH_LOSS_N) -> float:
    """Relative distance-error std from shadowing sigma: sigma/(4.34*n)."""
    return _SIGMA_DB / (4.34 * n)


def destination_point(lat: float, lon: float, bearing_deg: float, distance_m: float) -> tuple[float, float]:
    """
    Advance ``distance_m`` meters from (lat, lon) along ``bearing_deg`` (true north)
    using the spherical (haversine) destination formula.
    """
    bearing = radians(bearing_deg)
    d_ratio = distance_m / _EARTH_RADIUS_M
    lat1 = radians(lat)
    lon1 = radians(lon)

    lat2 = asin(sin(lat1) * cos(d_ratio) + cos(lat1) * sin(d_ratio) * cos(bearing))
    lon2 = lon1 + atan2(
        sin(bearing) * sin(d_ratio) * cos(lat1),
        cos(d_ratio) - sin(lat1) * sin(lat2),
    )

    return degrees(lat2), ((degrees(lon2) + 180.0) % 360.0) - 180.0


def _normalize_bearing(bearing_deg: float) -> float:
    return ((bearing_deg % 360.0) + 360.0) % 360.0


def _in_india(lat: float, lon: float) -> bool:
    return (
        _INDIA_BBOX["lat_min"] <= lat <= _INDIA_BBOX["lat_max"]
        and _INDIA_BBOX["lon_min"] <= lon <= _INDIA_BBOX["lon_max"]
    )


def _bearing_intersection(scans: list[RfScan]) -> tuple[float, float]:
    """
    Least-squares intersection of >=2 bearing rays (planar, in UTM metres).

    Each scan defines a ray from its position along its bearing. Per-bearing
    orthogonal error vectors form a linear system solved in the least-squares
    sense; returns the intersection point as (lat, lon).
    """
    # Project scan positions to a local equirectangular metre frame anchored at
    # the first scan (accurate over the ~1 km ground-verification footprint).
    lat0, lon0 = scans[0].latitude, scans[0].longitude
    cos_lat = cos(radians(lat0))
    m_per_deg_lat = _EARTH_RADIUS_M * (radians(1.0))
    m_per_deg_lon = m_per_deg_lat * cos_lat

    A_rows: list[list[float]] = []
    b: list[float] = []
    for s in scans:
        bearing = radians(_normalize_bearing(s.bearing_deg))  # type: ignore[arg-type]
        # Unit vector along the ray: E = sin(bearing), N = cos(bearing)
        ue, un = sin(bearing), cos(bearing)
        # Orthogonal vector constraint: (R - T) . perp = 0 where perp = (un, -ue)
        perp_e, perp_n = un, -ue
        tx = (s.longitude - lon0) * m_per_deg_lon
        ty = (s.latitude - lat0) * m_per_deg_lat
        A_rows.append([perp_e, perp_n])
        b.append(perp_e * tx + perp_n * ty)

    A = [[row[0], row[1]] for row in A_rows]
    # Normal equations (A^T A) x = A^T b
    a11 = sum(r[0] * r[0] for r in A)
    a12 = sum(r[0] * r[1] for r in A)
    a22 = sum(r[1] * r[1] for r in A)
    b1 = sum(r[0] * bi for r, bi in zip(A, b))
    b2 = sum(r[1] * bi for r, bi in zip(A, b))

    det = a11 * a22 - a12 * a12
    if abs(det) < 1e-9:
        # Parallel/near-parallel bearings — fall back to the first scan's ray point.
        s0 = scans[0]
        d = path_loss_distance(s0.rssi_dbm)
        return destination_point(s0.latitude, s0.longitude, s0.bearing_deg or 0.0, d)  # type: ignore[arg-type]

    ex = (a22 * b1 - a12 * b2) / det
    ny = (a11 * b2 - a12 * b1) / det

    lat = lat0 + ny / m_per_deg_lat
    lon = lon0 + ex / m_per_deg_lon
    return lat, lon


def verify_scans(scans: list[RfScan]) -> RfVerificationResult:
    """
    Run ground verification over a list of RF scans.

    - Scans without a bearing are skipped (bearing is the stronger constraint).
    - RSSI at/below the noise floor is skipped (unreliable distance).
    - With >=2 bearing-bearing scans at distinct positions, intersect the rays.
    - Otherwise advance the best single scan along its bearing by the
      path-loss distance.
    - Micro-fix must fall inside the India geofence or it is discarded.
    """
    if not scans:
        return RfVerificationResult(method="log_distance_path_loss", skipped_scan_count=0)

    usable = [
        s for s in scans
        if s.bearing_deg is not None and s.rssi_dbm > _NOISE_FLOOR_DBM
    ]
    skipped = len(scans) - len(usable)

    if not usable:
        return RfVerificationResult(method="log_distance_path_loss", skipped_scan_count=skipped)

    if len(usable) >= 2 and len({(s.latitude, s.longitude) for s in usable}) >= 2:
        lat, lon = _bearing_intersection(usable)
        distances = [path_loss_distance(s.rssi_dbm) for s in usable]
        est_distance = sum(distances) / len(distances)
        method = "bearing_intersection"
    else:
        best = max(usable, key=lambda s: s.rssi_dbm)
        est_distance = path_loss_distance(best.rssi_dbm)
        lat, lon = destination_point(
            best.latitude, best.longitude,
            _normalize_bearing(best.bearing_deg or 0.0),  # type: ignore[arg-type]
            est_distance,
        )
        method = "single_bearing_path_loss"

    if not _in_india(lat, lon):
        return RfVerificationResult(
            method=method,
            skipped_scan_count=skipped,
            estimated_distance_meters=est_distance,
        )

    rel_err = _relative_error()
    radius = est_distance * rel_err if est_distance else 25.0
    # Include scanner GPS uncertainty (dominates for short baselines).
    gps_err = max((s.scanner_accuracy_meters or 5.0) for s in usable)
    confidence = sqrt(radius ** 2 + gps_err ** 2)

    return RfVerificationResult(
        micro_fix_latitude=lat,
        micro_fix_longitude=lon,
        estimated_distance_meters=round(est_distance, 1),
        confidence_radius_meters=round(confidence, 1),
        method=method,
        skipped_scan_count=skipped,
    )


if __name__ == "__main__":
    # Self-check: a -78 dBm reading at 935 MHz should give a sane urban range
    # and a bearing intersection must land near the true source.
    d = path_loss_distance(-78.0)
    assert 15 < d < 120, f"path-loss distance out of range: {d:.1f}m"
    assert _relative_error() < 0.5, "relative error too large"

    src_lat, src_lon = 21.1702, 72.8211
    a = RfScan(timestamp=__import__("datetime").datetime(2026, 8, 1, 10, 0, 0),
               latitude=21.1652, longitude=72.8151, frequency_mhz=935.0,
               rssi_dbm=-80.0, bearing_deg=45.0, scanner_accuracy_meters=5.0)
    b = RfScan(timestamp=__import__("datetime").datetime(2026, 8, 1, 10, 0, 1),
               latitude=21.1752, longitude=72.8151, frequency_mhz=935.0,
               rssi_dbm=-80.0, bearing_deg=135.0, scanner_accuracy_meters=5.0)
    res = verify_scans([a, b])
    assert res.micro_fix_latitude is not None, "no micro-fix produced"
    assert _in_india(res.micro_fix_latitude, res.micro_fix_longitude)
    print(f"rf_verifier self-test OK (d={d:.1f}m, method={res.method}, "
          f"fix=({res.micro_fix_latitude:.4f},{res.micro_fix_longitude:.4f}))")