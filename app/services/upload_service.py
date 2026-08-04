"""
Upload Service for E-Rakshak.
Manages the orchestration of validation, saving uploads, checksum hashing, 
duplicate verification, operator detection, and metadata persistence.
"""

from datetime import datetime
import os
from typing import Any
from uuid import uuid4

from sqlalchemy.ext.asyncio import AsyncSession

from app.contracts.detection import DetectionResult
from app.contracts.enums import Operator, SourceType
from app.contracts.upload import UploadMetadata
from app.core.config import settings
from app.core.logging import logger
from app.database.repository import TelecomRepository
from app.ingestion.detector.detector import TelecomFileDetector, EXTRACTOR_MAP
from app.utils.file_utils import (
    create_upload_directory,
    generate_sha256,
    safe_filename,
    save_uploaded_file,
    validate_uploaded_file,
)


class UploadService:
    """
    Service layer separating API routes from file upload business operations.
    """

    def __init__(self, db_session: AsyncSession) -> None:
        self.db_session = db_session
        self.repo = TelecomRepository(db_session)
        self.detector = TelecomFileDetector()

    async def handle_upload(
        self,
        file: Any,
        case_id: str,
        uploaded_by: str
    ) -> dict[str, Any]:
        """
        Executes file validation, local saving, hashing, duplicate checking, 
        operator detection, metadata persistence, and pipeline ingestion.
        """
        logger.info("upload_started", filename=file.filename, case_id=case_id)

        # 1. Ensure storage folders exist
        create_upload_directory(settings.UPLOAD_DIR)

        # 2. File constraints validation
        await validate_uploaded_file(file, max_size_mb=settings.MAX_CONTENT_LENGTH_MB)

        # 3. Formulate safe filename and save to storage
        stored_name = safe_filename(file.filename)
        dest_path = os.path.join(settings.UPLOAD_DIR, stored_name)
        
        try:
            file_size = await save_uploaded_file(file, dest_path)
        except Exception as e:
            logger.error("upload_failed", filename=file.filename, error=f"Storage save failed: {e}")
            raise RuntimeError(f"Storage write failure: {e}")

        # 4. Generate SHA-256 hash checksum (streaming)
        try:
            sha256_hash = generate_sha256(dest_path)
        except Exception as e:
            if os.path.exists(dest_path):
                os.remove(dest_path)
            logger.error("upload_failed", filename=file.filename, error=f"Checksum calculation failed: {e}")
            raise RuntimeError(f"Checksum calculation failure: {e}")

        # 5. Duplicate Check
        existing_upload = await self.repo.get_upload_by_hash(sha256_hash)
        if existing_upload:
            logger.info("duplicate_detected", hash=sha256_hash, filename=file.filename)
            try:
                os.remove(dest_path)
            except Exception as e:
                logger.error("failed_to_clean_duplicate_file", path=dest_path, error=str(e))

            operator_enum = Operator(existing_upload.operator)
            source_enum = SourceType(existing_upload.source_type)
            extractor_name = EXTRACTOR_MAP.get((operator_enum, source_enum), "UnknownExtractor")

            return {
                "upload_id": existing_upload.upload_id,
                "case_id": existing_upload.case_id,
                "duplicate": True,
                "original_filename": existing_upload.original_filename,
                "stored_filename": existing_upload.stored_filename,
                "file_size_bytes": existing_upload.file_size_bytes,
                "sha256": existing_upload.sha256,
                "uploaded_at": existing_upload.uploaded_at,
                "detection": {
                    "operator": operator_enum.value,
                    "source_type": source_enum.value,
                    "confidence": 1.0,
                    "extractor_name": extractor_name,
                    "matched_columns": []
                }
            }

        # 6. Execute Telecom File Classification
        try:
            detection_res: DetectionResult = self.detector.detect(dest_path)
            logger.info(
                "detection_completed", 
                operator=detection_res.operator.value, 
                source_type=detection_res.source_type.value
            )
        except Exception as e:
            if os.path.exists(dest_path):
                os.remove(dest_path)
            logger.error("upload_failed", filename=file.filename, error=f"Detection failed: {e}")
            raise RuntimeError(f"Detector execution failure: {e}")

        # 7. Persist UploadMetadata to database
        upload_id = uuid4()
        uploaded_at = datetime.utcnow()

        metadata = UploadMetadata(
            upload_id=upload_id,
            case_id=case_id,
            source_type=detection_res.source_type,
            operator=detection_res.operator,
            original_filename=file.filename,
            stored_filename=stored_name,
            sha256=sha256_hash,
            mime_type=file.content_type or "text/csv",
            file_size_bytes=file_size,
            uploaded_by=uploaded_by,
            uploaded_at=uploaded_at
        )

        try:
            await self.repo.create_upload_metadata(metadata)
            await self.db_session.commit()
            logger.info("upload_completed", upload_id=str(upload_id))
        except Exception as e:
            if os.path.exists(dest_path):
                os.remove(dest_path)
            logger.error("upload_failed", filename=file.filename, error=f"Database commit failed: {e}")
            raise RuntimeError(f"Database write failure: {e}")

        # 8. Run ingestion pipeline (extract → normalize → build frames)
        try:
            from app.contracts.enums import SourceType as ST
            from app.contracts.subscriber import SubscriberEventRecord
            from app.contracts.tower import TowerRecord
            from app.ingestion.builder.measurement_builder import MeasurementFrameBuilder
            from app.ingestion.extractors.airtel import AirtelExtractor
            from app.ingestion.extractors.bsnl import BSNLExtractor
            from app.ingestion.extractors.jio import JioExtractor
            from app.ingestion.extractors.spot_dump import SpotDumpExtractor
            from app.ingestion.extractors.tower_dump import TowerDumpExtractor
            from app.ingestion.extractors.vi import ViExtractor
            from app.ingestion.normalizer.normalizer import TelecomNormalizer
            from app.ingestion.validator.validator import IngestionValidator
            from app.services.tower_lookup import TowerLookupService

            source_type = detection_res.source_type
            operator_str = detection_res.operator.value

            if source_type == ST.TOWER_DUMP:
                extractor = TowerDumpExtractor()
            elif source_type == ST.SPOT_DUMP:
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

            raw_rows = extractor.extract(dest_path, upload_id=upload_id)

            if source_type == ST.TOWER_DUMP:
                validator = IngestionValidator()
                valid_rows = validator.validate_raw_records(raw_rows, source_type.value)
                normalizer = TelecomNormalizer()
                normalized_records = normalizer.normalize_records(
                    valid_rows, operator_str, source_type.value, upload_id, file.filename
                )
                towers = [r for r in normalized_records if isinstance(r, TowerRecord)]
                await self.repo.save_tower_records(towers)
            else:
                events = [r for r in raw_rows if isinstance(r, SubscriberEventRecord)]
                await self.repo.save_subscriber_events(events)
                tower_lookup = TowerLookupService(self.db_session)
                builder = MeasurementFrameBuilder(tower_lookup)
                frames = await builder.build_frames(events)
                await self.repo.save_measurement_frames(frames)

            await self.db_session.commit()
            logger.info("pipeline_ingestion_completed", upload_id=str(upload_id))
        except Exception as e:
            import traceback
            logger.error("pipeline_ingestion_failed", upload_id=str(upload_id), error=str(e), traceback=traceback.format_exc())

        return {
            "upload_id": upload_id,
            "case_id": case_id,
            "duplicate": False,
            "original_filename": file.filename,
            "stored_filename": stored_name,
            "file_size_bytes": file_size,
            "sha256": sha256_hash,
            "uploaded_at": uploaded_at,
            "detection": {
                "operator": detection_res.operator.value,
                "source_type": detection_res.source_type.value,
                "confidence": detection_res.confidence,
                "extractor_name": detection_res.extractor_name,
                "matched_columns": detection_res.matched_columns
            }
        }
