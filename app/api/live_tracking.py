from fastapi import APIRouter, HTTPException, Depends
from pydantic import BaseModel
from typing import Dict, Any

from app.core.logging import logger
from app.services.mock_tsp_service import mock_tsp_service
from app.services.alert_service import alert_service
from app.core.security import decode_token
from app.api.dependencies.auth import get_current_user

router = APIRouter(prefix="/api/v1/live-tracking", tags=["live-tracking"])

class StartTrackingRequest(BaseModel):
    msisdn: str

@router.post("/{case_id}/start")
async def start_live_tracking(case_id: str, request: StartTrackingRequest):
    """
    Start tracking a specific MSISDN for a given case.
    This simulates subscribing to a TSP for live data.
    """
    logger.info(f"Starting live tracking for case {case_id}, msisdn {request.msisdn}")
    mock_tsp_service.start_tracking(case_id, request.msisdn)
    
    # Generate a demo link immediately for easy testing
    token = alert_service.generate_tracking_token(case_id)
    demo_link = f"/t/{token}"
    
    return {
        "status": "success", 
        "message": "Tracking started successfully",
        "demo_link": demo_link,
        "token": token
    }

@router.post("/{case_id}/stop")
async def stop_live_tracking(case_id: str):
    """
    Stop tracking a specific case.
    """
    logger.info(f"Stopping live tracking for case {case_id}")
    mock_tsp_service.stop_tracking(case_id)
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
        
    # Here you'd fetch case details from DB.
    # For demo purposes, we return a mock object.
    return {
        "case_id": case_id,
        "status": "active",
        "message": "Valid token"
    }
