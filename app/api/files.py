"""
File Management Router.
Exposes endpoints for file CRUD operations within cases.
"""

from typing import Any
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel, Field
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.logging import logger
from app.database.repository import TelecomRepository
from app.database.session import get_db_session
from app.services.supabase_storage import storage_service

router = APIRouter()


# Request Models

class UploadUrlRequest(BaseModel):
    url: str = Field(..., description="Direct URL to the file")
    filename: str = Field(default="", description="Optional filename override")


class RenameFileRequest(BaseModel):
    display_name: str = Field(..., min_length=1, max_length=255, description="New display name")


class BatchDeleteRequest(BaseModel):
    upload_ids: list[str] = Field(..., min_length=1, description="List of upload IDs to delete")


# Endpoints

@router.post(
    "/api/case/{case_id}/upload/url",
    status_code=status.HTTP_201_CREATED,
    summary="Upload a file from a direct URL",
)
async def upload_from_url(
    case_id: str,
    body: UploadUrlRequest,
    db: AsyncSession = Depends(get_db_session),
) -> dict[str, Any]:
    """
    Downloads a file from a direct URL, uploads to Supabase,
    and queues for background ingestion.
    """
    from app.services.upload_service import UploadService

    service = UploadService(db)
    try:
        # Validate case exists
        repo = TelecomRepository(db)
        case = await repo.get_case_by_id(case_id)
        if not case:
            raise HTTPException(
                status_code=404,
                detail=f"Case '{case_id}' not found. Create the case before uploading files.",
            )

        result = await service.handle_url_upload(
            url=body.url,
            filename=body.filename,
            case_id=case_id,
            uploaded_by="Officer",
        )
        return result
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))


@router.get(
    "/api/case/{case_id}/files",
    status_code=status.HTTP_200_OK,
    summary="List all files for a case",
)
async def list_case_files(
    case_id: str,
    db: AsyncSession = Depends(get_db_session),
) -> dict[str, Any]:
    """
    Returns all files registered to a case with their processing status.
    """
    repo = TelecomRepository(db)
    uploads = await repo.get_uploads_by_case(case_id)

    return {
        "case_id": case_id,
        "files": [
            {
                "upload_id": str(u.upload_id),
                "display_name": u.display_name or u.original_filename,
                "original_filename": u.original_filename,
                "file_size_bytes": u.file_size_bytes,
                "upload_status": u.upload_status,
                "error_message": u.error_message,
                "file_source": u.file_source,
                "operator": u.operator,
                "source_type": u.source_type,
                "uploaded_at": u.uploaded_at.isoformat(),
            }
            for u in uploads
        ],
        "total": len(uploads),
    }


@router.get(
    "/api/file/{upload_id}/status",
    status_code=status.HTTP_200_OK,
    summary="Get processing status of a file",
)
async def get_file_status(
    upload_id: str,
    db: AsyncSession = Depends(get_db_session),
) -> dict[str, Any]:
    """
    Returns the current processing status of an upload.
    Used for polling during background ingestion.
    """
    try:
        uid = UUID(upload_id)
    except ValueError:
        raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail=f"Invalid upload ID: {upload_id}")

    repo = TelecomRepository(db)
    upload = await repo.get_upload_by_id(uid)

    if not upload:
        raise HTTPException(status_code=404, detail=f"Upload '{upload_id}' not found.")

    return {
        "upload_id": str(upload.upload_id),
        "upload_status": upload.upload_status,
        "error_message": upload.error_message,
    }


@router.patch(
    "/api/file/{upload_id}",
    status_code=status.HTTP_200_OK,
    summary="Rename a file",
)
async def rename_file(
    upload_id: str,
    body: RenameFileRequest,
    db: AsyncSession = Depends(get_db_session),
) -> dict[str, Any]:
    """
    Updates the display name of an uploaded file.
    """
    try:
        uid = UUID(upload_id)
    except ValueError:
        raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail=f"Invalid upload ID: {upload_id}")

    repo = TelecomRepository(db)
    upload = await repo.get_upload_by_id(uid)

    if not upload:
        raise HTTPException(status_code=404, detail=f"Upload '{upload_id}' not found.")

    await repo.update_upload_display_name(uid, body.display_name)
    await db.commit()

    return {
        "upload_id": upload_id,
        "display_name": body.display_name,
        "message": "File renamed successfully",
    }


@router.delete(
    "/api/file/{upload_id}",
    status_code=status.HTTP_200_OK,
    summary="Delete a single file",
)
async def delete_file(
    upload_id: str,
    db: AsyncSession = Depends(get_db_session),
) -> dict[str, Any]:
    """
    Deletes a file from Supabase Storage and removes its metadata.
    """
    try:
        uid = UUID(upload_id)
    except ValueError:
        raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail=f"Invalid upload ID: {upload_id}")

    repo = TelecomRepository(db)
    upload = await repo.get_upload_by_id(uid)

    if not upload:
        raise HTTPException(status_code=404, detail=f"Upload '{upload_id}' not found.")

    # Delete from Supabase
    if upload.supabase_path:
        try:
            storage_service.delete_file(upload.supabase_path)
        except Exception as e:
            logger.warning("supabase_delete_failed", path=upload.supabase_path, error=str(e))

    # Delete from DB
    await repo.delete_upload(uid)
    await db.commit()

    return {
        "upload_id": upload_id,
        "message": "File deleted successfully",
    }


@router.post(
    "/api/case/{case_id}/files/batch-delete",
    status_code=status.HTTP_200_OK,
    summary="Delete multiple files",
)
async def batch_delete_files(
    case_id: str,
    body: BatchDeleteRequest,
    db: AsyncSession = Depends(get_db_session),
) -> dict[str, Any]:
    """
    Deletes multiple files at once.
    """
    repo = TelecomRepository(db)
    deleted = 0
    failed = 0

    for upload_id_str in body.upload_ids:
        try:
            upload = await repo.get_upload_by_id(UUID(upload_id_str))
            if upload and upload.case_id == case_id:
                if upload.supabase_path:
                    try:
                        storage_service.delete_file(upload.supabase_path)
                    except Exception as e:
                        logger.warning("supabase_delete_failed", path=upload.supabase_path, error=str(e))
                await repo.delete_upload(UUID(upload_id_str))
                deleted += 1
            else:
                failed += 1
        except Exception:
            failed += 1

    await db.commit()

    return {
        "case_id": case_id,
        "deleted": deleted,
        "failed": failed,
        "message": f"Deleted {deleted} files, {failed} failed",
    }


@router.delete(
    "/api/case/{case_id}/files",
    status_code=status.HTTP_200_OK,
    summary="Reinitialize case (delete all files)",
)
async def reinitialize_case(
    case_id: str,
    db: AsyncSession = Depends(get_db_session),
) -> dict[str, Any]:
    """
    Deletes ALL files for a case (reinitialize).
    Removes files from Supabase Storage and metadata from database.
    """
    repo = TelecomRepository(db)
    uploads = await repo.get_uploads_by_case(case_id)

    # Delete all from Supabase
    for upload in uploads:
        if upload.supabase_path:
            try:
                storage_service.delete_file(upload.supabase_path)
            except Exception as e:
                logger.warning("supabase_delete_failed_during_reinit", path=upload.supabase_path, error=str(e))

    # Delete all metadata
    count = await repo.delete_uploads_by_case(case_id)
    await db.commit()

    return {
        "case_id": case_id,
        "deleted_count": count,
        "message": f"All {count} files deleted. Case reinitialized.",
    }
