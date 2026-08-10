"""
Upload Service for E-Rakshak.
Manages the orchestration of validation, saving uploads to Supabase, 
checksum hashing, duplicate verification, and metadata persistence.
"""

import os
import tempfile
from datetime import datetime
from typing import Any
from uuid import uuid4

from sqlalchemy.ext.asyncio import AsyncSession

from app.contracts.detection import DetectionResult
from app.contracts.enums import Operator, SourceType
from app.contracts.upload import UploadMetadata
from app.core.config import settings
from app.core.logging import logger
from app.database.repository import TelecomRepository
from app.services.file_converter import FileConverter
from app.services.ingest_queue import ingest_queue
from app.services.supabase_storage import storage_service
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

    async def handle_multipart_upload(
        self,
        files: list[Any],
        case_id: str,
        uploaded_by: str,
    ) -> list[dict[str, Any]]:
        """
        Handles multiple file uploads. Each file is validated, saved to Supabase,
        and enqueued for background ingestion.
        Returns per-file results.
        """
        results = []
        for file in files:
            result = await self._process_single_file(file, case_id, uploaded_by)
            results.append(result)
        return results

    async def handle_url_upload(
        self,
        url: str,
        filename: str,
        case_id: str,
        uploaded_by: str,
    ) -> dict[str, Any]:
        """
        Handles file upload from a direct URL.
        Downloads the file, validates, saves to Supabase, and enqueues for ingestion.
        """
        import httpx

        logger.info("url_upload_start", url=url, filename=filename, case_id=case_id)

        # Download from URL
        try:
            async with httpx.AsyncClient(timeout=30) as client:
                response = await client.get(url)
                response.raise_for_status()
        except Exception as e:
            raise ValueError(f"Failed to download file from URL: {e}")

        # Use provided filename or extract from URL
        if not filename:
            filename = url.split("/")[-1] or "downloaded_file.csv"

        # Validate extension
        if not FileConverter.is_supported(filename):
            raise ValueError(
                f"Unsupported file format. Supported: CSV, XLSX, XLS, TSV"
            )

        # Save to temp file
        ext = FileConverter.get_extension(filename)
        temp_path = ""
        csv_path = ""

        try:
            with tempfile.NamedTemporaryFile(suffix=ext, delete=False) as tmp:
                tmp.write(response.content)
                temp_path = tmp.name

            # Validate size
            file_size = os.path.getsize(temp_path)
            max_bytes = settings.MAX_CONTENT_LENGTH_MB * 1024 * 1024
            if file_size > max_bytes:
                raise ValueError(
                    f"File size ({file_size / 1024 / 1024:.1f} MB) exceeds "
                    f"the maximum limit of {settings.MAX_CONTENT_LENGTH_MB} MB."
                )

            if file_size == 0:
                raise ValueError("Downloaded file is empty.")

            # Generate hash
            sha256_hash = generate_sha256(temp_path)

            # Duplicate check
            existing = await self.repo.get_upload_by_hash(sha256_hash)
            if existing:
                return {
                    "upload_id": None,
                    "filename": filename,
                    "status": "rejected",
                    "reason": "Duplicate file already exists",
                }

            # Convert to CSV if needed
            with tempfile.NamedTemporaryFile(suffix=".csv", delete=False) as csv_tmp:
                csv_path = csv_tmp.name
            FileConverter.convert_to_csv(temp_path, csv_path)

            # Upload to Supabase
            upload_id = uuid4()
            supabase_path = f"{case_id}/{upload_id}-{filename}"
            supabase_url = storage_service.upload_file(csv_path, supabase_path)

            # Persist metadata
            uploaded_at = datetime.utcnow()
            metadata = UploadMetadata(
                upload_id=upload_id,
                case_id=case_id,
                source_type=SourceType.UNKNOWN,
                operator=Operator.UNKNOWN,
                original_filename=filename,
                stored_filename=filename,
                sha256=sha256_hash,
                mime_type="text/csv",
                file_size_bytes=file_size,
                uploaded_by=uploaded_by,
                uploaded_at=uploaded_at,
                supabase_path=supabase_path,
                supabase_url=supabase_url,
                display_name=filename,
                upload_status="uploaded",
                file_source="url",
            )

            await self.repo.create_upload_metadata(metadata)
            await self.db_session.commit()

            # Enqueue background ingestion
            await ingest_queue.enqueue(upload_id, case_id, supabase_path)

            return {
                "upload_id": str(upload_id),
                "filename": filename,
                "status": "uploaded",
                "message": "File uploaded and queued for processing",
            }

        finally:
            for path in [temp_path, csv_path]:
                if path and os.path.exists(path):
                    os.remove(path)

    async def _process_single_file(
        self, file: Any, case_id: str, uploaded_by: str
    ) -> dict[str, Any]:
        """
        Processes a single file upload through the full pipeline.
        """
        logger.info("upload_started", filename=file.filename, case_id=case_id)

        try:
            # 1. Validate file constraints
            ext = await validate_uploaded_file(file, max_size_mb=settings.MAX_CONTENT_LENGTH_MB)
        except ValueError as e:
            return {
                "upload_id": None,
                "filename": file.filename,
                "status": "rejected",
                "reason": str(e),
            }

        # 2. Save to temp file
        temp_path = ""
        csv_path = ""

        try:
            with tempfile.NamedTemporaryFile(suffix=ext, delete=False) as tmp:
                temp_path = tmp.name
            file_size = await save_uploaded_file(file, temp_path)

            # 3. Generate SHA-256 hash
            sha256_hash = generate_sha256(temp_path)

            # 4. Duplicate check
            existing = await self.repo.get_upload_by_hash(sha256_hash)
            if existing:
                return {
                    "upload_id": None,
                    "filename": file.filename,
                    "status": "rejected",
                    "reason": "Duplicate file already exists",
                }

            # 5. Convert to CSV if needed
            with tempfile.NamedTemporaryFile(suffix=".csv", delete=False) as csv_tmp:
                csv_path = csv_tmp.name
            FileConverter.convert_to_csv(temp_path, csv_path)

            # 6. Upload to Supabase
            upload_id = uuid4()
            stored_name = safe_filename(file.filename)
            supabase_path = f"{case_id}/{upload_id}-{stored_name}"
            supabase_url = storage_service.upload_file(csv_path, supabase_path)

            # 7. Persist metadata
            uploaded_at = datetime.utcnow()
            metadata = UploadMetadata(
                upload_id=upload_id,
                case_id=case_id,
                source_type=SourceType.UNKNOWN,
                operator=Operator.UNKNOWN,
                original_filename=file.filename,
                stored_filename=stored_name,
                sha256=sha256_hash,
                mime_type=file.content_type or "text/csv",
                file_size_bytes=file_size,
                uploaded_by=uploaded_by,
                uploaded_at=uploaded_at,
                supabase_path=supabase_path,
                supabase_url=supabase_url,
                display_name=file.filename,
                upload_status="uploaded",
                file_source="local",
            )

            await self.repo.create_upload_metadata(metadata)
            await self.db_session.commit()

            # 8. Enqueue background ingestion
            await ingest_queue.enqueue(upload_id, case_id, supabase_path)

            return {
                "upload_id": str(upload_id),
                "filename": file.filename,
                "status": "uploaded",
                "message": "File uploaded and queued for processing",
            }

        except Exception as e:
            logger.error("upload_failed", filename=file.filename, error=str(e))
            return {
                "upload_id": None,
                "filename": file.filename,
                "status": "failed",
                "reason": str(e),
            }

        finally:
            for path in [temp_path, csv_path]:
                if path and os.path.exists(path):
                    os.remove(path)

    async def handle_upload(
        self,
        file: Any,
        case_id: str,
        uploaded_by: str
    ) -> dict[str, Any]:
        """
        Legacy single-file upload handler. Wraps _process_single_file.
        """
        result = await self._process_single_file(file, case_id, uploaded_by)
        return result
