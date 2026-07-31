"""
Upload Controller Router.
Exposes POST /api/upload endpoint for ingestion.
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
    summary="Upload and classify telecom logs",
    response_description="Upload metadata and classification results"
)
async def upload_telecom_file(
    file: UploadFile = File(..., description="Multipart CSV CDR or spot/tower dump file"),
    case_id: str = Form(..., description="Reference investigation code"),
    uploaded_by: str = Form(..., description="Officer or agent executing the upload"),
    db: AsyncSession = Depends(get_db_session)
) -> dict[str, Any]:
    """
    Validates, streams to disk, checks for duplicate checksums, and executes column header detection.
    """
    logger.info("api_upload_request_received", filename=file.filename, case_id=case_id)

    # Instantiate UploadService
    service = UploadService(db)

    try:
        response_data = await service.handle_upload(
            file=file,
            case_id=case_id,
            uploaded_by=uploaded_by
        )
        return response_data

    except ValueError as ex:
        # Client validation failures (e.g. extension, empty file, mime, size)
        logger.warn("api_upload_validation_failed", error=str(ex))
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=str(ex)
        )
    except PermissionError as ex:
        # Storage permission access issues
        logger.error("api_upload_permission_denied", error=str(ex))
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Storage write access denied. Check system folder permissions."
        )
    except OSError as ex:
        # File storage disk full or system write failures
        logger.error("api_upload_storage_failure", error=str(ex))
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Storage write failure occurred: {str(ex)}"
        )
    except RuntimeError as ex:
        # Service level pipeline processing errors
        logger.error("api_upload_runtime_failure", error=str(ex))
        # Determine if it's a detector failure or DB failure
        detail_msg = str(ex)
        if "Detector" in detail_msg:
            status_code = status.HTTP_422_UNPROCESSABLE_ENTITY
        else:
            status_code = status.HTTP_500_INTERNAL_SERVER_ERROR
            
        raise HTTPException(
            status_code=status_code,
            detail=detail_msg
        )
    except Exception as ex:
        # Unexpected server-side failures
        logger.error("api_upload_unexpected_failure", error=str(ex))
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="An unexpected error occurred while processing the upload transaction."
        )
