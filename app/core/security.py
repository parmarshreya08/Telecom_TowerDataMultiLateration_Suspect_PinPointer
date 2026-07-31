"""
Security module containing authorization dependencies.
Implements simple API key authentication for secure upload ingestion.
"""

from fastapi import HTTPException, Security, status
from fastapi.security import APIKeyHeader

from app.core.config import settings
from app.core.logging import logger

API_KEY_NAME = "X-API-Key"
api_key_header = APIKeyHeader(name=API_KEY_NAME, auto_error=False)


async def verify_api_key(
    api_key: str = Security(api_key_header)
) -> str:
    """
    Dependency injection handler to verify API key in headers.
    
    Args:
        api_key: The token extracted from the request headers.

    Returns:
        The verified API key.

    Raises:
        HTTPException: If the key is missing or invalid.
    """
    if not api_key:
        logger.warning("unauthorized_access_attempt", reason="missing_api_key")
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Missing API Key header (X-API-Key)",
        )

    if api_key != settings.API_KEY_SECRET:
        logger.warning("unauthorized_access_attempt", reason="invalid_api_key")
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Invalid API Key",
        )

    return api_key
