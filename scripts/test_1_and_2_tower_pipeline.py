"""
Test and demonstration script for 1-tower, 2-tower, and 3-tower localization.
Loads demo_data/sample_localization_request.json and runs it through the LocalizationEngine.
"""

import json
from pathlib import Path
from uuid import uuid4
from app.contracts.localization import LocalizationEstimateRequest
from app.localization.engine import LocalizationEngine
from app.api.localization import _convert_input_to_measurement_frame


def test_payload(json_path: Path, label: str):
    print("\n" + "=" * 80)
    print(f"TESTING: {label} ({json_path})")
    print("=" * 80)
    with open(json_path, "r", encoding="utf-8") as f:
        data = json.load(f)

    request = LocalizationEstimateRequest(**data)
    demo_upload_id = uuid4()
    frames = [
        _convert_input_to_measurement_frame(
            frame_in,
            subscriber_identifier=request.subscriber_identifier,
            upload_id=demo_upload_id,
        )
        for frame_in in request.frames
    ]

    engine = LocalizationEngine(utm_zone=request.utm_zone or 0, target_type=request.target_type)
    fixes = engine.compute_fixes(
        frames=frames,
        case_id=request.case_id,
    )

    print(f"Successfully generated {len(fixes)} fixes:")
    for idx, fix in enumerate(fixes, 1):
        badge = "Coarse (1 sector)" if fix.fix_method == "single_sector" else ("Low confidence (2 towers)" if fix.fix_method == "two_tower" else f"High confidence ({fix.n_towers}+ towers)")
        print(f"  [Fix #{idx}] Method: {fix.fix_method.upper():<15} | Towers: {fix.n_towers} | Badge: {badge:<30} | Pos: ({fix.latitude:.6f}, {fix.longitude:.6f}) | 95% Radius: {fix.confidence_radius_meters:.1f}m")

    geojson = engine.to_geojson(fixes=fixes, frames=frames)
    feature_types = [f"{f.get('geometry', {}).get('type')}:{f.get('properties', {}).get('fix_method')}" for f in geojson.get("features", [])]
    print(f"  GeoJSON Features Generated ({len(feature_types)}): {', '.join(feature_types)}")


def run_all_tests():
    test_payload(Path("demo_data/tower1_sample_data/tower1_request_payload.json"), "1-TOWER SINGLE SECTOR ENGINE")
    test_payload(Path("demo_data/tower2_sample_data/tower2_request_payload.json"), "2-TOWER CIRCLE INTERSECTION ENGINE")
    test_payload(Path("demo_data/tower3_sample_data/tower3_request_payload.json"), "3-TOWER MULTILATERATION ENGINE")
    print("\n" + "=" * 80)
    print("ALL SAMPLE DATA FOLDERS VALIDATED SUCCESSFULLY!")
    print("=" * 80 + "\n")


if __name__ == "__main__":
    run_all_tests()
