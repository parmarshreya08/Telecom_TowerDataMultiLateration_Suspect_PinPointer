import asyncio
import sys
import os
from uuid import uuid4

sys.path.append(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from app.database.session import async_session_maker
from sqlalchemy import select
from app.database.models.telecom import CaseModel, UploadMetadataModel
from app.database.repository import TelecomRepository
from app.services.ingest_queue import IngestQueue
from app.utils.datetime_utils import now_ist
from app.contracts.enums import Operator, SourceType
from app.contracts.upload import UploadMetadata
from app.services.supabase_storage import storage_service

async def run_simulation():
    case_id = f"CASE-SIM-{uuid4().hex[:6].upper()}"
    print(f"Simulating Case ID: {case_id}")
    
    async with async_session_maker() as s:
        repo = TelecomRepository(s)
        
        # 1. Create Case
        case_model = CaseModel(
            case_id=case_id,
            case_name=f"Ingestion Simulation Case",
            case_number=f"SIM-{uuid4().hex[:4].upper()}",
            mobile_number="919876543210",
            created_at=now_ist()
        )
        await repo.create_case(case_model)
        await s.commit()
        print("Created Case in DB")

        # 2. Upload Tower Catalog
        tower_file = "demo_data/validation/tower_catalog.csv"
        tower_upload_id = uuid4()
        tower_path = f"{case_id}/{tower_upload_id}-tower_catalog.csv"
        
        # Upload to Supabase Storage
        print(f"Uploading tower catalog to Supabase: {tower_path}")
        storage_service.upload_file(tower_file, tower_path)
        
        # Save metadata
        tower_meta = UploadMetadata(
            upload_id=tower_upload_id,
            case_id=case_id,
            source_type=SourceType.UNKNOWN,
            operator=Operator.UNKNOWN,
            original_filename="tower_catalog.csv",
            stored_filename="tower_catalog.csv",
            sha256=uuid4().hex + uuid4().hex,
            mime_type="text/csv",
            file_size_bytes=os.path.getsize(tower_file),
            uploaded_by="officer_sim",
            uploaded_at=now_ist(),
            supabase_path=tower_path,
            supabase_url="http://dummy/tower",
            display_name="tower_catalog.csv",
            upload_status="uploaded",
            file_source="local"
        )
        await repo.create_upload_metadata(tower_meta)
        await s.commit()
        
        # 3. Upload CDR
        cdr_file = "demo_data/validation/airtel_ground_truth_cdr.csv"
        cdr_upload_id = uuid4()
        cdr_path = f"{case_id}/{cdr_upload_id}-airtel_ground_truth_cdr.csv"
        
        print(f"Uploading CDR to Supabase: {cdr_path}")
        storage_service.upload_file(cdr_file, cdr_path)
        
        cdr_meta = UploadMetadata(
            upload_id=cdr_upload_id,
            case_id=case_id,
            source_type=SourceType.UNKNOWN,
            operator=Operator.UNKNOWN,
            original_filename="airtel_ground_truth_cdr.csv",
            stored_filename="airtel_ground_truth_cdr.csv",
            sha256=uuid4().hex + uuid4().hex,
            mime_type="text/csv",
            file_size_bytes=os.path.getsize(cdr_file),
            uploaded_by="officer_sim",
            uploaded_at=now_ist(),
            supabase_path=cdr_path,
            supabase_url="http://dummy/cdr",
            display_name="airtel_ground_truth_cdr.csv",
            upload_status="uploaded",
            file_source="local"
        )
        await repo.create_upload_metadata(cdr_meta)
        await s.commit()
        
        # 4. Trigger background ingestion synchronously
        queue = IngestQueue()
        print("\n--- Ingesting Tower Catalog ---")
        try:
            await queue._process_upload(tower_upload_id, case_id, tower_path)
            print("Tower Catalog Ingested Successfully")
        except Exception as e:
            import traceback
            print(f"Tower Ingest failed: {e}")
            traceback.print_exc()
            
        print("\n--- Ingesting Airtel CDR ---")
        try:
            await queue._process_upload(cdr_upload_id, case_id, cdr_path)
            print("CDR Ingested Successfully")
        except Exception as e:
            import traceback
            print(f"CDR Ingest failed: {e}")
            traceback.print_exc()
            
        # 5. Fetch quality report
        from app.api.cases import get_case_quality_report
        print("\n--- Fetching Data Quality Report ---")
        report = await get_case_quality_report(case_id, db=s)
        print(report)

if __name__ == "__main__":
    asyncio.run(run_simulation())
