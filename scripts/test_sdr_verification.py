"""
Test SDR Ground Verification with Sample Data Files.
"""

import json
import csv
import math
from pathlib import Path
import httpx

API_URL = "http://localhost:8000/api/v1/sdr/verify-rf"
SAMPLE_DIR = Path(__file__).resolve().parent.parent / "demo_data" / "sdr_sample_data"


def test_with_json_file(filename: str):
    json_path = SAMPLE_DIR / filename
    print(f"\n=======================================================")
    print(f"Testing SDR Verification with JSON: {filename}")
    print(f"=======================================================")
    with open(json_path, "r", encoding="utf-8") as f:
        payload = json.load(f)

    print(f"Target Fix: ({payload['fix_latitude']}, {payload['fix_longitude']})")
    print(f"Carrier Freq: {payload['carrier_frequency_mhz']} MHz | Towers count: {len(payload['towers'])}")

    try:
        resp = httpx.post(API_URL, json=payload, timeout=10.0)
        resp.raise_for_status()
        data = resp.json()
        print(f"Status: {resp.status_code}")
        print(f"Verdict: {data['verdict']}")
        print(f"Overall Confidence: {data['overall_confidence_pct']}%")
        print(f"RMSE Residual: {data['root_mean_square_error_db']} dB")
        print(f"Max Residual: {data['max_residual_db']} dB")
        print("Per-Tower Results:")
        for t in data["tower_results"]:
            print(f"  - CGI: {t['cgi']:<25} Dist: {t['geodesic_distance_m']:>6.1f}m | Measured: {t['measured_rssi_dbm']:>6.1f} dBm | Expected: {t['expected_rssi_dbm']:>6.1f} dBm | Consistency: {t['consistency_pct']:>5.1f}%")
        return data
    except Exception as e:
        print(f"API Request failed: {e}")
        return None


def test_with_csv_file(filename: str, fix_lat: float, fix_lon: float):
    csv_path = SAMPLE_DIR / filename
    print(f"\n=======================================================")
    print(f"Testing SDR Verification with CSV: {filename}")
    print(f"=======================================================")
    towers = []
    with open(csv_path, "r", encoding="utf-8") as f:
        reader = csv.DictReader(f)
        for row in reader:
            towers.append({
                "cgi": row["cgi"],
                "latitude": float(row["latitude"]),
                "longitude": float(row["longitude"]),
                "measured_rssi_dbm": float(row["measured_rssi_dbm"]),
                "azimuth_deg": float(row.get("azimuth_deg", 0.0)) if row.get("azimuth_deg") else None,
            })

    payload = {
        "fix_latitude": fix_lat,
        "fix_longitude": fix_lon,
        "carrier_frequency_mhz": 1800.0,
        "tx_power_dbm": 43.0,
        "path_loss_exponent": 2.8,
        "towers": towers,
    }

    try:
        resp = httpx.post(API_URL, json=payload, timeout=10.0)
        resp.raise_for_status()
        data = resp.json()
        print(f"Status: {resp.status_code}")
        print(f"Verdict: {data['verdict']}")
        print(f"Overall Confidence: {data['overall_confidence_pct']}%")
        print(f"RMSE Residual: {data['root_mean_square_error_db']} dB")
        return data
    except Exception as e:
        print(f"API Request failed: {e}")
        return None


if __name__ == "__main__":
    test_with_json_file("sdr_sweep_surat_piplod_high_confidence.json")
    test_with_json_file("sdr_sweep_surat_citycenter_verified.json")
    test_with_json_file("sdr_sweep_anomalous_gps_spoof.json")
    test_with_csv_file("sdr_sweep_surat_piplod_high_confidence.csv", 21.1650, 72.7850)
