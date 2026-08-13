"""
Authentication API endpoints for E-Rakshak.
Handles officer registration, login, logout, logout-all, and session info.
"""

from datetime import timedelta
from uuid import uuid4

from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel, EmailStr, Field
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
    officer_id: str
    officer_name: str
    email: str
    created_at: str


class AuthResponse(BaseModel):
    access_token: str
    token_type: str = "bearer"
    expires_in: int
    officer: OfficerResponse


@router.post(
    "/register",
    status_code=status.HTTP_201_CREATED,
    summary="Register a new officer account",
)
async def register_officer(
    body: RegisterRequest,
    db: AsyncSession = Depends(get_db_session),
) -> AuthResponse:
    """
    Create a new officer account. Email must be unique.
    Returns access token and officer info on success.
    """
    # Check if email already exists
    stmt = select(OfficerModel).where(OfficerModel.email == body.email)
    result = await db.execute(stmt)
    if result.scalar_one_or_none():
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="An account with this email already exists.",
        )

    # Create officer
    password_hash = hash_password(body.password)
    officer = OfficerModel(
        officer_id=uuid4(),
        officer_name=body.officer_name,
        email=body.email,
        password_hash=password_hash,
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
        officer=OfficerResponse(
            officer_id=str(officer.officer_id),
            officer_name=officer.officer_name,
            email=officer.email,
            created_at=officer.created_at.isoformat(),
        ),
    )


@router.post(
    "/login",
    status_code=status.HTTP_200_OK,
    summary="Authenticate officer and issue access token",
)
async def login(
    body: LoginRequest,
    db: AsyncSession = Depends(get_db_session),
) -> AuthResponse:
    """
    Authenticate officer with email and password.
    Returns access token and officer info on success.
    """
    stmt = select(OfficerModel).where(OfficerModel.email == body.email)
    result = await db.execute(stmt)
    officer = result.scalar_one_or_none()

    if not officer or not verify_password(body.password, officer.password_hash):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid email or password.",
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
    await db.commit()

    access_token = create_access_token(str(officer.officer_id), jti)

    return AuthResponse(
        access_token=access_token,
        expires_in=ACCESS_TOKEN_EXPIRE_MINUTES * 60,
        officer=OfficerResponse(
            officer_id=str(officer.officer_id),
            officer_name=officer.officer_name,
            email=officer.email,
            created_at=officer.created_at.isoformat(),
        ),
    )


@router.post(
    "/logout",
    status_code=status.HTTP_200_OK,
    summary="Log out current session (revoke current JWT)",
)
async def logout(
    session: AuthSessionModel = Depends(get_current_session),
    db: AsyncSession = Depends(get_db_session),
) -> dict[str, str]:
    """
    Revoke the current session (the JWT used for this request).
    """
    session.revoked_at = now_ist()
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
    Return the authenticated officer's info.
    """
    return OfficerResponse(
        officer_id=str(officer.officer_id),
        officer_name=officer.officer_name,
        email=officer.email,
        created_at=officer.created_at.isoformat(),
    )