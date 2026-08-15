#!/usr/bin/env python3
"""
E-Rakshak Ground-Truth Accuracy Validation Framework.
Generates synthetic validation datasets and verifies multilateration accuracy (MAE, RMSE, confidence containment).
"""

import os
import sys
import json
import math
import csv
import argparse
from datetime import datetime

# Set python path to allow importing app modules
sys.path.append(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

# Import settings to connect to the database
from app.core.config import settings

# Helper: Haversine distance in meters
def haversine_distance(lat1, lon1, lat2, lon2):
    R = 6371000.0 # Earth radius in meters
    phi1 = math.radians(lat1)
    phi2 = math.radians(lat2)
    delta_phi = math.radians(lat2 - lat1)
    delta_lambda = math.radians(lon2 - lon1)
    a = math.sin(delta_phi / 2.0)**2 + math.cos(phi1) * math.cos(phi2) * math.sin(delta_lambda / 2.0)**2
    c = 2.0 * math.atan2(math.sqrt(a), math.sqrt(1.0 - a))
    return R * c

# Target ground-truth suspect path in Surat, Gujarat (India)
TRUE_TRAJECTORY = [
    {"timestamp": "2026-08-15T10:00:00Z", "latitude": 21.1700, "longitude": 72.8310},
    {"timestamp": "2026-08-15T10:05:00Z", "latitude": 21.1720, "longitude": 72.8330},
    {"timestamp": "2026-08-15T10:10:00Z", "latitude": 21.1740, "longitude": 72.8350},
    {"timestamp": "2026-08-15T10:15:00Z", "latitude": 21.1760, "longitude": 72.8370},
    {"timestamp": "2026-08-15T10:20:00Z", "latitude": 21.1780, "longitude": 72.8390},
]

# Registered tower coordinates & azimuth sectors
TOWERS = [
    {"cgi": "404-45-101-1", "latitude": 21.1680, "longitude": 72.8280, "azimuth": 45.0, "beamwidth": 65.0, "range_meters": 1200.0, "site_address": "Surat South-West Site"},
    {"cgi": "404-45-101-2", "latitude": 21.1800, "longitude": 72.8320, "azimuth": 135.0, "beamwidth": 70.0, "range_meters": 1500.0, "site_address": "Surat North-West Site"},
    {"cgi": "404-45-101-3", "latitude": 21.1720, "longitude": 72.8450, "azimuth": 270.0, "beamwidth": 80.0, "range_meters": 2000.0, "site_address": "Surat East Site"},
]

def generate_validation_data(target_dir):
    """
    Creates validation directories and writes ground-truth case files.
    """
    os.makedirs(target_dir, exist_ok=True)
    
    # 1. Write ground_truth_case.json
    gt_path = os.path.join(target_dir, "ground_truth_case.json")
    with open(gt_path, "w") as f:
        json.dump(TRUE_TRAJECTORY, f, indent=2)
    print(f"Created SYNTHETIC ground truth path: {gt_path}")
    
    # 2. Write tower_catalog.csv
    tower_path = os.path.join(target_dir, "tower_catalog.csv")
    with open(tower_path, "w", newline="") as f:
        writer = csv.writer(f)
        writer.writerow(["cgi", "latitude", "longitude", "azimuth", "beamwidth", "range_meters", "site_address"])
        for t in TOWERS:
            writer.writerow([t["cgi"], t["latitude"], t["longitude"], t["azimuth"], t["beamwidth"], t["range_meters"], t["site_address"]])
    print(f"Created SYNTHETIC tower catalog reference: {tower_path}")
    
    # 3. Generate airtel_ground_truth_cdr.csv
    cdr_path = os.path.join(target_dir, "airtel_ground_truth_cdr.csv")
    with open(cdr_path, "w", newline="") as f:
        writer = csv.writer(f)
        writer.writerow(["phone_number", "imei", "imsi", "timestamp", "cgi", "call_type", "duration_seconds", "timing_advance", "rtt", "signal_strength"])
        
        for pt in TRUE_TRAJECTORY:
            for t in TOWERS:
                dist = haversine_distance(pt["latitude"], pt["longitude"], t["latitude"], t["longitude"])
                
                # Math timing advance = dist / 78.12
                ta = round(dist / 78.12)
                # Keep RTT in milliseconds (speed of light in air)
                rtt = round((dist / 300000.0) * 2.0, 2)
                signal_strength = -70 - round(dist / 120)
                
                writer.writerow([
                    "919876543210",
                    "860123456789012",
                    "404459876543210",
                    pt["timestamp"],
                    t["cgi"],
                    "MOC",
                    "30",
                    ta,
                    rtt,
                    signal_strength
                ])
    print(f"Created SYNTHETIC Airtel-format CDR records: {cdr_path}")
    
    # 4. Write README.md guide
    readme_path = os.path.join(target_dir, "README.md")
    with open(readme_path, "w") as f:
        f.write("""# E-Rakshak Ground-Truth Accuracy Validation

This directory contains synthetic verification datasets for validation and testing of E-Rakshak multilateration and tracking accuracies.

## Files
- `ground_truth_case.json`: The true simulated path of the suspect device.
- `tower_catalog.csv`: The registered tower coordinates and antenna settings.
- `airtel_ground_truth_cdr.csv`: Synthetic Airtel-format CDR records mapped to the true path, including calculated Timing Advance (TA), RTT, and Signal Strength.

## Instructions
1. Upload and ingest `tower_catalog.csv` as the tower database.
2. Create a case for MSISDN `919876543210` and upload/ingest `airtel_ground_truth_cdr.csv`.
3. Run the localization engine on this case.
4. Run `python scripts/verify_accuracy.py --case <case_id>` to check accuracy metrics.
""")
    print(f"Created README.md validation instructions guide: {readme_path}")
    print("\nAll synthetic validation datasets successfully generated.")

async def evaluate_accuracy(case_id):
    """
    Compares database resolved fixes against simulated ground truth, printing metrics.
    """
    from app.database.session import async_session_maker
    from app.database.models.telecom import LocalizationFixModel
    from sqlalchemy import select
    
    gt_path = "demo_data/validation/ground_truth_case.json"
    if not os.path.exists(gt_path):
        print(f"Error: ground truth file not found at {gt_path}. Run with --generate first.")
        sys.exit(1)
        
    with open(gt_path, "r") as f:
        ground_truth = json.load(f)
        
    async with async_session_maker() as session:
        stmt = select(LocalizationFixModel).where(
            LocalizationFixModel.case_id == case_id
        ).order_by(LocalizationFixModel.timestamp)
        res = await session.execute(stmt)
        fixes = res.scalars().all()
    
    if not fixes:
        print(f"Error: No localization fixes found in DB for case '{case_id}'")
        sys.exit(1)
        
    print(f"\nEvaluating Case ID: {case_id}")
    print(f"Ground Truth points: {len(ground_truth)}")
    print(f"Resolved Fixes points: {len(fixes)}")
    
    errors = []
    contained_count = 0
    
    print("\nComparison Walkthrough:")
    print(f"{'Timestamp':<25} | {'True (Lat, Lon)':<22} | {'Estimated (Lat, Lon)':<22} | {'Error (m)':<10} | {'Radius (m)':<10} | {'Contained':<10}")
    print("-" * 110)
    
    for gt in ground_truth:
        gt_time = datetime.fromisoformat(gt["timestamp"].replace("Z", "+00:00")).replace(tzinfo=None)
        
        # Match closest estimate by timestamp
        best_fix = None
        min_td = None
        for f in fixes:
            f_time = f.timestamp.replace(tzinfo=None)
            td = abs((f_time - gt_time).total_seconds())
            if min_td is None or td < min_td:
                min_td = td
                best_fix = f
                
        if best_fix and min_td < 30.0:
            err = haversine_distance(gt["latitude"], gt["longitude"], best_fix.latitude, best_fix.longitude)
            errors.append(err)
            
            contained = err <= best_fix.confidence_radius_meters
            if contained:
                contained_count += 1
                
            true_str = f"{gt['latitude']:.5f}, {gt['longitude']:.5f}"
            est_str = f"{best_fix.latitude:.5f}, {best_fix.longitude:.5f}"
            print(f"{gt['timestamp']:<25} | {true_str:<22} | {est_str:<22} | {err:<10.1f} | {best_fix.confidence_radius_meters:<10.1f} | {str(contained):<10}")
            
    if not errors:
        print("No matching timestamp fixes found within 30s threshold.")
        return
        
    mean_err = sum(errors) / len(errors)
    rmse = math.sqrt(sum(e**2 for e in errors) / len(errors))
    max_err = max(errors)
    containment_rate = (contained_count / len(errors)) * 100.0
    
    print("\n" + "="*50)
    print("ACCURACY SUMMARY METRICS")
    print("="*50)
    print(f"Evaluated Pairs:           {len(errors)}")
    print(f"Mean Absolute Error (MAE): {mean_err:.2f} meters")
    print(f"RMSE (Root Mean Sq Error): {rmse:.2f} meters")
    print(f"Max Distance Error:        {max_err:.2f} meters")
    print(f"95% Boundary Containment:  {containment_rate:.1f}%")
    print("="*50)
    
    if containment_rate >= 80.0:
        print("PASS: System estimation matches ground-truth boundaries within tolerances.")
    else:
        print("WARNING: Containment rate is low. Review multilateration variance bounds.")

if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="E-Rakshak Ground-Truth Accuracy Validation Framework")
    parser.add_argument("--generate", action="store_true", help="Generate synthetic testing datasets under demo_data/validation/")
    parser.add_argument("--case", type=str, help="Evaluate accuracy of resolved fixes for a Case ID")
    args = parser.parse_args()
    
    if args.generate:
        generate_validation_data("demo_data/validation")
    elif args.case:
        import asyncio
        asyncio.run(evaluate_accuracy(args.case))
    else:
        parser.print_help()
