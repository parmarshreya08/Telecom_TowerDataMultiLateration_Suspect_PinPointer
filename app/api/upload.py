"""
Upload Controller Router.
Exposes POST /api/upload and POST /api/case/{case_id}/upload endpoints.
"""

from typing import Any

from fastapi import APIRouter, Depends, File, Form, HTTPException, UploadFile, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.logging import logger
from app.database.session import get_db_session
from app.services.upload_service import UploadService

router = APIRouter()


@router.post(
    "/api/upload",
    status_code=status.HTTP_201_CREATED,
    summary="Upload and classify telecom logs (legacy single-file)",
)
async def upload_telecom_file(
    file: UploadFile = File(..., description="Multipart CSV CDR or spot/tower dump file"),
    case_id: str = Form(..., description="Reference investigation code"),
    uploaded_by: str = Form(..., description="Officer or agent executing the upload"),
    db: AsyncSession = Depends(get_db_session)
) -> dict[str, Any]:
    """
    Legacy single-file upload endpoint.
    """
    logger.info("api_upload_request_received", filename=file.filename, case_id=case_id)

    # Validate case exists
    from app.database.repository import TelecomRepository
    repo = TelecomRepository(db)
    case = await repo.get_case_by_id(case_id)
    if not case:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Case '{case_id}' not found. Create the case before uploading files.",
        )

    service = UploadService(db)

    try:
        response_data = await service.handle_upload(
            file=file,
            case_id=case_id,
            uploaded_by=uploaded_by
        )
        return response_data

    except ValueError as ex:
        logger.warning("api_upload_validation_failed", error=str(ex))
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(ex))
    except PermissionError as ex:
        logger.error("api_upload_permission_denied", error=str(ex))
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Storage write access denied.")
    except OSError as ex:
        logger.error("api_upload_storage_failure", error=str(ex))
        raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail=f"Storage write failure: {ex}")
    except RuntimeError as ex:
        logger.error("api_upload_runtime_failure", error=str(ex))
        detail_msg = str(ex)
        status_code = status.HTTP_422_UNPROCESSABLE_ENTITY if "Detector" in detail_msg else status.HTTP_500_INTERNAL_SERVER_ERROR
        raise HTTPException(status_code=status_code, detail=detail_msg)
    except Exception as ex:
        logger.error("api_upload_unexpected_failure", error=str(ex))
        raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail="Unexpected error occurred.")


@router.post(
    "/api/case/{case_id}/upload",
    status_code=status.HTTP_201_CREATED,
    summary="Upload multiple files to a case",
)
async def upload_multiple_files(
    case_id: str,
    files: list[UploadFile] = File(..., description="Multiple CSV/XLSX/XLS/TSV files"),
    uploaded_by: str = Form("Officer", description="Officer or agent executing the upload"),
    db: AsyncSession = Depends(get_db_session),
) -> dict[str, Any]:
    """
    Uploads multiple files to a case. Each file is validated, saved to Supabase,
    and enqueued for background ingestion.
    Returns per-file results.
    """
    logger.info("api_multipart_upload_request", case_id=case_id, file_count=len(files))

    # Debug: log received form fields
    for i, f in enumerate(files):
        logger.info(f"upload_file_{i}", filename=f.filename, content_type=f.content_type, size=f.size)

    # Enforce max files per upload
    MAX_FILES = 10
    if len(files) > MAX_FILES:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Maximum {MAX_FILES} files per upload. You uploaded {len(files)}.",
        )

    # Validate case exists
    from app.database.repository import TelecomRepository
    repo = TelecomRepository(db)
    case = await repo.get_case_by_id(case_id)
    if not case:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Case '{case_id}' not found. Create the case before uploading files.",
        )

    service = UploadService(db)

    try:
        results = await service.handle_multipart_upload(
            files=files,
            case_id=case_id,
            uploaded_by=uploaded_by,
        )

        return {
            "case_id": case_id,
            "results": results,
            "total": len(results),
            "successful": sum(1 for r in results if r.get("status") == "uploaded"),
            "rejected": sum(1 for r in results if r.get("status") == "rejected"),
            "failed": sum(1 for r in results if r.get("status") == "failed"),
        }

    except ValueError as ex:
        logger.warning("api_upload_validation_failed", error=str(ex))
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(ex))
    except Exception as ex:
        logger.error("api_upload_unexpected_failure", error=str(ex))
        raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail="Unexpected error occurred.")
