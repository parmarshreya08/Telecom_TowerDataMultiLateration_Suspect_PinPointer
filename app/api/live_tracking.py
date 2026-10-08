from fastapi import APIRouter, HTTPException, Depends
from pydantic import BaseModel
from typing import Dict, Any

from app.core.logging import logger
from app.services.mock_tsp_service import mock_tsp_service
from app.services.alert_service import alert_service
from app.core.security import decode_token
from app.core.deps import require_inspector_or_admin
from app.database.models import OfficerModel

router = APIRouter(prefix="/api/v1/live-tracking", tags=["live-tracking"])

class StartTrackingRequest(BaseModel):
    imsi: str

@router.post("/start")
async def start_live_tracking(
    request: StartTrackingRequest,
    officer: OfficerModel = Depends(require_inspector_or_admin),
):
    """
    Start tracking a specific IMSI.
    This simulates subscribing to a TSP for live data.
    Requires an authenticated officer (no anonymous token minting).
    """
    case_id = f"LIVE-{request.imsi}"
    logger.info(f"Starting live tracking for IMSI {request.imsi} (Case: {case_id})")
    await mock_tsp_service.start_tracking(case_id, request.imsi)
    
    # Generate a demo link immediately for easy testing
    token = alert_service.generate_tracking_token(case_id)
    demo_link = f"/t/{token}"
    
    return {
        "status": "success", 
        "message": "Tracking started successfully",
        "demo_link": demo_link,
        "token": token
    }

class StopTrackingRequest(BaseModel):
    imsi: str

@router.post("/stop")
async def stop_live_tracking(
    request: StopTrackingRequest,
    officer: OfficerModel = Depends(require_inspector_or_admin),
):
    """
    Stop tracking a specific IMSI.
    """
    case_id = f"LIVE-{request.imsi}"
    logger.info(f"Stopping live tracking for IMSI {request.imsi} (Case: {case_id})")
    await mock_tsp_service.stop_tracking(case_id, request.imsi)
    return {"status": "success", "message": "Tracking stopped successfully"}

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
