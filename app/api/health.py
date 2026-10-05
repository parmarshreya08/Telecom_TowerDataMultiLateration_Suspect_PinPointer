"""
Health check endpoints for E-Rakshak API.
Validates database connectivity and service environment metrics.
"""

from typing import Any
from fastapi import APIRouter, status, Response

from app.core.config import settings
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

    from app.utils.datetime_utils import now_ist
    return {
        "status": status_str,
        "database": "connected" if db_healthy else "unreachable",
        "environment": settings.APP_ENV,
        "version": settings.APP_VERSION,
        "timestamp": now_ist().isoformat(),
    }


@router.get(
    "/health/live",
    status_code=status.HTTP_200_OK,
    summary="Liveness probe",
    response_description="Process is running",
)
async def liveness() -> dict[str, str]:
    """Liveness probe — returns 200 as long as the process can serve requests.

    Deliberately does NOT touch the database so orchestrators can distinguish
    "process hung" from "dependency down".
    """
    return {"status": "alive"}


@router.get(
    "/health/ready",
    status_code=status.HTTP_200_OK,
    summary="Readiness probe",
    response_description="Dependencies are reachable",
)
async def readiness(response: Response) -> dict[str, Any]:
    """Readiness probe — 503 until the database is reachable."""
    db_healthy = await check_database_connection()
    if not db_healthy:
        response.status_code = status.HTTP_503_SERVICE_UNAVAILABLE
    return {
        "status": "ready" if db_healthy else "not_ready",
        "database": "connected" if db_healthy else "unreachable",
    }
