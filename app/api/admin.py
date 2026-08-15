"""
Admin Management and Audit API Router for E-Rakshak.
Protected strictly with require_admin RBAC dependency.
"""

from datetime import datetime
from typing import Any, Optional
from uuid import UUID, uuid4

from fastapi import APIRouter, Depends, HTTPException, Query, Request, status
from pydantic import BaseModel, EmailStr, Field
from sqlalchemy import delete, func, select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.deps import require_admin
from app.core.security import hash_password
from app.database.models import AuditLogModel, CaseAssignmentModel, OfficerModel
from app.database.models.telecom import CaseModel, LocalizationFixModel, UploadMetadataModel
from app.database.session import check_database_connection, get_db_session
from app.services.audit_service import record_audit_event
from app.utils.datetime_utils import now_ist, parse_iso_datetime_naive

router = APIRouter(prefix="/api/admin", tags=["admin"], dependencies=[Depends(require_admin)])


# ── Schemas ──────────────────────────────────────────────────

class CreateUserRequest(BaseModel):
    officer_name: str = Field(..., min_length=1, max_length=255)
    email: EmailStr
    password: str = Field(..., min_length=8, max_length=72)
    role: str = Field(default="INSPECTOR", pattern=r"^(ADMIN|INSPECTOR)$")
    is_active: bool = Field(default=True)


class UpdateUserStatusRequest(BaseModel):
    is_active: bool


class UpdateUserRoleRequest(BaseModel):
    role: str = Field(..., pattern=r"^(ADMIN|INSPECTOR)$")


class ResetPasswordRequest(BaseModel):
    new_password: str = Field(..., min_length=8, max_length=72)


class AssignCaseRequest(BaseModel):
    officer_id: str


# ── User Management Endpoints ────────────────────────────────

@router.get("/users", summary="List all user accounts")
async def list_users(
    db: AsyncSession = Depends(get_db_session),
) -> dict[str, Any]:
    """
    Returns all registered officer accounts with their role, status, and assignment counts.
    """
    stmt = select(OfficerModel).order_by(OfficerModel.created_at.desc())
    res = await db.execute(stmt)
    officers = res.scalars().all()

    # Get assignment counts
    assign_stmt = select(CaseAssignmentModel.officer_id, func.count(CaseAssignmentModel.assignment_id)).group_by(CaseAssignmentModel.officer_id)
    assign_res = await db.execute(assign_stmt)
    assign_map = {row[0]: row[1] for row in assign_res.all()}

    return {
        "users": [
            {
                "officer_id": str(o.officer_id),
                "officer_name": o.officer_name,
                "email": o.email,
                "role": o.role,
                "is_active": o.is_active,
                "assigned_cases_count": assign_map.get(o.officer_id, 0),
                "created_at": o.created_at.isoformat(),
                "updated_at": o.updated_at.isoformat(),
            }
            for o in officers
        ],
        "total": len(officers),
    }


@router.post("/users", status_code=status.HTTP_201_CREATED, summary="Create a new officer account")
async def create_user(
    body: CreateUserRequest,
    req: Request,
    admin: OfficerModel = Depends(require_admin),
    db: AsyncSession = Depends(get_db_session),
) -> dict[str, Any]:
    """
    Admin creation of a new user account with specified role.
    """
    email_clean = body.email.strip().lower()

    stmt = select(OfficerModel).where(OfficerModel.email == email_clean)
    res = await db.execute(stmt)
    if res.scalar_one_or_none():
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=f"An account with email '{email_clean}' already exists.",
        )

    pw_hash = hash_password(body.password)
    new_officer = OfficerModel(
        officer_id=uuid4(),
        officer_name=body.officer_name.strip(),
        email=email_clean,
        password_hash=pw_hash,
        role=body.role.upper(),
        is_active=body.is_active,
        created_at=now_ist(),
        updated_at=now_ist(),
    )
    db.add(new_officer)

    await record_audit_event(
        db=db,
        action="USER_CREATED",
        actor_id=admin.officer_id,
        actor_name=admin.officer_name,
        actor_email=admin.email,
        actor_role=admin.role,
        target_resource=str(new_officer.officer_id),
        details={"email": new_officer.email, "role": new_officer.role, "name": new_officer.officer_name},
        ip_address=req.client.host if req.client else None,
    )

    try:
        await db.commit()
    except IntegrityError:
        await db.rollback()
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="Failed to create user.")

    return {
        "message": f"User account '{new_officer.email}' created successfully.",
        "user": {
            "officer_id": str(new_officer.officer_id),
            "officer_name": new_officer.officer_name,
            "email": new_officer.email,
            "role": new_officer.role,
            "is_active": new_officer.is_active,
            "created_at": new_officer.created_at.isoformat(),
        },
    }


@router.patch("/users/{user_id}/status", summary="Activate or deactivate a user account")
async def update_user_status(
    user_id: str,
    body: UpdateUserStatusRequest,
    req: Request,
    admin: OfficerModel = Depends(require_admin),
    db: AsyncSession = Depends(get_db_session),
) -> dict[str, Any]:
    """
    Toggles the active state of an officer account.
    """
    try:
        parsed_id = UUID(user_id)
    except (ValueError, TypeError):
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Invalid user ID format.")

    stmt = select(OfficerModel).where(OfficerModel.officer_id == parsed_id)
    res = await db.execute(stmt)
    target = res.scalar_one_or_none()

    if not target:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="User not found.")

    # Prevent admin from deactivating their own active session
    if target.officer_id == admin.officer_id and not body.is_active:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="You cannot deactivate your own administrative account.",
        )

    target.is_active = body.is_active
    target.updated_at = now_ist()

    action = "USER_ACTIVATED" if body.is_active else "USER_DEACTIVATED"
    await record_audit_event(
        db=db,
        action=action,
        actor_id=admin.officer_id,
        actor_name=admin.officer_name,
        actor_email=admin.email,
        actor_role=admin.role,
        target_resource=str(target.officer_id),
        details={"email": target.email, "is_active": target.is_active},
        ip_address=req.client.host if req.client else None,
    )

    await db.commit()
    return {
        "message": f"User status updated to {'Active' if target.is_active else 'Deactivated'}.",
        "user": {
            "officer_id": str(target.officer_id),
            "email": target.email,
            "is_active": target.is_active,
            "role": target.role,
        },
    }


@router.patch("/users/{user_id}/role", summary="Change a user's role (ADMIN or INSPECTOR)")
async def update_user_role(
    user_id: str,
    body: UpdateUserRoleRequest,
    req: Request,
    admin: OfficerModel = Depends(require_admin),
    db: AsyncSession = Depends(get_db_session),
) -> dict[str, Any]:
    """
    Updates the role assignment for an officer.
    """
    try:
        parsed_id = UUID(user_id)
    except (ValueError, TypeError):
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Invalid user ID format.")

    stmt = select(OfficerModel).where(OfficerModel.officer_id == parsed_id)
    res = await db.execute(stmt)
    target = res.scalar_one_or_none()

    if not target:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="User not found.")

    old_role = target.role
    new_role = body.role.upper()
    target.role = new_role
    target.updated_at = now_ist()

    await record_audit_event(
        db=db,
        action="ROLE_CHANGED",
        actor_id=admin.officer_id,
        actor_name=admin.officer_name,
        actor_email=admin.email,
        actor_role=admin.role,
        target_resource=str(target.officer_id),
        details={"email": target.email, "old_role": old_role, "new_role": new_role},
        ip_address=req.client.host if req.client else None,
    )

    await db.commit()
    return {
        "message": f"User role changed from {old_role} to {new_role}.",
        "user": {
            "officer_id": str(target.officer_id),
            "email": target.email,
            "role": target.role,
        },
    }


@router.post("/users/{user_id}/reset-password", summary="Reset a user's password")
async def reset_user_password(
    user_id: str,
    body: ResetPasswordRequest,
    req: Request,
    admin: OfficerModel = Depends(require_admin),
    db: AsyncSession = Depends(get_db_session),
) -> dict[str, Any]:
    """
    Resets the password for an officer account.
    """
    try:
        parsed_id = UUID(user_id)
    except (ValueError, TypeError):
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Invalid user ID format.")

    stmt = select(OfficerModel).where(OfficerModel.officer_id == parsed_id)
    res = await db.execute(stmt)
    target = res.scalar_one_or_none()

    if not target:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="User not found.")

    target.password_hash = hash_password(body.new_password)
    target.updated_at = now_ist()

    await record_audit_event(
        db=db,
        action="PASSWORD_RESET_BY_ADMIN",
        actor_id=admin.officer_id,
        actor_name=admin.officer_name,
        actor_email=admin.email,
        actor_role=admin.role,
        target_resource=str(target.officer_id),
        details={"email": target.email},
        ip_address=req.client.host if req.client else None,
    )

    await db.commit()
    return {"message": f"Password for '{target.email}' reset successfully."}


# ── Case Assignment Endpoints ────────────────────────────────

@router.get("/cases/{case_id}/assignments", summary="List officers assigned to an investigation case")
async def get_case_assignments(
    case_id: str,
    db: AsyncSession = Depends(get_db_session),
) -> dict[str, Any]:
    """
    Returns all officers assigned to a case.
    """
    stmt = (
        select(CaseAssignmentModel, OfficerModel)
        .join(OfficerModel, CaseAssignmentModel.officer_id == OfficerModel.officer_id)
        .where(CaseAssignmentModel.case_id == case_id)
    )
    res = await db.execute(stmt)
    rows = res.all()

    return {
        "case_id": case_id,
        "assignments": [
            {
                "assignment_id": str(assign.assignment_id),
                "officer_id": str(officer.officer_id),
                "officer_name": officer.officer_name,
                "email": officer.email,
                "role": officer.role,
                "assigned_by": assign.assigned_by,
                "assigned_at": assign.assigned_at.isoformat(),
            }
            for assign, officer in rows
        ],
        "total": len(rows),
    }


@router.post("/cases/{case_id}/assign", summary="Assign an officer to an investigation case")
async def assign_case_to_officer(
    case_id: str,
    body: AssignCaseRequest,
    req: Request,
    admin: OfficerModel = Depends(require_admin),
    db: AsyncSession = Depends(get_db_session),
) -> dict[str, Any]:
    """
    Assigns an inspector or officer to an investigation case.
    """
    try:
        parsed_officer_id = UUID(body.officer_id)
    except (ValueError, TypeError):
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Invalid officer ID format.")

    # Validate case
    stmt_case = select(CaseModel).where(CaseModel.case_id == case_id)
    res_case = await db.execute(stmt_case)
    case = res_case.scalar_one_or_none()
    if not case:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Investigation case not found.")

    # Validate officer
    stmt_off = select(OfficerModel).where(OfficerModel.officer_id == parsed_officer_id)
    res_off = await db.execute(stmt_off)
    officer = res_off.scalar_one_or_none()
    if not officer:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Officer not found.")

    # Check if already assigned
    stmt_exist = select(CaseAssignmentModel).where(
        CaseAssignmentModel.case_id == case_id,
        CaseAssignmentModel.officer_id == parsed_officer_id,
    )
    res_exist = await db.execute(stmt_exist)
    if res_exist.scalar_one_or_none():
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="Officer is already assigned to this case.")

    assignment = CaseAssignmentModel(
        assignment_id=uuid4(),
        case_id=case_id,
        officer_id=parsed_officer_id,
        assigned_by=admin.officer_name,
        assigned_at=now_ist(),
    )
    db.add(assignment)

    await record_audit_event(
        db=db,
        action="CASE_ASSIGNED",
        actor_id=admin.officer_id,
        actor_name=admin.officer_name,
        actor_email=admin.email,
        actor_role=admin.role,
        case_id=case_id,
        target_resource=str(officer.officer_id),
        details={"officer_name": officer.officer_name, "officer_email": officer.email},
        ip_address=req.client.host if req.client else None,
    )

    await db.commit()
    return {
        "message": f"Case '{case_id}' successfully assigned to '{officer.officer_name}'.",
        "assignment": {
            "assignment_id": str(assignment.assignment_id),
            "case_id": case_id,
            "officer_id": str(officer.officer_id),
            "officer_name": officer.officer_name,
            "assigned_at": assignment.assigned_at.isoformat(),
        },
    }


@router.delete("/cases/{case_id}/assign/{officer_id}", summary="Remove officer assignment from a case")
async def unassign_case_from_officer(
    case_id: str,
    officer_id: str,
    req: Request,
    admin: OfficerModel = Depends(require_admin),
    db: AsyncSession = Depends(get_db_session),
) -> dict[str, Any]:
    """
    Unassigns an officer from an investigation case.
    """
    try:
        parsed_officer_id = UUID(officer_id)
    except (ValueError, TypeError):
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Invalid officer ID format.")

    stmt = select(CaseAssignmentModel).where(
        CaseAssignmentModel.case_id == case_id,
        CaseAssignmentModel.officer_id == parsed_officer_id,
    )
    res = await db.execute(stmt)
    assignment = res.scalar_one_or_none()

    if not assignment:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Assignment not found.")

    await db.delete(assignment)

    await record_audit_event(
        db=db,
        action="CASE_UNASSIGNED",
        actor_id=admin.officer_id,
        actor_name=admin.officer_name,
        actor_email=admin.email,
        actor_role=admin.role,
        case_id=case_id,
        target_resource=officer_id,
        ip_address=req.client.host if req.client else None,
    )

    await db.commit()
    return {"message": f"Officer '{officer_id}' unassigned from case '{case_id}'."}


# ── Audit Logs Endpoints ─────────────────────────────────────

@router.get("/audit-logs", summary="List immutable forensic audit logs")
async def get_audit_logs(
    action: Optional[str] = None,
    status_filter: Optional[str] = Query(None, alias="status"),
    case_id: Optional[str] = None,
    search: Optional[str] = None,
    page: int = Query(1, ge=1),
    page_size: int = Query(50, ge=1, le=200),
    db: AsyncSession = Depends(get_db_session),
) -> dict[str, Any]:
    """
    Returns immutable audit logs with filtering and pagination for compliance and forensic reviews.
    """
    stmt = select(AuditLogModel)

    if action:
        stmt = stmt.where(AuditLogModel.action == action)
    if status_filter:
        stmt = stmt.where(AuditLogModel.status == status_filter)
    if case_id:
        stmt = stmt.where(AuditLogModel.case_id == case_id)
    if search:
        search_term = f"%{search.strip()}%"
        stmt = stmt.where(
            (AuditLogModel.actor_name.ilike(search_term))
            | (AuditLogModel.actor_email.ilike(search_term))
            | (AuditLogModel.action.ilike(search_term))
            | (AuditLogModel.case_id.ilike(search_term))
        )

    # Count total
    count_stmt = select(func.count()).select_from(stmt.subquery())
    total_res = await db.execute(count_stmt)
    total = total_res.scalar() or 0

    # Paginate
    stmt = stmt.order_by(AuditLogModel.timestamp.desc()).offset((page - 1) * page_size).limit(page_size)
    res = await db.execute(stmt)
    logs = res.scalars().all()

    return {
        "items": [
            {
                "log_id": str(l.log_id),
                "timestamp": l.timestamp.isoformat(),
                "actor_id": str(l.actor_id) if l.actor_id else None,
                "actor_name": l.actor_name,
                "actor_email": l.actor_email,
                "actor_role": l.actor_role,
                "action": l.action,
                "case_id": l.case_id,
                "target_resource": l.target_resource,
                "status": l.status,
                "details": l.details,
                "ip_address": l.ip_address,
            }
            for l in logs
        ],
        "total": total,
        "page": page,
        "page_size": page_size,
        "total_pages": (total + page_size - 1) // page_size if total > 0 else 1,
    }


# ── System Status Endpoint ───────────────────────────────────

@router.get("/system-status", summary="Get administrative platform overview and health metrics")
async def get_system_status(
    db: AsyncSession = Depends(get_db_session),
) -> dict[str, Any]:
    """
    Returns global system statistics: users, cases, uploads, localization fixes, and DB status.
    """
    db_connected = await check_database_connection()

    total_users_stmt = select(func.count(OfficerModel.officer_id))
    active_users_stmt = select(func.count(OfficerModel.officer_id)).where(OfficerModel.is_active.is_(True))
    admin_users_stmt = select(func.count(OfficerModel.officer_id)).where(OfficerModel.role == "ADMIN")
    total_cases_stmt = select(func.count(CaseModel.case_id))
    active_cases_stmt = select(func.count(CaseModel.case_id)).where(CaseModel.status == "Active")
    total_uploads_stmt = select(func.count(UploadMetadataModel.upload_id))
    total_fixes_stmt = select(func.count(LocalizationFixModel.fix_id))
    total_audit_logs_stmt = select(func.count(AuditLogModel.log_id))

    total_users = (await db.execute(total_users_stmt)).scalar() or 0
    active_users = (await db.execute(active_users_stmt)).scalar() or 0
    admin_users = (await db.execute(admin_users_stmt)).scalar() or 0
    total_cases = (await db.execute(total_cases_stmt)).scalar() or 0
    active_cases = (await db.execute(active_cases_stmt)).scalar() or 0
    total_uploads = (await db.execute(total_uploads_stmt)).scalar() or 0
    total_fixes = (await db.execute(total_fixes_stmt)).scalar() or 0
    total_audit_logs = (await db.execute(total_audit_logs_stmt)).scalar() or 0

    return {
        "database_connected": db_connected,
        "metrics": {
            "total_users": total_users,
            "active_users": active_users,
            "admin_users": admin_users,
            "inspector_users": total_users - admin_users,
            "total_cases": total_cases,
            "active_cases": active_cases,
            "total_uploads": total_uploads,
            "total_fixes": total_fixes,
            "total_audit_logs": total_audit_logs,
        },
        "server_time": now_ist().isoformat(),
    }
