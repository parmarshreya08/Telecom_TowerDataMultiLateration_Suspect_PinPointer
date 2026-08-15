"""
FastAPI dependencies for E-Rakshak.
Provides token validation, database-backed officer resolution, and RBAC authorization guards.
"""

from typing import Optional
from uuid import UUID

from fastapi import Depends, HTTPException, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.security import decode_token
from app.database.models import OfficerModel, AuthSessionModel, CaseAssignmentModel
from app.database.models.telecom import CaseModel
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
        try:
            parsed_id = UUID(str(officer_id))
            stmt = stmt.where(AuthSessionModel.officer_id == parsed_id)
        except (ValueError, TypeError):
            return None
    result = await db.execute(stmt)
    return result.scalar_one_or_none()


async def get_current_officer(
    credentials: Optional[HTTPAuthorizationCredentials] = Depends(security),
    db: AsyncSession = Depends(get_db_session),
) -> OfficerModel:
    """
    Dependency that extracts and validates the Bearer token,
    resolving the fresh officer record directly from the database
    to ensure real-time enforcement of role and is_active status.
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

    officer_id_raw = payload.get("sub")
    jti = payload.get("jti")
    if not officer_id_raw or not jti:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid token payload",
            headers={"WWW-Authenticate": "Bearer"},
        )

    try:
        officer_id = UUID(str(officer_id_raw))
    except (ValueError, TypeError):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid officer identifier in token",
            headers={"WWW-Authenticate": "Bearer"},
        )

    # 1. Verify session exists, is not revoked, and has not expired
    session = await _load_valid_session(db, jti, str(officer_id))
    if not session:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Session revoked or expired",
            headers={"WWW-Authenticate": "Bearer"},
        )

    # 2. Load fresh officer record from database (source of truth for role & active status)
    stmt = select(OfficerModel).where(OfficerModel.officer_id == officer_id)
    result = await db.execute(stmt)
    officer = result.scalar_one_or_none()

    if not officer:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Officer not found",
            headers={"WWW-Authenticate": "Bearer"},
        )

    # 3. Reject deactivated accounts immediately
    if not officer.is_active:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Account is deactivated. Contact administrator.",
            headers={"WWW-Authenticate": "Bearer"},
        )

    return officer


async def require_authenticated_user(
    officer: OfficerModel = Depends(get_current_officer),
) -> OfficerModel:
    """Alias for get_current_officer ensuring user is active and authenticated."""
    return officer


async def require_admin(
    officer: OfficerModel = Depends(get_current_officer),
) -> OfficerModel:
    """
    Authorization guard requiring ADMIN role.
    Evaluated against real-time database state on each request.
    """
    if officer.role != "ADMIN":
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Administrator privileges required.",
        )
    return officer


async def require_inspector_or_admin(
    officer: OfficerModel = Depends(get_current_officer),
) -> OfficerModel:
    """
    Authorization guard allowing both INSPECTOR and ADMIN roles.
    """
    if officer.role not in ("ADMIN", "INSPECTOR"):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Access forbidden: Invalid role.",
        )
    return officer


async def check_case_access(
    case_id: str,
    officer: OfficerModel,
    db: AsyncSession,
) -> bool:
    """
    Verifies that the officer has authorization to access the specific investigation case:
    - ADMIN role: Global access to all cases.
    - INSPECTOR role: Access granted if assigned to the case or is the case creator.
    Raises 403 Forbidden if the inspector is not authorized.
    """
    if officer.role == "ADMIN":
        return True

    # Check case creator
    stmt_case = select(CaseModel).where(CaseModel.case_id == case_id)
    res_case = await db.execute(stmt_case)
    case = res_case.scalar_one_or_none()
    if case and (case.created_by == officer.officer_name or case.created_by == officer.email):
        return True

    # Check assignment
    stmt_assign = select(CaseAssignmentModel).where(
        CaseAssignmentModel.case_id == case_id,
        CaseAssignmentModel.officer_id == officer.officer_id,
    )
    res_assign = await db.execute(stmt_assign)
    assignment = res_assign.scalar_one_or_none()
    if assignment:
        return True

    raise HTTPException(
        status_code=status.HTTP_403_FORBIDDEN,
        detail="Access denied: You are not assigned to this investigation case.",
    )


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