"""
Comprehensive Tests for E-Rakshak Authentication & Role-Based Access Control (RBAC).
Hermetic Unit Tests + Database-backed Integration Tests.
"""

from datetime import datetime, timedelta
from unittest.mock import AsyncMock, MagicMock
from uuid import uuid4
import pytest
from fastapi import HTTPException
from fastapi.testclient import TestClient
from sqlalchemy import select, delete

from app.core.deps import require_admin, require_inspector_or_admin, check_case_access, get_current_officer
from app.core.security import (
    hash_password,
    verify_password,
    create_access_token,
    decode_token,
    generate_jti,
    ACCESS_TOKEN_EXPIRE_MINUTES,
)
from app.database.models import OfficerModel, AuthSessionModel, CaseAssignmentModel, AuditLogModel
from app.database.models.telecom import CaseModel
from app.database.session import async_session_maker, check_database_connection
from app.main import app
from app.utils.datetime_utils import now_ist


# ── Hermetic Unit Tests (Execute Unconditionally) ────────────

def test_password_hashing_and_verification():
    pw = "SuperSecretPass123!"
    hashed = hash_password(pw)
    assert hashed != pw
    assert verify_password(pw, hashed) is True
    assert verify_password("WrongPass", hashed) is False


def test_jwt_token_generation_and_decoding():
    officer_id = str(uuid4())
    jti = generate_jti()
    token = create_access_token(officer_id, jti)
    assert isinstance(token, str)

    payload = decode_token(token)
    assert payload is not None
    assert payload["sub"] == officer_id
    assert payload["jti"] == jti
    assert "exp" in payload


@pytest.mark.asyncio
async def test_require_admin_guard():
    admin = OfficerModel(
        officer_id=uuid4(),
        officer_name="Admin User",
        email="admin@erakshak.gov.in",
        password_hash="hash",
        role="ADMIN",
        is_active=True,
    )
    # Should succeed for Admin
    res = await require_admin(admin)
    assert res.officer_id == admin.officer_id

    inspector = OfficerModel(
        officer_id=uuid4(),
        officer_name="Inspector User",
        email="inspector@erakshak.gov.in",
        password_hash="hash",
        role="INSPECTOR",
        is_active=True,
    )
    # Should raise 403 Forbidden for Inspector
    with pytest.raises(HTTPException) as exc_info:
        await require_admin(inspector)
    assert exc_info.value.status_code == 403
    assert "Administrator privileges required" in exc_info.value.detail


@pytest.mark.asyncio
async def test_require_inspector_or_admin_guard():
    admin = OfficerModel(
        officer_id=uuid4(),
        officer_name="Admin User",
        email="admin@erakshak.gov.in",
        password_hash="hash",
        role="ADMIN",
        is_active=True,
    )
    insp = OfficerModel(
        officer_id=uuid4(),
        officer_name="Inspector User",
        email="inspector@erakshak.gov.in",
        password_hash="hash",
        role="INSPECTOR",
        is_active=True,
    )
    other = OfficerModel(
        officer_id=uuid4(),
        officer_name="Guest User",
        email="guest@erakshak.gov.in",
        password_hash="hash",
        role="GUEST",
        is_active=True,
    )

    assert (await require_inspector_or_admin(admin)).role == "ADMIN"
    assert (await require_inspector_or_admin(insp)).role == "INSPECTOR"

    with pytest.raises(HTTPException) as exc_info:
        await require_inspector_or_admin(other)
    assert exc_info.value.status_code == 403


@pytest.mark.asyncio
async def test_check_case_access_admin_and_inspector():
    mock_db = AsyncMock()

    admin = OfficerModel(
        officer_id=uuid4(),
        officer_name="Admin User",
        email="admin@erakshak.gov.in",
        password_hash="hash",
        role="ADMIN",
        is_active=True,
    )
    # Admin gets unconditional access
    assert await check_case_access("CASE-123", admin, mock_db) is True

    # Inspector who is creator
    insp_creator = OfficerModel(
        officer_id=uuid4(),
        officer_name="Inspector Creator",
        email="creator@erakshak.gov.in",
        password_hash="hash",
        role="INSPECTOR",
        is_active=True,
    )
    mock_case = CaseModel(
        case_id="CASE-123",
        case_name="Case 123",
        case_number="CASE-123",
        created_by="Inspector Creator",
    )
    mock_result_case = MagicMock()
    mock_result_case.scalar_one_or_none.return_value = mock_case
    mock_db.execute.return_value = mock_result_case

    assert await check_case_access("CASE-123", insp_creator, mock_db) is True

    # Inspector who is NOT creator and NOT assigned
    insp_stranger = OfficerModel(
        officer_id=uuid4(),
        officer_name="Inspector Stranger",
        email="stranger@erakshak.gov.in",
        password_hash="hash",
        role="INSPECTOR",
        is_active=True,
    )
    mock_result_none = MagicMock()
    mock_result_none.scalar_one_or_none.return_value = None
    mock_db.execute.return_value = mock_result_none

    with pytest.raises(HTTPException) as exc_info:
        await check_case_access("CASE-123", insp_stranger, mock_db)
    assert exc_info.value.status_code == 403
    assert "not assigned" in exc_info.value.detail.lower()


# ── Database-Backed Integration Test Suite ───────────────────


@pytest.mark.asyncio
async def test_auth_rbac_database_integration(client: TestClient):
    try:
        if not await check_database_connection():
            pytest.skip("Database is unreachable; skipping RBAC integration tests.")
    except Exception:
        pytest.skip("Database is unreachable; skipping RBAC integration tests.")

    suffix = uuid4().hex[:6]
    admin_email = f"admin_{suffix}@erakshak.gov.in"
    inspector1_email = f"insp1_{suffix}@erakshak.gov.in"
    inspector2_email = f"insp2_{suffix}@erakshak.gov.in"
    password = "TestPassword123!"
    pw_hash = hash_password(password)

    case_1_id = f"CASE-ASSIGNED-{suffix}"
    case_2_id = f"CASE-UNASSIGNED-{suffix}"

    admin_id = uuid4()
    insp1_id = uuid4()
    insp2_id = uuid4()

    async with async_session_maker() as db:
        admin_officer = OfficerModel(
            officer_id=admin_id,
            officer_name=f"Admin {suffix}",
            email=admin_email,
            password_hash=pw_hash,
            role="ADMIN",
            is_active=True,
        )
        db.add(admin_officer)

        insp1_officer = OfficerModel(
            officer_id=insp1_id,
            officer_name=f"Inspector One {suffix}",
            email=inspector1_email,
            password_hash=pw_hash,
            role="INSPECTOR",
            is_active=True,
        )
        db.add(insp1_officer)

        insp2_officer = OfficerModel(
            officer_id=insp2_id,
            officer_name=f"Inspector Two {suffix}",
            email=inspector2_email,
            password_hash=pw_hash,
            role="INSPECTOR",
            is_active=True,
        )
        db.add(insp2_officer)

        case1 = CaseModel(
            case_id=case_1_id,
            case_name=f"Case Assigned {suffix}",
            case_number=case_1_id,
            created_by=f"Admin {suffix}",
            status="Active",
        )
        db.add(case1)

        case2 = CaseModel(
            case_id=case_2_id,
            case_name=f"Case Unassigned {suffix}",
            case_number=case_2_id,
            created_by=f"Admin {suffix}",
            status="Active",
        )
        db.add(case2)

        assignment1 = CaseAssignmentModel(
            assignment_id=uuid4(),
            case_id=case_1_id,
            officer_id=insp1_id,
            assigned_by="Admin",
            assigned_at=now_ist(),
        )
        db.add(assignment1)

        await db.commit()

    try:
        # 1. Admin Login
        admin_login_res = client.post("/api/auth/login", json={"email": admin_email, "password": password})
        assert admin_login_res.status_code == 200
        admin_token = admin_login_res.json()["access_token"]
        admin_headers = {"Authorization": f"Bearer {admin_token}"}

        # 2. Inspector Login
        insp1_login_res = client.post("/api/auth/login", json={"email": inspector1_email, "password": password})
        assert insp1_login_res.status_code == 200
        insp1_token = insp1_login_res.json()["access_token"]
        insp1_headers = {"Authorization": f"Bearer {insp1_token}"}

        # 3. Invalid credentials -> 401
        assert client.post("/api/auth/login", json={"email": admin_email, "password": "Wrong!"}).status_code == 401

        # 4. Deactivated user login -> 401
        async with async_session_maker() as db:
            stmt = select(OfficerModel).where(OfficerModel.officer_id == insp2_id)
            res = await db.execute(stmt)
            off = res.scalar_one()
            off.is_active = False
            await db.commit()
        assert client.post("/api/auth/login", json={"email": inspector2_email, "password": password}).status_code == 401

        # 5. Unauthenticated request -> 401
        assert client.get("/api/cases").status_code == 401

        # 6. Inspector accessing Admin endpoint -> 403
        assert client.get("/api/admin/users", headers=insp1_headers).status_code == 403

        # 7. Admin accessing Admin endpoint -> 200
        assert client.get("/api/admin/users", headers=admin_headers).status_code == 200

        # 8. Inspector accessing assigned case -> 200
        assert client.get(f"/api/case/{case_1_id}", headers=insp1_headers).status_code == 200

        # 9. Inspector accessing unassigned case -> 403
        assert client.get(f"/api/case/{case_2_id}", headers=insp1_headers).status_code == 403

        # 10. Admin accessing any case -> 200
        assert client.get(f"/api/case/{case_1_id}", headers=admin_headers).status_code == 200
        assert client.get(f"/api/case/{case_2_id}", headers=admin_headers).status_code == 200

        # 11. Real-time DB Check: Inspector deactivated mid-session -> 401
        async with async_session_maker() as db:
            stmt = select(OfficerModel).where(OfficerModel.officer_id == insp1_id)
            res = await db.execute(stmt)
            off = res.scalar_one()
            off.is_active = False
            await db.commit()

        assert client.get(f"/api/case/{case_1_id}", headers=insp1_headers).status_code == 401

        # 12. Real-time DB Check: Reactivated and promoted to ADMIN
        async with async_session_maker() as db:
            stmt = select(OfficerModel).where(OfficerModel.officer_id == insp1_id)
            res = await db.execute(stmt)
            off = res.scalar_one()
            off.is_active = True
            off.role = "ADMIN"
            await db.commit()

        assert client.get("/api/admin/users", headers=insp1_headers).status_code == 200

        # 13. Case Deletion is ADMIN-only
        # Demote back to INSPECTOR
        async with async_session_maker() as db:
            stmt = select(OfficerModel).where(OfficerModel.officer_id == insp1_id)
            res = await db.execute(stmt)
            off = res.scalar_one()
            off.role = "INSPECTOR"
            await db.commit()

        assert client.delete(f"/api/case/{case_1_id}", headers=insp1_headers).status_code == 403
        assert client.delete(f"/api/case/{case_1_id}", headers=admin_headers).status_code == 200

    finally:
        async with async_session_maker() as db:
            await db.execute(delete(CaseAssignmentModel).where(CaseAssignmentModel.case_id.in_([case_1_id, case_2_id])))
            await db.execute(delete(CaseModel).where(CaseModel.case_id.in_([case_1_id, case_2_id])))
            await db.execute(delete(AuthSessionModel).where(AuthSessionModel.officer_id.in_([admin_id, insp1_id, insp2_id])))
            await db.execute(delete(AuditLogModel).where(AuditLogModel.actor_id.in_([admin_id, insp1_id, insp2_id])))
            await db.execute(delete(OfficerModel).where(OfficerModel.officer_id.in_([admin_id, insp1_id, insp2_id])))
            await db.commit()
