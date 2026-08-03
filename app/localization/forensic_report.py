"""
Forensic report generator for E-Rakshak.
Produces structured JSON reports documenting localization analysis
for court-admissible evidence. PDF rendering can be added later.
"""

from datetime import datetime
from typing import Any, Optional
from uuid import UUID

from app.contracts.localization import LocalizationFix


def generate_forensic_report(
    case_id: str,
    fixes: list[LocalizationFix],
    metadata: Optional[dict[str, Any]] = None,
) -> dict[str, Any]:
    """
    Generates a structured forensic report summarizing the localization analysis.
    Returns a JSON-serializable dict suitable for PDF rendering or API response.
    """
    if not fixes:
        return {
            "report_id": f"FR-{case_id}-{datetime.utcnow().strftime('%Y%m%d%H%M%S')}",
            "case_id": case_id,
            "status": "NO_DATA",
            "generated_at": datetime.utcnow().isoformat(),
            "summary": {"fix_count": 0, "message": "No localization fixes available."},
        }

    subscribers: dict[str, list[LocalizationFix]] = {}
    for f in fixes:
        subscribers.setdefault(f.subscriber_identifier, []).append(f)

    subscriber_summaries = []
    for sub_id, sub_fixes in subscribers.items():
        sub_fixes.sort(key=lambda f: f.timestamp)
        lats = [f.latitude for f in sub_fixes]
        lons = [f.longitude for f in sub_fixes]
        confs = [f.confidence_radius_meters for f in sub_fixes]

        subscriber_summaries.append({
            "subscriber_identifier": sub_id,
            "fix_count": len(sub_fixes),
            "first_seen": sub_fixes[0].timestamp.isoformat(),
            "last_seen": sub_fixes[-1].timestamp.isoformat(),
            "centroid": {
                "latitude": sum(lats) / len(lats),
                "longitude": sum(lons) / len(lons),
            },
            "bounds": {
                "min_latitude": min(lats),
                "max_latitude": max(lats),
                "min_longitude": min(lons),
                "max_longitude": max(lons),
            },
            "confidence": {
                "mean_meters": sum(confs) / len(confs),
                "min_meters": min(confs),
                "max_meters": max(confs),
            },
            "fixes": [
                {
                    "timestamp": f.timestamp.isoformat(),
                    "latitude": f.latitude,
                    "longitude": f.longitude,
                    "confidence_radius_meters": f.confidence_radius_meters,
                    "gdop": f.gdop,
                    "residual_rms": f.residual_rms,
                }
                for f in sub_fixes
            ],
        })

    return {
        "report_id": f"FR-{case_id}-{datetime.utcnow().strftime('%Y%m%d%H%M%S')}",
        "case_id": case_id,
        "status": "COMPLETED",
        "generated_at": datetime.utcnow().isoformat(),
        "methodology": {
            "algorithm": "JPL Pseudorange Multi-Lateration + Kalman Tracking",
            "ta_band_model": "LTE Timing Advance quantization (78.12m per step)",
            "sector_wedge_model": "Antenna azimuth/beamwidth sector clipping",
            "confidence_level": 0.95,
        },
        "summary": {
            "fix_count": len(fixes),
            "subscriber_count": len(subscribers),
            "time_span": {
                "earliest": min(f.timestamp for f in fixes).isoformat(),
                "latest": max(f.timestamp for f in fixes).isoformat(),
            },
        },
        "subscribers": subscriber_summaries,
        "metadata": metadata or {},
    }
