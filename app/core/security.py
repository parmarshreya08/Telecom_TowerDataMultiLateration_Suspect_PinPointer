"""
Security utilities for E-Rakshak: password hashing and JWT token management.
"""

import secrets
from datetime import datetime, timedelta, timezone
from typing import Optional

import bcrypt
import jwt

from app.core.config import settings


# JWT configuration
JWT_SECRET: str = settings.API_KEY_SECRET
JWT_ALGORITHM: str = "HS256"
ACCESS_TOKEN_EXPIRE_MINUTES: int = 24 * 60  # 24 hours


def hash_password(password: str) -> str:
    """
    Hash a password using bcrypt with cost factor 12.
    Returns the hash as a UTF-8 string.
    Enforces the 72-byte bcrypt limit up front (returns 422 upstream).
    """
    pw_bytes = password.encode("utf-8")
    if len(pw_bytes) > 72:
        raise ValueError("Password must be at most 72 bytes.")
    salt = bcrypt.gensalt(rounds=12)
    hashed = bcrypt.hashpw(pw_bytes, salt)
    return hashed.decode("utf-8")


def verify_password(password: str, password_hash: str) -> bool:
    """
    Verify a plaintext password against a bcrypt hash.
    """
    try:
        return bcrypt.checkpw(password.encode("utf-8"), password_hash.encode("utf-8"))
    except Exception:
        return False


def create_access_token(officer_id: str, jti: str) -> str:
    """
    Create a signed JWT access token.
    Includes officer_id (sub), jti (session ID), and expiration.
    """
    now = datetime.now(timezone.utc)
    expire = now + timedelta(minutes=ACCESS_TOKEN_EXPIRE_MINUTES)
    payload = {
        "sub": str(officer_id),
        "jti": jti,
        "iat": int(now.timestamp()),
        "exp": int(expire.timestamp()),
    }
    return jwt.encode(payload, JWT_SECRET, algorithm=JWT_ALGORITHM)


def decode_token(token: str) -> Optional[dict]:
    """
    Decode and validate a JWT. Returns payload dict or None if invalid/expired.
    """
    try:
        payload = jwt.decode(token, JWT_SECRET, algorithms=[JWT_ALGORITHM])
        return payload
    except jwt.ExpiredSignatureError:
        return None
    except jwt.InvalidTokenError:
        return None


def generate_jti() -> str:
    """
    Generate a unique JWT ID for session tracking.
    """
    return secrets.token_urlsafe(32)


def create_refresh_token(officer_id: str, jti: str) -> str:
    """
    Create a long-lived refresh token (unused for now — access token only).
    Kept for future use if we add refresh flow.
    """
    now = datetime.now(timezone.utc)
    expire = now + timedelta(days=30)
    payload = {
        "sub": str(officer_id),
        "jti": jti,
        "type": "refresh",
        "iat": int(now.timestamp()),
        "exp": int(expire.timestamp()),
    }
    return jwt.encode(payload, JWT_SECRET, algorithm=JWT_ALGORITHM)