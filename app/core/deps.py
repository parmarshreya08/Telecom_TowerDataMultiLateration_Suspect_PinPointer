"""
FastAPI dependencies for E-Rakshak.
"""

from typing import Optional

from fastapi import Depends, HTTPException, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.security import decode_token
from app.database.models import OfficerModel, AuthSessionModel
from app.database.session import get_db_session
from app.utils.datetime_utils import now_ist

security = HTTPBearer(auto_error=False)


async def _load_valid_session(db: AsyncSession, jti: str, officer_id: str | None) -> AuthSessionModel | None:
    """
    Load a non-revoked, non-expired session by JTI (and optionally officer_id).
    """
    stmt = select(AuthSessionModel).where(
        AuthSessionModel.jti == jti,
        AuthSessionModel.revoked_at.is_(None),
        AuthSessionModel.expires_at > now_ist(),
    )
    if officer_id is not None:
        stmt = stmt.where(AuthSessionModel.officer_id == officer_id)
    result = await db.execute(stmt)
    return result.scalar_one_or_none()


async def get_current_officer(
    credentials: Optional[HTTPAuthorizationCredentials] = Depends(security),
    db: AsyncSession = Depends(get_db_session),
) -> OfficerModel:
    """
    Dependency that extracts and validates the Bearer token,
    returning the authenticated officer.
    """
    if not credentials or credentials.scheme.lower() != "bearer":
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Missing or invalid Authorization header",
            headers={"WWW-Authenticate": "Bearer"},
        )

    token = credentials.credentials
    payload = decode_token(token)
    if not payload:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid or expired token",
            headers={"WWW-Authenticate": "Bearer"},
        )

    officer_id = payload.get("sub")
    jti = payload.get("jti")
    if not officer_id or not jti:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid token payload",
            headers={"WWW-Authenticate": "Bearer"},
        )

    # Verify session exists, is not revoked, and has not expired
    session = await _load_valid_session(db, jti, officer_id)

    if not session:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Session revoked or expired",
            headers={"WWW-Authenticate": "Bearer"},
        )

    # Load officer
    stmt = select(OfficerModel).where(OfficerModel.officer_id == officer_id)
    result = await db.execute(stmt)
    officer = result.scalar_one_or_none()

    if not officer:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Officer not found",
            headers={"WWW-Authenticate": "Bearer"},
        )

    return officer


async def get_current_session(
    credentials: Optional[HTTPAuthorizationCredentials] = Depends(security),
    db: AsyncSession = Depends(get_db_session),
) -> AuthSessionModel:
    """
    Dependency that returns the current session (for logout).
    """
    if not credentials or credentials.scheme.lower() != "bearer":
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Missing or invalid Authorization header",
            headers={"WWW-Authenticate": "Bearer"},
        )

    token = credentials.credentials
    payload = decode_token(token)
    if not payload:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid or expired token",
            headers={"WWW-Authenticate": "Bearer"},
        )

    jti = payload.get("jti")
    if not jti:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid token payload",
            headers={"WWW-Authenticate": "Bearer"},
        )

    session = await _load_valid_session(db, jti, None)

    if not session:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Session revoked or expired",
            headers={"WWW-Authenticate": "Bearer"},
        )

    return session