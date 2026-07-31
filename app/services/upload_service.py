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
        operator detection, and metadata persistence.

        Args:
            file: FastAPI UploadFile instance.
            case_id: Investigation reference case code.
            uploaded_by: Officer uploader ID.

        Returns:
            Dict containing upload metadata and classification outputs.
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
            # File already exists. Delete the newly written file immediately to save space.
            logger.info("duplicate_detected", hash=sha256_hash, filename=file.filename)
            try:
                os.remove(dest_path)
                logger.debug("duplicate_file_cleanup_completed", path=dest_path)
            except Exception as e:
                logger.error("failed_to_clean_duplicate_file", path=dest_path, error=str(e))

            # Retrieve details from database configuration
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

        # 7. Persist UploadMetadata to database config
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
