"""
Audit Logging Service for E-Rakshak.
Persists immutable security and forensic events to the database.
"""

from typing import Any, Optional
from uuid import UUID, uuid4

from sqlalchemy.ext.asyncio import AsyncSession

from app.core.logging import logger
from app.database.models.audit import AuditLogModel
from app.utils.datetime_utils import now_ist


async def record_audit_event(
    db: AsyncSession,
    action: str,
    actor_id: Optional[UUID | str] = None,
    actor_name: str = "System",
    actor_email: Optional[str] = None,
    actor_role: str = "UNKNOWN",
    case_id: Optional[str] = None,
    target_resource: Optional[str] = None,
    status: str = "SUCCESS",
    details: Optional[dict[str, Any]] = None,
    ip_address: Optional[str] = None,
) -> AuditLogModel:
    """
    Records an immutable audit log entry in the database.
    """
    try:
        parsed_actor_id = None
        if actor_id:
            parsed_actor_id = UUID(str(actor_id)) if isinstance(actor_id, str) else actor_id

        entry = AuditLogModel(
            log_id=uuid4(),
            timestamp=now_ist(),
            actor_id=parsed_actor_id,
            actor_name=actor_name,
            actor_email=actor_email,
            actor_role=actor_role,
            action=action,
            case_id=case_id,
            target_resource=target_resource,
            status=status,
            details=details,
            ip_address=ip_address,
        )
        db.add(entry)
        await db.flush()

        logger.info(
            "audit_event_recorded",
            action=action,
            actor_name=actor_name,
            actor_role=actor_role,
            case_id=case_id,
            status=status,
        )
        return entry
    except Exception as e:
        logger.error("audit_logging_failed", action=action, error=str(e))
        # Do not allow audit logging failure to block execution, but log error
        return None  # type: ignore
