"""
Telecom Ingestion Pipeline Orchestrator.
Coordinates detector, extractors, validator, normalizer, builder, and database persistence layers.
"""

import os
from datetime import datetime
from typing import Any
from uuid import uuid4

from sqlalchemy.ext.asyncio import AsyncSession

from app.contracts.enums import Operator, SourceType
from app.contracts.measurement import MeasurementFrame
from app.contracts.subscriber import SubscriberEventRecord
from app.contracts.tower import TowerRecord
from app.contracts.upload import UploadMetadata
from app.core.logging import logger
from app.database.repository import TelecomRepository
from app.exceptions.upload import DuplicateUploadError
from app.ingestion.builder.measurement_builder import MeasurementFrameBuilder
from app.ingestion.detector.detector import TelecomFileDetector
from app.ingestion.extractors.airtel import AirtelExtractor
from app.ingestion.extractors.bsnl import BSNLExtractor
from app.ingestion.extractors.jio import JioExtractor
from app.ingestion.extractors.spot_dump import SpotDumpExtractor
from app.ingestion.extractors.tower_dump import TowerDumpExtractor
from app.ingestion.extractors.vi import ViExtractor
from app.ingestion.normalizer.normalizer import TelecomNormalizer
from app.ingestion.validator.validator import IngestionValidator
from app.services.tower_lookup import TowerLookupService
from app.utils.hashing import calculate_file_hash


class TelecomIngestionPipeline:
    """
    Core orchestrator that runs the multi-stage ingestion pipeline.
    """

    def __init__(self, db_session: AsyncSession) -> None:
        self.db_session = db_session
        self.repo = TelecomRepository(db_session)
        
        # Initialize pipeline stages
        self.detector = TelecomFileDetector()
        self.validator = IngestionValidator()
        self.normalizer = TelecomNormalizer()
        
        # Initialize services
        self.tower_lookup = TowerLookupService(db_session)
        self.builder = MeasurementFrameBuilder(self.tower_lookup)

    async def execute(
        self,
        file_path: str,
        original_file_name: str,
        case_id: str,
        uploaded_by: str
    ) -> dict[str, Any]:
        """
        Runs the ingestion pipeline end-to-end.

        Args:
            file_path: Absolute local path to the uploaded data file.
            original_file_name: User-provided name of the document.
            case_id: Investigation reference ID.
            uploaded_by: Name or system id of uploading officer.

        Returns:
            Dict containing ingestion statistics and references.
        """
        upload_id = uuid4()
        start_time = datetime.now()

        # Step 1: Checksum Hashing & Uniqueness verification
        file_hash = calculate_file_hash(file_path)
        existing_upload = await self.repo.get_upload_by_hash(file_hash)
        if existing_upload:
            logger.warn("duplicate_upload_blocked", file_hash=file_hash, file_name=original_file_name)
            raise DuplicateUploadError(
                f"File '{original_file_name}' (hash: {file_hash}) has already been ingested."
            )

        # Step 2: File Format & Operator Detection
        detection = self.detector.detect(file_path)
        operator_str = detection.operator.value
        file_type_str = detection.source_type.value

        # Map to proper Enums
        try:
            operator = Operator(operator_str)
        except ValueError:
            operator = Operator.UNKNOWN

        try:
            source_type = SourceType(file_type_str)
        except ValueError:
            source_type = SourceType.UNKNOWN

        # Get file size
        file_size_bytes = os.path.getsize(file_path) if os.path.exists(file_path) else 1024

        # Deduce a basic MIME Type
        mime_type = "text/csv"
        if original_file_name.endswith(".xlsx"):
            mime_type = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
        elif original_file_name.endswith(".xls"):
            mime_type = "application/vnd.ms-excel"

        # Register metadata upload record
        metadata = UploadMetadata(
            upload_id=upload_id,
            case_id=case_id,
            source_type=source_type,
            operator=operator,
            original_filename=original_file_name,
            stored_filename=os.path.basename(file_path),
            sha256=file_hash,
            mime_type=mime_type,
            file_size_bytes=file_size_bytes,
            uploaded_by=uploaded_by,
            uploaded_at=start_time
        )
        await self.repo.create_upload_metadata(metadata)

        # Step 3: Instantiate relevant Extractor
        extractor = self._get_extractor(operator_str, file_type_str)

        # Step 4: Extract Raw Rows
        raw_rows = extractor.extract(file_path, upload_id=upload_id)

        # Step 5: Data Constraints Validation
        valid_rows = self.validator.validate_raw_records(raw_rows, file_type_str)

        # Step 6: Normalization mapping
        normalized_records = self.normalizer.normalize_records(
            valid_rows, operator_str, file_type_str, upload_id, original_file_name
        )

        # Step 7: Database Persistance & Downstream Frame Building
        frames: list[MeasurementFrame] = []
        if source_type == SourceType.TOWER_DUMP:
            # Save tower sites to global lookup catalog
            towers = [r for r in normalized_records if isinstance(r, TowerRecord)]
            await self.repo.save_tower_records(towers)
        else:
            # CDR or SpotDump subscriber activities
            events = [r for r in normalized_records if isinstance(r, SubscriberEventRecord)]
            await self.repo.save_subscriber_events(events)

            # Build Measurement Frames for the suspect subscriber voice/data connections
            frames = await self.builder.build_frames(events)
            # Persist frames to db for later query by the Trilateration engine
            await self.repo.save_measurement_frames(frames)

        # Commit transaction
        await self.db_session.commit()

        end_time = datetime.now()
        duration_ms = int((end_time - start_time).total_seconds() * 1000)

        logger.info(
            "pipeline_ingestion_success",
            upload_id=str(upload_id),
            operator=operator,
            source_type=source_type,
            records_count=len(normalized_records),
            frames_count=len(frames),
            duration_ms=duration_ms
        )

        return {
            "upload_id": upload_id,
            "case_id": case_id,
            "operator": operator.value,
            "source_type": source_type.value,
            "records_processed": len(normalized_records),
            "measurement_frames_built": len(frames),
            "duration_ms": duration_ms
        }

    def _get_extractor(self, operator: str, file_type: str) -> Any:
        """
        Factory selector for extracting instances.
        """
        if file_type == "TowerDump":
            return TowerDumpExtractor()
        if file_type == "SpotDump":
            return SpotDumpExtractor()

        # Route CDR extractors
        if operator == "Airtel":
            return AirtelExtractor()
        if operator == "Jio":
            return JioExtractor()
        if operator == "Vi":
            return ViExtractor()
        if operator == "BSNL":
            return BSNLExtractor()
        
        # Default fallback
        return AirtelExtractor()
