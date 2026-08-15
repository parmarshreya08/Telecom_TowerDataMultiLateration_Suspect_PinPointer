"""Unit tests verifying PDF report generation."""

from types import SimpleNamespace
from datetime import datetime
from app.localization.exports import generate_pdf


def test_generate_pdf_compiles_successfully():
    fix = SimpleNamespace(
        fix_id="f1",
        frame_id="fr1",
        timestamp=datetime.now(),
        latitude=21.170216,
        longitude=72.830876,
        confidence_radius_meters=77.4,
        gdop=1.68,
        residual_rms=0.0000,
        velocity_east=1.2,
        velocity_north=0.5,
        geocoded_address="Udhana, Surat"
    )
    
    tower = SimpleNamespace(
        cgi="404-45-101-1",
        latitude=21.1680,
        longitude=72.8280,
        timing_advance=1,
        rtt=0.02,
        pseudorange_meters=150.0,
        site_address="Surat South-West Site"
    )
    
    frame = SimpleNamespace(
        frame_id="fr1",
        towers=[tower]
    )
    
    case_info = {
        "case_name": "Test Case",
        "case_number": "CASE-TEST-1",
        "suspect_name": "Suspect A",
        "mobile_number": "9876543210",
        "description": "Test description",
        "officer_notes": "Test notes",
        "status": "Active",
        "created_by": "Officer Test"
    }
    
    quality_data = {
        "total_records": 15,
        "unique_towers": 3,
        "ta_available_pct": 100.0,
        "rtt_available_pct": 100.0,
        "frames_created": 1,
        "fixes_generated": 1
    }
    
    report_data = {
        "report_id": "FR-CASE-TEST-1",
        "generated_at": datetime.now().isoformat(),
        "status": "COMPLETED",
        "methodology": {
            "algorithm": "JPL Pseudorange Multi-Lateration + Kalman Tracking",
            "ta_band_model": "LTE TA Band",
            "sector_wedge_model": "Sector Wedge",
            "confidence_level": 0.95
        }
    }
    
    pdf_bytes = generate_pdf(
        fixes=[fix],
        case_id="CASE-TEST-1",
        report_data=report_data,
        case_info=case_info,
        quality_data=quality_data,
        frames=[frame]
    )
    
    assert isinstance(pdf_bytes, bytes)
    assert len(pdf_bytes) > 0
