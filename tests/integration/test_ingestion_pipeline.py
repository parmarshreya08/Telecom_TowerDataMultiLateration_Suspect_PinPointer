import os
import pytest
from datetime import datetime, timezone, timedelta
from uuid import uuid4
from sqlalchemy.ext.asyncio import AsyncSession

from app.contracts.enums import Operator, SourceType
from app.utils.datetime_utils import parse_telecom_datetime, IST
from app.database.session import async_session_maker
from app.database.models.telecom import CaseModel, UploadMetadataModel
from app.database.repository import TelecomRepository
from app.services.ingest_queue import IngestQueue
from app.api.cases import get_case_quality_report
from app.utils.datetime_utils import now_ist
from app.ingestion.detector.detector import TelecomFileDetector

# 1. Test Datetime Conversion
def test_datetime_timezone_normalization():
    # UTC input
    utc_str = "2026-08-15T10:00:00Z"
    dt = parse_telecom_datetime(utc_str)
    assert dt.tzinfo is None, "Resulting datetime must be timezone-naive"
    # 10:00:00 UTC is 15:30:00 IST
    assert dt == datetime(2026, 8, 15, 15, 30, 0), f"Expected 15:30:00 naive, got {dt}"

    # Naive format should be preserved as naive
    naive_str = "15/08/2026 10:00:00"
    dt2 = parse_telecom_datetime(naive_str)
    assert dt2.tzinfo is None
    assert dt2 == datetime(2026, 8, 15, 10, 0, 0)

# 2. Test File Detector Classification
def test_operator_classification_validation_files():
    detector = TelecomFileDetector()
    
    # Airtel Ground Truth CDR should map to Operator.AIRTEL
    res_cdr = detector.detect("demo_data/validation/airtel_ground_truth_cdr.csv", original_filename="airtel_ground_truth_cdr.csv")
    assert res_cdr.operator == Operator.AIRTEL
    assert res_cdr.source_type == SourceType.CDR
    
    # Tower Catalog should map to SourceType.TOWER_DUMP
    res_tower = detector.detect("demo_data/validation/tower_catalog.csv", original_filename="tower_catalog.csv")
    assert res_tower.operator == Operator.UNKNOWN
    assert res_tower.source_type == SourceType.TOWER_DUMP

# 3. DB dependent End-to-End Pipeline test
@pytest.mark.asyncio
async def test_database_pipeline_e2e():
    # Check if database connection is available
    try:
        async with async_session_maker() as s:
            import sqlalchemy
            await s.execute(sqlalchemy.text("SELECT 1"))
    except Exception as ex:
        import traceback
        traceback.print_exc()
        pytest.skip(f"Database is not reachable: {ex}; skipping database-dependent integration tests.")

    # Generate a unique Case ID
    case_id = f"CASE-TEST-{uuid4().hex[:6].upper()}"
    
    async with async_session_maker() as s:
        repo = TelecomRepository(s)
        
        # Create case
        case_model = CaseModel(
            case_id=case_id,
            case_name="Integration Test Case",
            case_number=f"TEST-{uuid4().hex[:4].upper()}",
            mobile_number="919876543210",
            created_at=now_ist()
        )
        await repo.create_case(case_model)
        await s.commit()

        # Ingest Tower Catalog first
        tower_upload_id = uuid4()
        tower_meta = UploadMetadataModel(
            upload_id=tower_upload_id,
            case_id=case_id,
            source_type=SourceType.UNKNOWN.value,
            operator=Operator.UNKNOWN.value,
            original_filename="tower_catalog.csv",
            stored_filename="tower_catalog.csv",
            sha256=uuid4().hex + uuid4().hex,
            mime_type="text/csv",
            file_size_bytes=os.path.getsize("demo_data/validation/tower_catalog.csv"),
            uploaded_by="test_runner",
            uploaded_at=now_ist(),
            supabase_path=f"test/{tower_upload_id}-tower_catalog.csv",
            supabase_url="http://dummy/tower",
            display_name="tower_catalog.csv",
            upload_status="uploaded",
            file_source="local"
        )
        s.add(tower_meta)
        await s.commit()

        # Ingest CDR next
        cdr_upload_id = uuid4()
        cdr_meta = UploadMetadataModel(
            upload_id=cdr_upload_id,
            case_id=case_id,
            source_type=SourceType.UNKNOWN.value,
            operator=Operator.UNKNOWN.value,
            original_filename="airtel_ground_truth_cdr.csv",
            stored_filename="airtel_ground_truth_cdr.csv",
            sha256=uuid4().hex + uuid4().hex,
            mime_type="text/csv",
            file_size_bytes=os.path.getsize("demo_data/validation/airtel_ground_truth_cdr.csv"),
            uploaded_by="test_runner",
            uploaded_at=now_ist(),
            supabase_path=f"test/{cdr_upload_id}-airtel_ground_truth_cdr.csv",
            supabase_url="http://dummy/cdr",
            display_name="airtel_ground_truth_cdr.csv",
            upload_status="uploaded",
            file_source="local"
        )
        s.add(cdr_meta)
        await s.commit()

        # Execute ingestion synchronously using mock upload mapping or real paths
        queue = IngestQueue()
        
        # Override the supabase path with actual local path to mock downloading
        import unittest.mock
        with unittest.mock.patch("app.services.ingest_queue.storage_service.download_file") as mock_download:
            # We copy files to the path expected by the download function
            def side_effect(remote, local):
                import shutil
                if "tower_catalog" in remote:
                    shutil.copy("demo_data/validation/tower_catalog.csv", local)
                else:
                    shutil.copy("demo_data/validation/airtel_ground_truth_cdr.csv", local)
            mock_download.side_effect = side_effect

            await queue._process_upload(tower_upload_id, case_id, f"test/{tower_upload_id}-tower_catalog.csv")
            await queue._process_upload(cdr_upload_id, case_id, f"test/{cdr_upload_id}-airtel_ground_truth_cdr.csv")

        # Validate results in DB
        report = await get_case_quality_report(case_id, db=s)
        
        # Assertions
        assert report["total_records"] == 15
        assert report["unique_towers"] == 3
        assert report["unique_subscribers"] == 1
        assert report["frames_created"] == 1
        
        # Verify tower records are present globally
        for cgi in ["404-45-101-1", "404-45-101-2", "404-45-101-3"]:
            tower_rec = await repo.get_tower_by_cgi(cgi)
            assert tower_rec is not None
            assert tower_rec.cgi == cgi
            assert tower_rec.latitude is not None
            assert tower_rec.longitude is not None
