"""
Health check endpoints for E-Rakshak API.
Validates database connectivity and service environment metrics.
"""

from typing import Any
from fastapi import APIRouter, status, Response

from app.core.logging import logger
from app.database.session import check_database_connection

router = APIRouter()


@router.get(
    "/health",
    status_code=status.HTTP_200_OK,
    summary="Perform a system health check",
    response_description="Detailed service connectivity status"
)
async def health_check(response: Response) -> dict[str, Any]:
    """
    Checks operational indicators of the application, including DB availability.
    """
    db_healthy = await check_database_connection()
    
    status_str = "healthy" if db_healthy else "degraded"
    
    if not db_healthy:
        response.status_code = status.HTTP_503_SERVICE_UNAVAILABLE
        logger.error("system_health_check_failed", database="unreachable")
    else:
        logger.info("system_health_check_passed", database="connected")

    from datetime import datetime, timezone
    return {
        "status": status_str,
        "database": "connected" if db_healthy else "unreachable",
        "timestamp": datetime.now(timezone.utc).isoformat()
    }
