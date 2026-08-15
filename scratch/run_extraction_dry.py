import asyncio
import sys
import os
from uuid import UUID

sys.path.append(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from app.database.session import async_session_maker
from sqlalchemy import select
from app.database.models.telecom import UploadMetadataModel
from app.services.supabase_storage import storage_service
from app.ingestion.detector.detector import TelecomFileDetector
from app.contracts.enums import SourceType
from app.ingestion.extractors.airtel import AirtelExtractor
from app.ingestion.extractors.bsnl import BSNLExtractor
from app.ingestion.extractors.jio import JioExtractor
from app.ingestion.extractors.spot_dump import SpotDumpExtractor
from app.ingestion.extractors.tower_dump import TowerDumpExtractor
from app.ingestion.extractors.vi import ViExtractor

async def dry_run():
    # Targets
    targets = [
        {"name": "airtel_ground_truth_cdr.csv", "id": UUID("8c83946e-cbf0-43b1-9f4d-b0280bfff639")},
        {"name": "tower_catalog.csv", "id": UUID("829f2e31-e1dd-4d83-a608-33232e1b18ee")}
    ]

    async with async_session_maker() as db_session:
        for target in targets:
            print(f"\n==========================================")
            print(f"Dry Run for: {target['name']} ({target['id']})")
            print(f"==========================================")
            
            res = await db_session.execute(select(UploadMetadataModel).where(UploadMetadataModel.upload_id == target["id"]))
            upload = res.scalar()
            if not upload:
                print("Error: upload not found in DB")
                continue
                
            print(f"DB Path: {upload.supabase_path}")
            
            # Download file
            local_path = f"scratch/{target['name']}"
            os.makedirs("scratch", exist_ok=True)
            try:
                storage_service.download_file(upload.supabase_path, local_path)
                print(f"Downloaded to {local_path}, size = {os.path.getsize(local_path)} bytes")
            except Exception as e:
                print(f"Download failed: {e}")
                continue

            try:
                # 1. Run detection
                detector = TelecomFileDetector()
                det_res = detector.detect(local_path)
                print(f"Detection Operator: {det_res.operator.value}")
                print(f"Detection SourceType: {det_res.source_type.value}")
                print(f"Detection Confidence: {det_res.confidence}")
                print(f"Detection Extractor: {det_res.extractor_name}")
                print(f"Matched Columns: {det_res.matched_columns}")

                # 2. Select extractor
                source_type = det_res.source_type
                operator_str = det_res.operator.value

                if source_type == SourceType.TOWER_DUMP:
                    extractor = TowerDumpExtractor()
                elif source_type == SourceType.SPOT_DUMP:
                    extractor = SpotDumpExtractor()
                elif operator_str == "Airtel":
                    extractor = AirtelExtractor()
                elif operator_str == "Jio":
                    extractor = JioExtractor()
                elif operator_str == "Vi":
                    extractor = ViExtractor()
                elif operator_str == "BSNL":
                    extractor = BSNLExtractor()
                else:
                    extractor = AirtelExtractor()

                print(f"Using Extractor: {extractor.__class__.__name__}")
                
                # 3. Extract records
                records = extractor.extract(local_path, upload_id=target["id"])
                print(f"Extracted Records Count: {len(records)}")
                if records:
                    print("First record preview:")
                    print(records[0])
                
            except Exception as ex:
                import traceback
                print(f"Failed pipeline dry run: {ex}")
                traceback.print_exc()

if __name__ == "__main__":
    asyncio.run(dry_run())
