"""
Background ingestion queue for E-Rakshak.
Runs the telecom ingestion pipeline asynchronously for each uploaded file.
"""

import asyncio
import os
import tempfile
from typing import Any
from uuid import UUID

from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import settings
from app.core.logging import logger
from app.database.repository import TelecomRepository
from app.database.session import async_session_maker
from app.services.supabase_storage import storage_service


class IngestQueue:
    """
    Simple async background job queue for running the ingestion pipeline.
    Each job downloads the file from Supabase, converts if needed,
    runs detection + extraction + validation, and updates status.
    """

    def __init__(self) -> None:
        self._tasks: dict[UUID, asyncio.Task] = {}

    async def enqueue(self, upload_id: UUID, case_id: str, supabase_path: str) -> None:
        """
        Enqueue a file for background ingestion.
        """
        logger.info("ingest_queue_enqueue", upload_id=str(upload_id), case_id=case_id)

        task = asyncio.create_task(
            self._process_upload(upload_id, case_id, supabase_path)
        )
        self._tasks[upload_id] = task

    async def _process_upload(
        self, upload_id: UUID, case_id: str, supabase_path: str
    ) -> None:
        """
        Process a single upload: download → convert → detect → extract → validate → persist.
        """
        from app.contracts.enums import SourceType
        from app.contracts.subscriber import SubscriberEventRecord
        from app.contracts.tower import TowerRecord
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
        from app.services.file_converter import FileConverter
        from app.services.tower_lookup import TowerLookupService

        async with async_session_maker() as db_session:
            repo = TelecomRepository(db_session)

            try:
                await repo.update_upload_status(upload_id, "processing")
                await db_session.commit()

                # Download from Supabase to temp file
                with tempfile.NamedTemporaryFile(suffix=".csv", delete=False) as tmp:
                    local_path = tmp.name

                try:
                    storage_service.download_file(supabase_path, local_path)

                    # Run detection
                    detector = TelecomFileDetector()
                    detection_res = detector.detect(local_path)

                    # Update detection info
                    upload = await repo.get_upload_by_id(upload_id)
                    if upload:
                        upload.source_type = detection_res.source_type.value
                        upload.operator = detection_res.operator.value
                        await db_session.commit()

                    # Run extraction
                    source_type = detection_res.source_type
                    operator_str = detection_res.operator.value

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

                    raw_rows = extractor.extract(local_path, upload_id=upload_id)

                    if source_type == SourceType.TOWER_DUMP:
                        validator = IngestionValidator()
                        valid_rows = validator.validate_raw_records(raw_rows, source_type.value)
                        normalizer = TelecomNormalizer()
                        normalized = normalizer.normalize_records(
                            valid_rows, operator_str, source_type.value, upload_id, upload.original_filename
                        )
                        towers = [r for r in normalized if isinstance(r, TowerRecord)]
                        await repo.save_tower_records(towers)
                    else:
                        if source_type == SourceType.SPOT_DUMP:
                            validator = IngestionValidator()
                            valid_rows = validator.validate_raw_records(raw_rows, source_type.value)
                            normalizer = TelecomNormalizer()
                            normalized = normalizer.normalize_records(
                                valid_rows, operator_str, source_type.value, upload_id, upload.original_filename
                            )
                            events = [r for r in normalized if isinstance(r, SubscriberEventRecord)]
                        else:
                            events = [r for r in raw_rows if isinstance(r, SubscriberEventRecord)]
                        await repo.save_subscriber_events(events)
                        tower_lookup = TowerLookupService(db_session)
                        builder = MeasurementFrameBuilder(tower_lookup)
                        frames = await builder.build_frames(events)
                        await repo.save_measurement_frames(frames)

                    await repo.update_upload_status(upload_id, "completed")
                    await db_session.commit()
                    logger.info("ingest_queue_complete", upload_id=str(upload_id))

                finally:
                    if os.path.exists(local_path):
                        os.remove(local_path)

            except Exception as e:
                logger.error("ingest_queue_failed", upload_id=str(upload_id), error=str(e))
                await repo.update_upload_status(upload_id, "failed", error_message=str(e))
                await db_session.commit()

            finally:
                self._tasks.pop(upload_id, None)


# Singleton instance
ingest_queue = IngestQueue()
