"""
Generates dummy demo data for E-Rakshak UI testing.
Writes to demo_data/: a multi-operator tower dump and a moving-suspect CDR
journey whose TA rings overlap, so the builder can assemble >=3-tower frames.

Usage: python -m scripts.generate_demo_data
"""

from __future__ import annotations

import csv
import math
import os

OUT_DIR = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "demo_data")
SUSPECT = "919876543210"
OTHER = "919812345670"

# cgi, operator, radio, mcc, mnc, lac, cell_id, lat, lon, az, bw, range, site_address
TOWERS = [
    ("404-20-100-1", "Airtel", "LTE", 404, 20, 100, 1, 21.1702, 72.8211, 0, 60, 1200, "Adajan Surat"),
    ("404-20-100-2", "Airtel", "LTE", 404, 20, 100, 2, 21.1902, 72.8311, 120, 60, 1200, "Vesu Surat"),
    ("404-20-100-3", "Airtel", "LTE", 404, 20, 100, 3, 21.1752, 72.8411, 240, 60, 1200, "Ring Road Surat"),
    ("404-20-100-4", "Airtel", "LTE", 404, 20, 100, 4, 21.1852, 72.8261, 0, 60, 1200, "Athwa Surat"),
    ("404-20-300-1", "Vi", "LTE", 404, 20, 300, 1, 21.1722, 72.8181, 30, 60, 1200, "City Light Surat"),
    ("404-20-300-2", "Vi", "LTE", 404, 20, 300, 2, 21.1882, 72.8351, 150, 60, 1200, "Nanpura Surat"),
    ("404-20-300-3", "Vi", "LTE", 404, 20, 300, 3, 21.1772, 72.8441, 270, 60, 1200, "Katargam Surat"),
    ("404-20-300-4", "Vi", "LTE", 404, 20, 300, 4, 21.1832, 72.8231, 330, 60, 1200, "Piplod Surat"),
    ("404-81-400-1", "BSNL", "LTE", 404, 81, 400, 1, 21.1692, 72.8251, 15, 60, 1200, "Surat Railway Station"),
    ("404-81-400-2", "BSNL", "LTE", 404, 81, 400, 2, 21.1912, 72.8321, 135, 60, 1200, "Dumas Road Surat"),
    ("404-81-400-3", "BSNL", "LTE", 404, 81, 400, 3, 21.1762, 72.8391, 255, 60, 1200, "Varachha Surat"),
    ("404-81-400-4", "BSNL", "LTE", 404, 81, 400, 4, 21.1862, 72.8271, 15, 60, 1200, "Pal Surat"),
    ("405-867-200-1", "Jio", "LTE", 405, 867, 200, 1, 21.1712, 72.8221, 45, 60, 1200, "Althan Surat"),
    ("405-867-200-2", "Jio", "LTE", 405, 867, 200, 2, 21.1892, 72.8341, 165, 60, 1200, "Bhatar Road Surat"),
    ("405-867-200-3", "Jio", "LTE", 405, 867, 200, 3, 21.1742, 72.8431, 285, 60, 1200, "Ghod Dod Road Surat"),
    ("405-867-200-4", "Jio", "LTE", 405, 867, 200, 4, 21.1842, 72.8241, 15, 60, 1200, "Sarthana Surat"),
]

TA_METERS = 78.12  # LTE TA quantization per step


def distance_m(lat1: float, lon1: float, lat2: float, lon2: float) -> float:
    return math.hypot((lat2 - lat1) * 111_320.0, (lon2 - lon1) * 111_320.0 * math.cos(math.radians(lat1)))


def write_tower_dump() -> str:
    path = os.path.join(OUT_DIR, "tower_dump_dummy.csv")
    with open(path, "w", newline="", encoding="utf-8") as f:
        w = csv.writer(f)
        w.writerow(["cgi", "operator", "frequency_band", "latitude", "longitude",
                    "azimuth", "beamwidth", "range_meters", "site_address"])
        for cgi, op, radio, _, _, _, _, lat, lon, az, bw, rng, addr in TOWERS:
            w.writerow([cgi, op, radio, lat, lon, az, bw, rng, addr])
    return path


# One cluster = a burst of calls on 3-4 nearby towers within minutes of each other,
# letting the builder merge them into a single multi-lateration frame.
#  (start_minutes_from_0800, lat, lon, [cgi, cgi, ...])
JOURNEY = [
    (0,  21.1702, 72.8211, ["404-20-100-1", "404-20-300-1", "405-867-200-1", "404-81-400-1"]),
    (25, 21.1832, 72.8231, ["404-20-100-4", "404-20-300-4", "405-867-200-4", "404-81-400-4"]),
    (50, 21.1902, 72.8311, ["404-20-100-2", "404-20-300-2", "405-867-200-2", "404-81-400-2"]),
    (75, 21.1752, 72.8411, ["404-20-100-3", "404-20-300-3", "405-867-200-3", "404-81-400-3"]),
    (100, 21.1712, 72.8221, ["404-20-100-1", "404-20-300-1", "405-867-200-1", "404-81-400-1"]),
    (130, 21.1852, 72.8261, ["404-20-100-4", "404-20-300-4", "405-867-200-4", "404-81-400-4"]),
]


def write_airtel_cdr() -> str:
    path = os.path.join(OUT_DIR, "airtel_cdr_dummy.csv")
    tower_by_cgi = {t[0]: t for t in TOWERS}
    with open(path, "w", newline="", encoding="utf-8") as f:
        w = csv.writer(f)
        w.writerow(["calling_no", "called_no", "datetime", "type", "duration",
                    "first cgi", "first cgi lat/long", "mcc", "mnc", "lac", "cell_id",
                    "ta", "rtt", "signal_strength"])
        for start_min, lat, lon, cgis in JOURNEY:
            for i, cgi in enumerate(cgis):
                mcc, mnc, lac, cell_id = tower_by_cgi[cgi][3:7]
                tlat, tlon = tower_by_cgi[cgi][7], tower_by_cgi[cgi][8]
                d = distance_m(lat, lon, tlat, tlon)
                ta = max(1, min(63, round(d / TA_METERS)))
                rtt = round(ta * TA_METERS * 2 / 299792458.0 * 1e9 / 1000.0, 1)  # ms
                mins = start_min + i * 1
                dt = f"2026-08-01 {8 + mins // 60:02d}:{mins % 60:02d}:00"
                w.writerow([SUSPECT, OTHER, dt, "MOC", 90,
                            cgi, f"{tlat}/{tlon}", mcc, mnc, lac, cell_id,
                            ta, rtt, -75 - (i % 3) * 3])
    return path


def write_spot_dump() -> str:
    path = os.path.join(OUT_DIR, "spot_dump_dummy.csv")
    tower_by_cgi = {t[0]: t for t in TOWERS}
    with open(path, "w", newline="", encoding="utf-8") as f:
        w = csv.writer(f)
        w.writerow(["cell_site_cgi", "event_timestamp", "phone_number", "imei", "imsi", "event_description"])
        imei = "358765432109876"
        imsi = "404200123456789"
        for start_min, lat, lon, cgis in JOURNEY:
            for i, cgi in enumerate(cgis):
                mins = start_min + i * 1
                ts = f"2026-08-01T{8 + mins // 60:02d}:{mins % 60:02d}:00Z"
                w.writerow([cgi, ts, SUSPECT, imei, imsi, "LOCATION_UPDATE"])
    return path


if __name__ == "__main__":
    os.makedirs(OUT_DIR, exist_ok=True)
    tower_path = write_tower_dump()
    cdr_path = write_airtel_cdr()
    spot_path = write_spot_dump()
    print(f"Wrote:\n  {tower_path}\n  {cdr_path}\n  {spot_path}")