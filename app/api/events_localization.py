"""Event-based localization endpoint (no Kalman, no time bundling)."""

from typing import Any

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.deps import check_case_access, get_current_officer
from app.database.models import OfficerModel
from app.database.repository import TelecomRepository
from app.database.session import get_db_session
from app.localization.event_engine import EventLocalizationEngine
from app.services.tower_lookup import TowerLookupService

router = APIRouter(prefix="/api/case", tags=["Event Localization"])


@router.get("/{case_id}/events/localize")
async def localize_case_events(
    case_id: str,
    limit: int = Query(default=500, ge=1, le=2000),
    officer: OfficerModel = Depends(get_current_officer),
    db: AsyncSession = Depends(get_db_session),
) -> dict[str, Any]:
    """Runs the independent event engine over the case's stored events."""
    await check_case_access(case_id, officer, db)
    repo = TelecomRepository(db)
    rows = await repo.get_subscriber_events_by_case(case_id, limit=limit)
    if not rows:
        raise HTTPException(status_code=404, detail=f"No stored events found for case '{case_id}'.")

    # Map ORM rows to lightweight records carrying raw_fields (NMR metadata)
    from app.contracts.subscriber import SubscriberEventRecord
    from app.contracts.enums import Operator, SourceType, CallType

    records: list[SubscriberEventRecord] = []
    for r in rows:
        try:
            ctype = CallType(r.call_type) if r.call_type in CallType._value2member_map_ else CallType.UNKNOWN
        except Exception:
            ctype = CallType.UNKNOWN
        records.append(
            SubscriberEventRecord(
                event_id=r.event_id,
                upload_id=r.upload_id,
                operator=Operator(r.operator) if r.operator in Operator._value2member_map_ else Operator.UNKNOWN,
                source_type=SourceType(r.source_type) if r.source_type in SourceType._value2member_map_ else SourceType.UNKNOWN,
                phone_number=r.phone_number,
                imei=r.imei,
                imsi=r.imsi,
                timestamp=r.timestamp,
                call_type=ctype,
                duration_seconds=r.duration_seconds,
                cgi=r.cgi,
                mcc=r.mcc,
                mnc=r.mnc,
                lac=r.lac,
                cell_id=r.cell_id,
                tower_latitude=r.tower_latitude,
                tower_longitude=r.tower_longitude,
                signal_strength=r.signal_strength,
                timing_advance=r.timing_advance,
                rtt=r.rtt,
                source_file=r.source_file,
                record_number=r.record_number,
                raw_fields=r.raw_fields or {},
            )
        )

    engine = EventLocalizationEngine(TowerLookupService(db))
    results = await engine.solve_records(records)
    return {
        "case_id": case_id,
        "event_count": len(results),
        "results": [r.to_dict() for r in results],
    }
