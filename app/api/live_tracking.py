from typing import Optional

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from typing import Dict, Any

from app.core.logging import logger
from app.services.mock_tsp_service import mock_tsp_service
from app.services.alert_service import alert_service
from app.services.live_tracking_service import LiveTrackingService
from app.core.security import decode_token
from app.core.deps import check_case_access, require_inspector_or_admin
from app.database.models import OfficerModel
from app.database.models.live_tracking import LiveTrackingSession
from app.database.models.telecom import CaseModel
from app.database.session import get_db_session

router = APIRouter(prefix="/api/v1/live-tracking", tags=["live-tracking"])


class StartTrackingRequest(BaseModel):
    # Optional override; defaults to the case's mobile_number (digits only).
    imsi: Optional[str] = Field(default=None, max_length=20)


class StopTrackingRequest(BaseModel):
    imsi: Optional[str] = Field(default=None, max_length=20)


def _imsi_for_case(case: CaseModel, override: Optional[str]) -> str:
    if override and override.strip():
        return "".join(c for c in override if c.isdigit()) or override.strip()
    digits = "".join(c for c in (case.mobile_number or "") if c.isdigit())
    if not digits:
        raise HTTPException(
            status_code=422,
            detail="This case has no mobile number. Add one before enabling live tracking.",
        )
    return digits


async def _get_case_or_404(case_id: str, db: AsyncSession) -> CaseModel:
    case = (
        await db.execute(select(CaseModel).where(CaseModel.case_id == case_id))
    ).scalar_one_or_none()
    if case is None:
        raise HTTPException(status_code=404, detail="Investigation not found.")
    return case


@router.post("/{case_id}/start")
async def start_live_tracking(
    case_id: str,
    request: StartTrackingRequest,
    officer: OfficerModel = Depends(require_inspector_or_admin),
    db: AsyncSession = Depends(get_db_session),
):
    """
    Enable live tracking for an investigation case. The target identity comes
    from the case itself (cases.mobile_number), like the normal CDR flow —
    there is no free-floating IMSI box.
    """
    await check_case_access(case_id, officer, db)
    case = await _get_case_or_404(case_id, db)
    imsi = _imsi_for_case(case, request.imsi)

    logger.info(f"Starting live tracking for case {case_id}, target {imsi}")
    await mock_tsp_service.start_tracking(case_id, imsi)

    # Ground-officer link (signed, 2h) for the lightweight /t/ field view.
    token = alert_service.generate_tracking_token(case_id)
    demo_link = f"/t/{token}"

    return {
        "status": "success",
        "message": "Tracking started successfully",
        "case_id": case_id,
        "imsi": imsi,
        "demo_link": demo_link,
        "token": token,
    }


@router.post("/{case_id}/stop")
async def stop_live_tracking(
    case_id: str,
    request: StopTrackingRequest,
    officer: OfficerModel = Depends(require_inspector_or_admin),
    db: AsyncSession = Depends(get_db_session),
):
    """Disable live tracking for an investigation case."""
    await check_case_access(case_id, officer, db)
    case = await _get_case_or_404(case_id, db)
    imsi = _imsi_for_case(case, request.imsi)

    logger.info(f"Stopping live tracking for case {case_id}, target {imsi}")
    await mock_tsp_service.stop_tracking(case_id, imsi)
    LiveTrackingService._states.pop(LiveTrackingService._state_key(case_id, imsi), None)
    return {"status": "success", "message": "Tracking stopped successfully"}


@router.get("/{case_id}/status")
async def live_tracking_status(
    case_id: str,
    officer: OfficerModel = Depends(require_inspector_or_admin),
    db: AsyncSession = Depends(get_db_session),
) -> Dict[str, Any]:
    """Active live-tracking sessions for one investigation case."""
    await check_case_access(case_id, officer, db)
    await _get_case_or_404(case_id, db)
    rows = (
        await db.execute(
            select(LiveTrackingSession).where(
                LiveTrackingSession.case_id == case_id,
                LiveTrackingSession.is_active.is_(True),
            )
        )
    ).scalars().all()
    return {
        "case_id": case_id,
        "active": [{"imsi": r.imsi, "authorized_at": r.authorized_at.isoformat()} for r in rows],
    }


@router.get("/resolve-token/{token}")
async def resolve_tracking_token(token: str) -> Dict[str, Any]:
    """
    Resolve a tracking JWT token to get case details for the Ground Officer UI.
    No authentication required, the token acts as auth.
    """
    payload = decode_token(token)
    if not payload or payload.get("type") != "live_tracking":
        raise HTTPException(status_code=401, detail="Invalid or expired tracking token")

    case_id = payload.get("case_id")
    if not case_id:
        raise HTTPException(status_code=400, detail="Invalid token payload")

    return {
        "case_id": case_id,
        "status": "active",
        "message": "Valid token"
    }
