"""
Upload Controller Router.
Exposes POST /api/upload and POST /api/case/{case_id}/upload endpoints.
Enforces case authorization and records audit trail.
"""

from typing import Any

from fastapi import APIRouter, Depends, File, Form, HTTPException, Request, UploadFile, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.deps import check_case_access, get_current_officer
from app.core.logging import logger
from app.database.models import OfficerModel
from app.database.session import get_db_session
from app.services.audit_service import record_audit_event
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
    req: Request = None,
    officer: OfficerModel = Depends(get_current_officer),
    db: AsyncSession = Depends(get_db_session),
) -> dict[str, Any]:
    """
    Legacy single-file upload endpoint with case authorization and audit logging.
    """
    await check_case_access(case_id, officer, db)
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
            uploaded_by=uploaded_by or officer.officer_name,
        )

        await record_audit_event(
            db=db,
            action="FILE_UPLOADED",
            actor_id=officer.officer_id,
            actor_name=officer.officer_name,
            actor_email=officer.email,
            actor_role=officer.role,
            case_id=case_id,
            details={"filename": file.filename, "upload_id": response_data.get("upload_id")},
            ip_address=req.client.host if req and req.client else None,
        )
        await db.commit()

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
    req: Request = None,
    officer: OfficerModel = Depends(get_current_officer),
    db: AsyncSession = Depends(get_db_session),
) -> dict[str, Any]:
    """
    Uploads multiple files to a case. Each file is validated, saved to Supabase,
    and enqueued for background ingestion. Enforces case RBAC.
    """
    await check_case_access(case_id, officer, db)
    logger.info("api_multipart_upload_request", case_id=case_id, file_count=len(files))

    MAX_FILES = 10
    if len(files) > MAX_FILES:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Maximum {MAX_FILES} files per upload. You uploaded {len(files)}.",
        )

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
            uploaded_by=uploaded_by or officer.officer_name,
        )

        successful_count = sum(1 for r in results if r.get("status") == "uploaded")
        await record_audit_event(
            db=db,
            action="FILE_UPLOADED",
            actor_id=officer.officer_id,
            actor_name=officer.officer_name,
            actor_email=officer.email,
            actor_role=officer.role,
            case_id=case_id,
            details={"file_count": len(files), "successful": successful_count},
            ip_address=req.client.host if req and req.client else None,
        )
        await db.commit()

        return {
            "case_id": case_id,
            "results": results,
            "total": len(results),
            "successful": successful_count,
            "rejected": sum(1 for r in results if r.get("status") == "rejected"),
            "failed": sum(1 for r in results if r.get("status") == "failed"),
        }

    except ValueError as ex:
        logger.warning("api_upload_validation_failed", error=str(ex))
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(ex))
    except Exception as ex:
        logger.error("api_upload_unexpected_failure", error=str(ex))
        raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail="Unexpected error occurred.")
