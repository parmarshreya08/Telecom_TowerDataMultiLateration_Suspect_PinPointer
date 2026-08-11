"""
Case + Localization Router.
Exposes endpoints for listing a case's uploads and running/reading
localization fixes (GeoJSON) for an investigation case.
"""

from typing import Any

from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel, Field
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import settings
from app.core.logging import logger
from app.database.repository import TelecomRepository
from app.database.session import get_db_session
from app.localization.engine import LocalizationEngine

router = APIRouter()


class CreateCaseRequest(BaseModel):
    case_name: str = Field(..., min_length=1, max_length=255)
    case_number: str = Field(..., min_length=1, max_length=100)
    suspect_name: str = Field(default="", max_length=255)
    mobile_number: str = Field(default="", max_length=20)
    description: str = Field(default="", max_length=2000)
    officer_notes: str = Field(default="", max_length=2000)


def _fixes_to_geojson(fixes: list[Any]) -> dict[str, Any]:
    """
    Serializes stored LocalizationFixModel rows into a GeoJSON FeatureCollection.
    """
    from app.utils.datetime_utils import now_ist

    features = []
    for fix in fixes:
        features.append({
            "type": "Feature",
            "id": str(fix.fix_id),
            "geometry": {"type": "Point", "coordinates": [fix.longitude, fix.latitude]},
            "properties": {
                "case_id": fix.case_id,
                "subscriber_identifier": fix.subscriber_identifier,
                "timestamp": fix.timestamp.isoformat(),
                "confidence_radius_meters": fix.confidence_radius_meters,
                "velocity_east": fix.velocity_east,
                "velocity_north": fix.velocity_north,
                "gdop": fix.gdop,
                "residual_rms": fix.residual_rms,
                "ta_inner_m": fix.ta_inner_m,
                "ta_outer_m": fix.ta_outer_m,
                "rss_i_dbm": fix.rss_i_dbm,
            },
        })

    return {
        "type": "FeatureCollection",
        "features": features,
        "metadata": {
            "case_id": fixes[0].case_id if fixes else None,
            "fix_count": len(fixes),
            "generated_at": now_ist().isoformat(),
        },
    }


@router.post(
    "/api/cases",
    status_code=status.HTTP_201_CREATED,
    summary="Create a new investigation case",
)
async def create_case(
    body: CreateCaseRequest,
    db: AsyncSession = Depends(get_db_session),
) -> dict[str, Any]:
    """
    Registers a new investigation case. Cases are lightweight identifiers;
    actual data is associated when files are uploaded with this case_id.
    """
    from app.utils.datetime_utils import now_ist
    from app.database.models.telecom import CaseModel

    now = now_ist()

    case = CaseModel(
        case_id=body.case_number,
        case_name=body.case_name,
        case_number=body.case_number,
        suspect_name=body.suspect_name,
        mobile_number=body.mobile_number,
        description=body.description,
        officer_notes=body.officer_notes,
        status="Active",
        created_by="Officer",
        created_at=now,
        updated_at=now,
    )

    repo = TelecomRepository(db)
    await repo.create_case(case)
    await db.commit()

    return {
        "id": body.case_number,
        "case_name": body.case_name,
        "case_number": body.case_number,
        "suspect_name": body.suspect_name,
        "mobile_number": body.mobile_number,
        "description": body.description,
        "officer_notes": body.officer_notes,
        "status": "Active",
        "created_by": "Officer",
        "created_at": now.isoformat(),
        "updated_at": now.isoformat(),
        "tracking_status": "Idle",
        "uploads": [],
        "timeline": [],
        "fix_count": 0,
    }


@router.get(
    "/api/towers/list",
    status_code=status.HTTP_200_OK,
    summary="List all registered cell towers",
)
async def list_towers(
    db: AsyncSession = Depends(get_db_session),
) -> dict[str, Any]:
    """
    Returns all registered towers. Used by the frontend map to display tower locations.
    """
    from sqlalchemy import select
    from app.database.models.telecom import TowerRecordModel

    stmt = select(TowerRecordModel).order_by(TowerRecordModel.operator, TowerRecordModel.cgi)
    result = await db.execute(stmt)
    models = result.scalars().all()

    return {
        "towers": [
            {
                "tower_id": str(m.tower_id),
                "operator": m.operator,
                "radio": m.radio,
                "cgi": m.cgi,
                "latitude": m.latitude,
                "longitude": m.longitude,
                "azimuth": m.azimuth,
                "beamwidth": m.beamwidth,
                "range_meters": m.range_meters,
                "site_address": m.site_address,
            }
            for m in models
        ],
        "total": len(models),
    }


@router.get(
    "/api/case/{case_id}/uploads",
    status_code=status.HTTP_200_OK,
    summary="List uploads registered to a case",
)
async def get_case_uploads(
    case_id: str,
    db: AsyncSession = Depends(get_db_session),
) -> dict[str, Any]:
    """
    Returns all file uploads belonging to the case (1:N relationship).
    """
    repo = TelecomRepository(db)
    uploads = await repo.get_uploads_by_case(case_id)

    return {
        "case_id": case_id,
        "uploads": [
            {
                "upload_id": u.upload_id,
                "source_type": u.source_type,
                "operator": u.operator,
                "original_filename": u.original_filename,
                "mime_type": u.mime_type,
                "file_size_bytes": u.file_size_bytes,
                "uploaded_by": u.uploaded_by,
                "uploaded_at": u.uploaded_at.isoformat(),
            }
            for u in uploads
        ],
        "total": len(uploads),
    }


@router.post(
    "/api/case/{case_id}/localize",
    status_code=status.HTTP_200_OK,
    summary="Run the localization engine over a case and cache fixes",
)
async def run_case_localization(
    case_id: str,
    db: AsyncSession = Depends(get_db_session),
) -> dict[str, Any]:
    """
    Loads the case's MeasurementFrames, runs trilateration + Kalman tracking,
    persists the resulting fixes, and returns a GeoJSON FeatureCollection.
    """
    repo = TelecomRepository(db)
    frames = await repo.get_frames_by_case(case_id)

    if not frames:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"No measurement frames found for case '{case_id}'. Upload and ingest CDR/tower data first.",
        )

    engine = LocalizationEngine(utm_zone=settings.UTM_ZONE, target_type="pedestrian")
    fixes = engine.compute_fixes(frames, case_id=case_id)

    if not fixes:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="Localization produced no fixes: measurement frames lack usable pseudorange (timing advance / RTT) data.",
        )

    await repo.save_localization_fixes(fixes)
    await db.commit()

    geojson = engine.to_geojson(fixes)
    logger.info("case_localization_success", case_id=case_id, fix_count=len(fixes))

    return {
        "case_id": case_id,
        "fix_count": len(fixes),
        "geojson": geojson,
    }


@router.get(
    "/api/towers",
    status_code=status.HTTP_200_OK,
    summary="Lookup a registered cell tower by CGI",
)
async def lookup_tower(
    cgi: str,
    db: AsyncSession = Depends(get_db_session),
) -> dict[str, Any]:
    """
    Returns the tower's registered coordinates and sector parameters for a CGI
    (MCC-MNC-LAC-CellID). Used by the frontend and engine to resolve tower geometry.
    """
    from app.services.tower_lookup import TowerLookupService

    service = TowerLookupService(db)
    tower = await service.find_by_cgi(cgi)

    if not tower:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"No registered tower found for CGI '{cgi}'.",
        )

    return {
        "tower_id": str(tower.tower_id),
        "operator": tower.operator.value,
        "radio": tower.radio.value,
        "cgi": tower.cgi,
        "latitude": tower.latitude,
        "longitude": tower.longitude,
        "azimuth": tower.azimuth,
        "beamwidth": tower.beamwidth,
        "range_meters": tower.range_meters,
        "site_address": tower.site_address,
    }


@router.get(
    "/api/case/{case_id}/localize/geojson",
    status_code=status.HTTP_200_OK,
    summary="Read cached localization GeoJSON for a case",
)
async def get_case_localization_geojson(
    case_id: str,
    start: str | None = None,
    end: str | None = None,
    db: AsyncSession = Depends(get_db_session),
) -> dict[str, Any]:
    """
    Returns the previously computed GeoJSON fixes for a case, without recomputation.
    Optional query params: start (ISO datetime), end (ISO datetime).
    """
    from datetime import datetime as _dt

    repo = TelecomRepository(db)
    start_dt = _dt.fromisoformat(start) if start else None
    end_dt = _dt.fromisoformat(end) if end else None
    fixes = await repo.get_localization_fixes(case_id, start_time=start_dt, end_time=end_dt)

    if not fixes:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"No cached localization fixes for case '{case_id}'. Run POST /api/case/{case_id}/localize first.",
        )

    return _fixes_to_geojson(fixes)


@router.get(
    "/api/case/{case_id}/report",
    status_code=status.HTTP_200_OK,
    summary="Generate forensic report for a case",
)
async def get_forensic_report(
    case_id: str,
    db: AsyncSession = Depends(get_db_session),
) -> dict[str, Any]:
    """
    Generates a structured forensic report summarizing the localization analysis
    for court-admissible evidence.
    """
    from app.contracts.localization import LocalizationFix as FixContract
    from app.localization.forensic_report import generate_forensic_report

    repo = TelecomRepository(db)
    fixes = await repo.get_localization_fixes(case_id)

    if not fixes:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"No cached localization fixes for case '{case_id}'. Run localization first.",
        )

    contract_fixes = [
        FixContract(
            fix_id=f.fix_id,
            case_id=f.case_id,
            frame_id=f.frame_id,
            subscriber_identifier=f.subscriber_identifier,
            timestamp=f.timestamp,
            latitude=f.latitude,
            longitude=f.longitude,
            velocity_east=f.velocity_east,
            velocity_north=f.velocity_north,
            confidence_radius_meters=f.confidence_radius_meters,
            gdop=f.gdop,
            residual_rms=f.residual_rms,
            ta_inner_m=f.ta_inner_m,
            ta_outer_m=f.ta_outer_m,
            rss_i_dbm=f.rss_i_dbm,
        )
        for f in fixes
    ]

    return generate_forensic_report(case_id, contract_fixes)


@router.get(
    "/api/cases",
    status_code=status.HTTP_200_OK,
    summary="List all investigation cases",
)
async def list_cases(
    db: AsyncSession = Depends(get_db_session),
) -> dict[str, Any]:
    repo = TelecomRepository(db)
    cases = await repo.get_all_cases()

    return {
        "items": cases,
        "total": len(cases),
        "page": 1,
        "page_size": max(len(cases), 10),
        "total_pages": 1,
    }


@router.get(
    "/api/case/{case_id}",
    status_code=status.HTTP_200_OK,
    summary="Get investigation case details",
)
async def get_case_detail(
    case_id: str,
    db: AsyncSession = Depends(get_db_session),
) -> dict[str, Any]:
    from sqlalchemy import select as sa_select
    from app.database.models.telecom import CaseModel

    repo = TelecomRepository(db)
    uploads = await repo.get_uploads_by_case(case_id)
    fixes = await repo.get_localization_fixes(case_id)
    events = await repo.get_subscriber_events_by_case(case_id, limit=1)

    case_stmt = sa_select(CaseModel).where(CaseModel.case_id == case_id)
    case_result = await db.execute(case_stmt)
    case_model = case_result.scalar_one_or_none()

    if not case_model and not uploads and not fixes:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Case '{case_id}' not found.",
        )

    phone_number = events[0].phone_number if events and events[0].phone_number else "Unknown"

    return {
        "id": case_id,
        "case_name": case_model.case_name if case_model else f"Investigation {case_id}",
        "case_number": case_model.case_number if case_model else case_id,
        "suspect_name": case_model.suspect_name if case_model else (f"Target ({phone_number})" if phone_number != "Unknown" else f"Target {case_id}"),
        "mobile_number": case_model.mobile_number if case_model and case_model.mobile_number else phone_number,
        "description": case_model.description if case_model else f"Telecom multi-lateration analysis case {case_id}",
        "officer_notes": case_model.officer_notes if case_model else f"Ingested {len(uploads)} file uploads, {len(fixes)} localization fixes computed.",
        "status": case_model.status if case_model else ("Completed" if fixes else "Active"),
        "created_by": case_model.created_by if case_model else (uploads[0].uploaded_by if uploads else "Officer"),
        "created_at": (case_model.created_at.isoformat() if case_model and case_model.created_at else (uploads[0].uploaded_at.isoformat() if uploads else "")),
        "updated_at": (case_model.updated_at.isoformat() if case_model and case_model.updated_at else (uploads[-1].uploaded_at.isoformat() if uploads else "")),
        "tracking_status": "Completed" if fixes else "Idle",
        "uploads": [
            {
                "upload_id": str(u.upload_id),
                "case_id": u.case_id,
                "source_type": u.source_type,
                "operator": u.operator,
                "original_filename": u.original_filename,
                "stored_filename": u.stored_filename,
                "sha256": u.sha256,
                "mime_type": u.mime_type,
                "file_size_bytes": u.file_size_bytes,
                "uploaded_by": u.uploaded_by,
                "uploaded_at": u.uploaded_at.isoformat(),
            }
            for u in uploads
        ],
        "fix_count": len(fixes),
    }


@router.get(
    "/api/case/{case_id}/events",
    status_code=status.HTTP_200_OK,
    summary="Get normalized subscriber CDR records for a case",
)
async def get_case_events(
    case_id: str,
    limit: int = 500,
    db: AsyncSession = Depends(get_db_session),
) -> dict[str, Any]:
    repo = TelecomRepository(db)
    events = await repo.get_subscriber_events_by_case(case_id, limit=limit)
    return {
        "case_id": case_id,
        "events": [
            {
                "event_id": str(e.event_id),
                "upload_id": str(e.upload_id),
                "operator": e.operator,
                "source_type": e.source_type,
                "phone_number": e.phone_number,
                "imei": e.imei,
                "imsi": e.imsi,
                "timestamp": e.timestamp.isoformat(),
                "call_type": e.call_type,
                "duration_seconds": e.duration_seconds,
                "cgi": e.cgi,
                "mcc": e.mcc,
                "mnc": e.mnc,
                "lac": e.lac,
                "cell_id": e.cell_id,
                "tower_latitude": e.tower_latitude,
                "tower_longitude": e.tower_longitude,
                "signal_strength": e.signal_strength,
                "timing_advance": e.timing_advance,
                "rtt": e.rtt,
                "source_file": e.source_file,
                "record_number": e.record_number,
                "raw_fields": e.raw_fields,
            }
            for e in events
        ],
        "total": len(events),
    }


@router.get(
    "/api/dashboard/stats",
    status_code=status.HTTP_200_OK,
    summary="Get system-wide dashboard statistics",
)
async def get_dashboard_stats(
    db: AsyncSession = Depends(get_db_session),
) -> dict[str, Any]:
    repo = TelecomRepository(db)
    return await repo.get_dashboard_stats()

