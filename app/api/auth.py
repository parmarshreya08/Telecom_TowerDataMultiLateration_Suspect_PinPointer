"""
Authentication API endpoints for E-Rakshak.
Handles officer registration, login, logout, logout-all, and session info.
"""

from datetime import timedelta
from typing import Any
from uuid import uuid4

from fastapi import APIRouter, Depends, HTTPException, Request, status
from pydantic import BaseModel, EmailStr, Field, field_validator
from sqlalchemy import select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.security import (
    ACCESS_TOKEN_EXPIRE_MINUTES,
    create_access_token,
    hash_password,
    verify_password,
    generate_jti,
)
from app.core.deps import get_current_officer, get_current_session
from app.database.models import OfficerModel, AuthSessionModel
from app.database.session import get_db_session
from app.services.audit_service import record_audit_event
from app.utils.datetime_utils import now_ist

router = APIRouter(prefix="/api/auth", tags=["authentication"])


class RegisterRequest(BaseModel):
    officer_name: str = Field(..., min_length=1, max_length=255)
    email: EmailStr
    password: str = Field(..., min_length=8, max_length=72)


class LoginRequest(BaseModel):
    email: EmailStr
    password: str = Field(..., min_length=1)


class OfficerResponse(BaseModel):
    id: str
    officer_id: str
    officer_name: str
    name: str
    email: str
    role: str
    is_active: bool
    created_at: str
    map_theme: str = "dark"
    preferences: dict[str, Any] = Field(default_factory=dict)


class AuthResponse(BaseModel):
    access_token: str
    token_type: str = "bearer"
    expires_in: int
    officer: OfficerResponse


class PreferencesUpdateRequest(BaseModel):
    map_theme: str | None = Field(default=None, max_length=32)
    preferences: dict[str, Any] | None = None

    @field_validator("map_theme")
    @classmethod
    def validate_theme(cls, v: str | None) -> str | None:
        if v is None:
            return v
        allowed = {"dark", "light", "satellite", "terrain", "navy", "night"}
        if v not in allowed:
            raise ValueError(f"Invalid map_theme. Allowed: {sorted(allowed)}.")
        return v

    @field_validator("preferences")
    @classmethod
    def validate_preferences(cls, v: dict[str, Any] | None) -> dict[str, Any] | None:
        if v is None:
            return v
        if len(v) > 32:
            raise ValueError("Too many preference keys (max 32).")
        for k, val in v.items():
            if len(str(k)) > 64:
                raise ValueError("Preference key too long.")
            if isinstance(val, str) and len(val) > 512:
                raise ValueError("Preference value too long.")
            if not isinstance(val, (str, int, float, bool, type(None))):
                raise ValueError("Preference values must be JSON scalars.")
        return v


def _to_officer_response(officer: OfficerModel) -> OfficerResponse:
    return OfficerResponse(
        id=str(officer.officer_id),
        officer_id=str(officer.officer_id),
        officer_name=officer.officer_name,
        name=officer.officer_name,
        email=officer.email,
        role=officer.role,
        is_active=officer.is_active,
        created_at=officer.created_at.isoformat(),
        map_theme=getattr(officer, "map_theme", "dark") or "dark",
        preferences=getattr(officer, "preferences", {}) or {},
    )


@router.post(
    "/register",
    status_code=status.HTTP_201_CREATED,
    summary="Register a new officer account",
)
async def register_officer(
    body: RegisterRequest,
    req: Request,
    db: AsyncSession = Depends(get_db_session),
) -> AuthResponse:
    """
    Create a new officer account (default role INSPECTOR). Email must be unique.
    Returns access token and officer info on success.
    """
    email_clean = body.email.strip().lower()

    # Check if email already exists
    stmt = select(OfficerModel).where(OfficerModel.email == email_clean)
    result = await db.execute(stmt)
    if result.scalar_one_or_none():
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="An account with this email already exists.",
        )

    # Create officer with default role INSPECTOR
    try:
        password_hash = hash_password(body.password)
    except ValueError as ve:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail=str(ve),
        )
    officer = OfficerModel(
        officer_id=uuid4(),
        officer_name=body.officer_name.strip(),
        email=email_clean,
        password_hash=password_hash,
        role="INSPECTOR",
        is_active=True,
    )
    db.add(officer)
    await db.flush()

    # Create session
    jti = generate_jti()
    session = AuthSessionModel(
        session_id=uuid4(),
        officer_id=officer.officer_id,
        jti=jti,
        expires_at=now_ist() + timedelta(minutes=ACCESS_TOKEN_EXPIRE_MINUTES),
    )
    db.add(session)

    access_token = create_access_token(str(officer.officer_id), jti)

    await record_audit_event(
        db=db,
        action="USER_REGISTERED",
        actor_id=officer.officer_id,
        actor_name=officer.officer_name,
        actor_email=officer.email,
        actor_role=officer.role,
        target_resource=str(officer.officer_id),
        details={"email": officer.email, "role": officer.role},
        ip_address=req.client.host if req.client else None,
    )

    try:
        await db.commit()
    except IntegrityError:
        await db.rollback()
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="An account with this email already exists.",
        )

    return AuthResponse(
        access_token=access_token,
        expires_in=ACCESS_TOKEN_EXPIRE_MINUTES * 60,
        officer=_to_officer_response(officer),
    )


@router.post(
    "/login",
    status_code=status.HTTP_200_OK,
    summary="Authenticate officer and issue access token",
)
async def login(
    body: LoginRequest,
    req: Request,
    db: AsyncSession = Depends(get_db_session),
) -> AuthResponse:
    """
    Authenticate officer with email and password.
    Returns access token and officer info on success.
    Enforces active user check and records audit logs.
    """
    email_clean = body.email.strip().lower()
    stmt = select(OfficerModel).where(OfficerModel.email == email_clean)
    result = await db.execute(stmt)
    officer = result.scalar_one_or_none()

    if not officer or not verify_password(body.password, officer.password_hash):
        await record_audit_event(
            db=db,
            action="LOGIN_FAILURE",
            actor_name=officer.officer_name if officer else "Unknown",
            actor_email=email_clean,
            actor_role=officer.role if officer else "UNKNOWN",
            status="FAILURE",
            details={"reason": "Invalid credentials"},
            ip_address=req.client.host if req.client else None,
        )
        await db.commit()

        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid email or password.",
            headers={"WWW-Authenticate": "Bearer"},
        )

    # Inactive user check
    if not officer.is_active:
        await record_audit_event(
            db=db,
            action="LOGIN_FAILURE",
            actor_id=officer.officer_id,
            actor_name=officer.officer_name,
            actor_email=officer.email,
            actor_role=officer.role,
            status="DENIED",
            details={"reason": "Account is deactivated"},
            ip_address=req.client.host if req.client else None,
        )
        await db.commit()

        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Account is deactivated. Contact administrator.",
            headers={"WWW-Authenticate": "Bearer"},
        )

    # Create new session
    jti = generate_jti()
    session = AuthSessionModel(
        session_id=uuid4(),
        officer_id=officer.officer_id,
        jti=jti,
        expires_at=now_ist() + timedelta(minutes=ACCESS_TOKEN_EXPIRE_MINUTES),
    )
    db.add(session)

    await record_audit_event(
        db=db,
        action="LOGIN_SUCCESS",
        actor_id=officer.officer_id,
        actor_name=officer.officer_name,
        actor_email=officer.email,
        actor_role=officer.role,
        status="SUCCESS",
        details={"email": officer.email, "role": officer.role},
        ip_address=req.client.host if req.client else None,
    )

    await db.commit()

    access_token = create_access_token(str(officer.officer_id), jti)

    return AuthResponse(
        access_token=access_token,
        expires_in=ACCESS_TOKEN_EXPIRE_MINUTES * 60,
        officer=_to_officer_response(officer),
    )


@router.post(
    "/logout",
    status_code=status.HTTP_200_OK,
    summary="Log out current session (revoke current JWT)",
)
async def logout(
    session: AuthSessionModel = Depends(get_current_session),
    officer: OfficerModel = Depends(get_current_officer),
    db: AsyncSession = Depends(get_db_session),
) -> dict[str, str]:
    """
    Revoke the current session (the JWT used for this request).
    """
    session.revoked_at = now_ist()
    await record_audit_event(
        db=db,
        action="LOGOUT",
        actor_id=officer.officer_id,
        actor_name=officer.officer_name,
        actor_email=officer.email,
        actor_role=officer.role,
    )
    await db.commit()
    return {"message": "Logged out"}


@router.post(
    "/logout-all",
    status_code=status.HTTP_200_OK,
    summary="Log out all sessions for the current officer",
)
async def logout_all(
    officer: OfficerModel = Depends(get_current_officer),
    db: AsyncSession = Depends(get_db_session),
) -> dict[str, str]:
    """
    Revoke all sessions for the current officer (logout from all devices).
    """
    stmt = select(AuthSessionModel).where(
        AuthSessionModel.officer_id == officer.officer_id,
        AuthSessionModel.revoked_at.is_(None),
    )
    result = await db.execute(stmt)
    sessions = result.scalars().all()
    for s in sessions:
        s.revoked_at = now_ist()
    await record_audit_event(
        db=db,
        action="LOGOUT_ALL",
        actor_id=officer.officer_id,
        actor_name=officer.officer_name,
        actor_email=officer.email,
        actor_role=officer.role,
        details={"session_count": len(sessions)},
    )
    await db.commit()
    return {"message": f"Logged out from all {len(sessions)} devices"}


@router.get(
    "/me",
    status_code=status.HTTP_200_OK,
    summary="Get current officer information",
)
async def get_me(
    officer: OfficerModel = Depends(get_current_officer),
) -> OfficerResponse:
    """
    Return the authenticated officer's info, role, and active status.
    """
    return _to_officer_response(officer)


@router.patch(
    "/preferences",
    status_code=status.HTTP_200_OK,
    summary="Update officer UI preferences such as map theme",
)
async def update_preferences(
    body: PreferencesUpdateRequest,
    officer: OfficerModel = Depends(get_current_officer),
    db: AsyncSession = Depends(get_db_session),
) -> OfficerResponse:
    """
    Update preferences (map_theme, dashboard settings) for the current officer.
    """
    if body.map_theme is not None:
        officer.map_theme = body.map_theme.strip().lower()
    if body.preferences is not None:
        current_prefs = dict(officer.preferences or {})
        current_prefs.update(body.preferences)
        officer.preferences = current_prefs

    await db.commit()
    await db.refresh(officer)
    return _to_officer_response(officer)