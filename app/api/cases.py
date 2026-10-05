"""
Case + Localization Router.
Exposes endpoints for listing a case's uploads and running/reading
localization fixes (GeoJSON) for an investigation case.
"""

from typing import Any
from uuid import uuid4

from fastapi import APIRouter, Depends, HTTPException, Query, Request, status
from pydantic import BaseModel, Field
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import settings
from app.core.deps import check_case_access, get_current_officer, require_admin
from app.core.logging import logger
from app.contracts.rf import RfScan
from app.database.models import CaseAssignmentModel, OfficerModel
from app.database.repository import TelecomRepository
from app.database.session import get_db_session
from app.localization.engine import LocalizationEngine
from app.localization.rf_verifier import verify_scans
from app.services.audit_service import record_audit_event
from app.services.supabase_storage import storage_service
from app.utils.datetime_utils import parse_iso_datetime_naive

router = APIRouter()


def _parse_bound(value: str | None, name: str):
    """Parse a start/end query bound, raising 400 for malformed ISO datetimes."""
    if not value:
        return None
    try:
        return parse_iso_datetime_naive(value)
    except ValueError:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Invalid {name} datetime: '{value}'. Use ISO-8601 format.",
        )


class CreateCaseRequest(BaseModel):
    case_name: str = Field(..., min_length=1, max_length=255)
    case_number: str = Field(
        ...,
        min_length=1,
        max_length=50,
        pattern=r"^[A-Za-z0-9._-]+$",
        description="Used as the case identifier/URL path segment; no slashes or spaces.",
    )
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
    req: Request,
    officer: OfficerModel = Depends(get_current_officer),
    db: AsyncSession = Depends(get_db_session),
) -> dict[str, Any]:
    """
    Registers a new investigation case. Cases are lightweight identifiers;
    actual data is associated when files are uploaded with this case_id.
    Auto-assigns the newly created case to the creator officer.
    """
    from sqlalchemy.exc import IntegrityError
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
        created_by=officer.officer_name,
        created_at=now,
        updated_at=now,
    )

    repo = TelecomRepository(db)
    try:
        await repo.create_case(case)

        # Auto-assign to creator
        assignment = CaseAssignmentModel(
            assignment_id=uuid4(),
            case_id=body.case_number,
            officer_id=officer.officer_id,
            assigned_by=officer.officer_name,
            assigned_at=now,
        )
        db.add(assignment)

        await record_audit_event(
            db=db,
            action="CASE_CREATED",
            actor_id=officer.officer_id,
            actor_name=officer.officer_name,
            actor_email=officer.email,
            actor_role=officer.role,
            case_id=body.case_number,
            details={"case_name": body.case_name, "case_number": body.case_number},
            ip_address=req.client.host if req.client else None,
        )

        await db.commit()
    except IntegrityError:
        await db.rollback()
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=f"Case number '{body.case_number}' already exists.",
        )

    return {
        "id": body.case_number,
        "case_name": body.case_name,
        "case_number": body.case_number,
        "suspect_name": body.suspect_name,
        "mobile_number": body.mobile_number,
        "description": body.description,
        "officer_notes": body.officer_notes,
        "status": "Active",
        "created_by": officer.officer_name,
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
    officer: OfficerModel = Depends(get_current_officer),
    db: AsyncSession = Depends(get_db_session),
) -> dict[str, Any]:
    """
    Returns all file uploads belonging to the case (1:N relationship).
    """
    await check_case_access(case_id, officer, db)
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
    geocode: bool = False,
    upload_ids: list[str] = Query(default=[]),
    req: Request = None,
    officer: OfficerModel = Depends(get_current_officer),
    db: AsyncSession = Depends(get_db_session),
) -> dict[str, Any]:
    """
    Loads the case's MeasurementFrames, runs trilateration + Kalman tracking,
    persists the resulting fixes, and returns a GeoJSON FeatureCollection.
    Pass ?upload_ids=<uuid> (repeatable) to run over selected files only.
    """
    await check_case_access(case_id, officer, db)
    await record_audit_event(
        db=db,
        action="LOCALIZATION_STARTED",
        actor_id=officer.officer_id,
        actor_name=officer.officer_name,
        actor_email=officer.email,
        actor_role=officer.role,
        case_id=case_id,
        ip_address=req.client.host if req and req.client else None,
    )

    repo = TelecomRepository(db)
    raw_frame_count = await repo.count_measurement_frames_by_case(
        case_id, upload_ids=upload_ids or None
    )
    frames = await repo.get_frames_by_case(case_id, upload_ids=upload_ids or None)

    if not frames:
        if raw_frame_count > 0:
            raise HTTPException(
                status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
                detail=(
                    "Localization cannot be performed because no measurement frame "
                    "contains at least 3 observed towers."
                ),
            )
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"No measurement frames found for case '{case_id}'. Upload and ingest CDR/tower data first.",
        )

    skipped_frame_count = raw_frame_count - len(frames)
    if skipped_frame_count > 0:
        logger.info(
            "case_localization_frames_skipped",
            case_id=case_id,
            skipped=skipped_frame_count,
            processed=len(frames),
            total=raw_frame_count,
        )

    engine = LocalizationEngine(utm_zone=settings.UTM_ZONE, target_type="pedestrian")
    fixes = engine.compute_fixes(frames, case_id=case_id)

    if not fixes:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="Localization produced no fixes: measurement frames lack usable pseudorange (timing advance / RTT) data.",
        )

    # Load all tower records for the case to get their site addresses in memory
    from app.database.models.telecom import TowerRecordModel
    from sqlalchemy import select
    tower_ids = set()
    for fr in frames:
        for t in getattr(fr, "towers", []):
            tower_ids.add(t.tower_id)
    tower_site_map = {}
    if tower_ids:
        res_towers = await db.execute(select(TowerRecordModel).where(TowerRecordModel.tower_id.in_(list(tower_ids))))
        tower_site_map = {tm.tower_id: tm.site_address for tm in res_towers.scalars().all()}

    # Reverse-geocode all fixes before persisting to cache
    from app.services.geocoder import reverse_geocode
    frames_map = {f.frame_id: f for f in frames}
    for fix in fixes:
        try:
            # Find nearest tower site address in the frame
            fallback_area = None
            if fix.frame_id in frames_map:
                frame = frames_map[fix.frame_id]
                min_dist = float('inf')
                for t in getattr(frame, "towers", []):
                    dist_sq = (t.latitude - fix.latitude)**2 + (t.longitude - fix.longitude)**2
                    if dist_sq < min_dist:
                        min_dist = dist_sq
                        addr = tower_site_map.get(t.tower_id)
                        if addr:
                            fallback_area = addr
            if not fallback_area:
                fallback_area = "Udhana"
            fix.geocoded_address = reverse_geocode(fix.latitude, fix.longitude, fallback_area=fallback_area)
        except Exception:
            fix.geocoded_address = "Address unavailable"

    await repo.delete_localization_fixes(case_id, [f.frame_id for f in frames])
    await repo.save_localization_fixes(fixes)

    await record_audit_event(
        db=db,
        action="LOCALIZATION_COMPLETED",
        actor_id=officer.officer_id,
        actor_name=officer.officer_name,
        actor_email=officer.email,
        actor_role=officer.role,
        case_id=case_id,
        details={"fix_count": len(fixes)},
        ip_address=req.client.host if req and req.client else None,
    )

    await db.commit()

    geojson = engine.to_geojson(fixes, frames=frames)
    logger.info("case_localization_success", case_id=case_id, fix_count=len(fixes))

    response: dict[str, Any] = {
        "case_id": case_id,
        "fix_count": len(fixes),
        "geojson": geojson,
        "rogue_cgis": sorted(getattr(engine, "rogue_cgis", set())),
    }
    if skipped_frame_count > 0:
        response["skipped_frame_count"] = skipped_frame_count
        response["processed_frame_count"] = len(frames)
    return response


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
    geocode: bool = False,
    officer: OfficerModel = Depends(get_current_officer),
    db: AsyncSession = Depends(get_db_session),
) -> dict[str, Any]:
    """
    Returns the previously computed GeoJSON fixes for a case, without recomputation.
    Optional query params: start (ISO datetime), end (ISO datetime),
    geocode=true resolves each fix to an area label via Nominatim if not cached.
    """
    await check_case_access(case_id, officer, db)
    repo = TelecomRepository(db)
    start_dt = _parse_bound(start, "start")
    end_dt = _parse_bound(end, "end")
    fixes = await repo.get_localization_fixes(case_id, start_time=start_dt, end_time=end_dt)

    if not fixes:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"No cached localization fixes for case '{case_id}'. Run POST /api/case/{case_id}/localize first.",
        )

    from app.contracts.localization import LocalizationFix
    frames = await repo.get_frames_by_case(case_id)
    # Load all tower records for the case to get their site addresses in memory
    from app.database.models.telecom import TowerRecordModel
    from sqlalchemy import select
    tower_ids = set()
    for fr in frames:
        for t in getattr(fr, "towers", []):
            tower_ids.add(t.tower_id)
    tower_site_map = {}
    if tower_ids:
        res_towers = await db.execute(select(TowerRecordModel).where(TowerRecordModel.tower_id.in_(list(tower_ids))))
        tower_site_map = {tm.tower_id: tm.site_address for tm in res_towers.scalars().all()}

    frames_map = {fr.frame_id: fr for fr in frames}
    contract_fixes = []
    for f in fixes:
        addr = f.geocoded_address
        if not addr:
            from app.services.geocoder import reverse_geocode
            try:
                fallback_area = None
                if f.frame_id in frames_map:
                    frame = frames_map[f.frame_id]
                    min_dist = float('inf')
                    for t in getattr(frame, "towers", []):
                        dist_sq = (t.latitude - f.latitude)**2 + (t.longitude - f.longitude)**2
                        if dist_sq < min_dist:
                            min_dist = dist_sq
                            addr = tower_site_map.get(t.tower_id)
                            if addr:
                                fallback_area = addr
                if not fallback_area:
                    fallback_area = "Udhana"
                addr = reverse_geocode(f.latitude, f.longitude, fallback_area=fallback_area)
            except Exception:
                addr = "Address unavailable"
        contract_fixes.append(
            LocalizationFix(
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
                covariance_json=f.covariance_json,
                geocoded_address=addr,
                created_at=f.created_at,
            )
        )
    engine = LocalizationEngine(utm_zone=settings.UTM_ZONE, target_type="pedestrian")
    geojson = engine.to_geojson(contract_fixes, frames=frames)
    return geojson


@router.get(
    "/api/case/{case_id}/heatmap",
    status_code=status.HTTP_200_OK,
    summary="Compute KDE probability heatmap over cached fixes",
)
async def get_case_heatmap(
    case_id: str,
    start: str | None = None,
    end: str | None = None,
    resolution_m: int = 50,
    officer: OfficerModel = Depends(get_current_officer),
    db: AsyncSession = Depends(get_db_session),
) -> dict[str, Any]:
    """
    Runs a 2D gaussian KDE over cached localization fixes (reusing the same
    start/end time filter as /localize/geojson) and returns a weighted lattice
    point FeatureCollection for leaflet.heat.
    """
    await check_case_access(case_id, officer, db)
    from app.localization.heatmap import compute_heatmap

    repo = TelecomRepository(db)
    start_dt = _parse_bound(start, "start")
    end_dt = _parse_bound(end, "end")
    fixes = await repo.get_localization_fixes(case_id, start_time=start_dt, end_time=end_dt)

    if not fixes:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"No cached localization fixes for case '{case_id}'. Run POST /api/case/{case_id}/localize first.",
        )

    heatmap = compute_heatmap(fixes, resolution_m=resolution_m)
    logger.info("case_heatmap_computed", case_id=case_id, points=len(heatmap["features"]))
    return heatmap


@router.get(
    "/api/case/{case_id}/rtt-observations",
    status_code=status.HTTP_200_OK,
    summary="Per-frame RTT/TA tower observations for single-tower RTT mode",
)
async def get_case_rtt_observations(
    case_id: str,
    officer: OfficerModel = Depends(get_current_officer),
    db: AsyncSession = Depends(get_db_session),
) -> dict[str, Any]:
    """
    Returns each measurement frame with its observed towers and the single-tower
    RTT/TA distance band + sector geometry (original data, no localization math).
    Upload_id is included so the frontend can color per file.
    """
    await check_case_access(case_id, officer, db)
    repo = TelecomRepository(db)
    frames = await repo.get_frames_by_case(case_id)

    observations = []
    for f in frames:
        towers = []
        for t in f.towers:
            if not (t.latitude and t.longitude):
                continue
            # Distance band from TA (LTE step 78.12m) or RTT (round-trip time→distance).
            radius_m = t.pseudorange_meters
            if not radius_m:
                radius_m = (t.timing_advance or 0) * 78.12 or 0.0
            towers.append({
                "cgi": t.cgi,
                "latitude": t.latitude,
                "longitude": t.longitude,
                "azimuth": t.azimuth,
                "beamwidth": t.beamwidth,
                "radius_meters": round(radius_m, 1),
                "timing_advance": t.timing_advance,
                "rtt": t.rtt,
                "signal_strength": t.signal_strength,
            })
        observations.append({
            "frame_id": str(f.frame_id),
            "upload_id": str(f.upload_id),
            "subscriber_identifier": f.subscriber_identifier,
            "timestamp": f.timestamp.isoformat(),
            "towers": towers,
        })

    return {"case_id": case_id, "observations": observations, "total": len(observations)}


@router.get(
    "/api/case/{case_id}/report",
    status_code=status.HTTP_200_OK,
    summary="Generate forensic report for a case",
)
async def get_forensic_report(
    case_id: str,
    req: Request = None,
    officer: OfficerModel = Depends(get_current_officer),
    db: AsyncSession = Depends(get_db_session),
) -> dict[str, Any]:
    """
    Generates a structured forensic report summarizing the localization analysis
    for court-admissible evidence.
    """
    await check_case_access(case_id, officer, db)
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

    await record_audit_event(
        db=db,
        action="REPORT_GENERATED",
        actor_id=officer.officer_id,
        actor_name=officer.officer_name,
        actor_email=officer.email,
        actor_role=officer.role,
        case_id=case_id,
        ip_address=req.client.host if req and req.client else None,
    )
    await db.commit()

    return generate_forensic_report(case_id, contract_fixes)


@router.get(
    "/api/cases",
    status_code=status.HTTP_200_OK,
    summary="List investigation cases based on role and assignments",
)
async def list_cases(
    officer: OfficerModel = Depends(get_current_officer),
    db: AsyncSession = Depends(get_db_session),
) -> dict[str, Any]:
    repo = TelecomRepository(db)
    all_cases = await repo.get_all_cases()

    if officer.role == "ADMIN":
        cases = all_cases
    else:
        # Inspectors see cases assigned to them or created by them
        stmt_assign = select(CaseAssignmentModel.case_id).where(
            CaseAssignmentModel.officer_id == officer.officer_id
        )
        res_assign = await db.execute(stmt_assign)
        assigned_case_ids = set(res_assign.scalars().all())

        cases = [
            c for c in all_cases
            if c.get("id") in assigned_case_ids or c.get("created_by") in (officer.officer_name, officer.email)
        ]

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
    officer: OfficerModel = Depends(get_current_officer),
    db: AsyncSession = Depends(get_db_session),
) -> dict[str, Any]:
    await check_case_access(case_id, officer, db)
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
        "status": case_model.status if case_model and case_model.status else "Active",
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


VALID_LIFECYCLE_STATUSES = {"Active", "Pending", "Completed", "Archived"}


class UpdateCaseStatusRequest(BaseModel):
    status: str = Field(..., description="Lifecycle status: Active, Pending, Completed, or Archived")


@router.patch(
    "/api/case/{case_id}/status",
    status_code=status.HTTP_200_OK,
    summary="Update investigation case lifecycle status",
)
@router.patch(
    "/api/case/{case_id}",
    status_code=status.HTTP_200_OK,
    summary="Update investigation case lifecycle status",
)
async def update_case_status(
    case_id: str,
    body: UpdateCaseStatusRequest,
    req: Request = None,
    officer: OfficerModel = Depends(get_current_officer),
    db: AsyncSession = Depends(get_db_session),
) -> dict[str, Any]:
    """
    Updates the lifecycle status of an investigation case (Active, Pending, Completed, Archived).
    Persists the change to the database without altering technical tracking status.
    """
    await check_case_access(case_id, officer, db)
    from app.utils.datetime_utils import now_ist

    raw_status = body.status.strip() if body.status else ""
    matched_status = None
    for valid in VALID_LIFECYCLE_STATUSES:
        if raw_status.lower() == valid.lower():
            matched_status = valid
            break

    if not matched_status:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Invalid case status '{body.status}'. Must be one of: {', '.join(sorted(VALID_LIFECYCLE_STATUSES))}",
        )

    repo = TelecomRepository(db)
    case = await repo.get_case_by_id(case_id)
    if not case:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Investigation '{case_id}' not found.",
        )

    old_status = case.status
    case.status = matched_status
    case.updated_at = now_ist()

    await record_audit_event(
        db=db,
        action="CASE_STATUS_UPDATED",
        actor_id=officer.officer_id,
        actor_name=officer.officer_name,
        actor_email=officer.email,
        actor_role=officer.role,
        case_id=case_id,
        details={"old_status": old_status, "new_status": matched_status},
        ip_address=req.client.host if req and req.client else None,
    )

    await db.commit()

    logger.info("case_status_updated", case_id=case_id, new_status=matched_status, officer=officer.officer_name)

    return {
        "id": case.case_id,
        "case_id": case.case_id,
        "case_name": case.case_name,
        "case_number": case.case_number,
        "status": case.status,
        "updated_at": case.updated_at.isoformat(),
        "message": f"Case status updated to {matched_status}",
    }


@router.delete(
    "/api/case/{case_id}",
    status_code=status.HTTP_200_OK,
    summary="Delete an investigation case and its associated data (ADMIN ONLY)",
)
async def delete_investigation_case(
    case_id: str,
    req: Request = None,
    officer: OfficerModel = Depends(require_admin),
    db: AsyncSession = Depends(get_db_session),
) -> dict[str, Any]:
    """
    Deletes a case, its uploads, dependent pipeline records, localization fixes,
    and Supabase storage objects. Strictly restricted to ADMINISTRATOR role.
    """
    repo = TelecomRepository(db)
    case = await repo.get_case_by_id(case_id)
    if not case:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Investigation not found.",
        )

    uploads = await repo.get_uploads_by_case(case_id)
    for upload in uploads:
        if upload.supabase_path:
            try:
                storage_service.delete_file(upload.supabase_path)
            except Exception as e:
                logger.warning(
                    "supabase_delete_failed_during_case_delete",
                    path=upload.supabase_path,
                    error=str(e),
                )

    await record_audit_event(
        db=db,
        action="CASE_DELETED",
        actor_id=officer.officer_id,
        actor_name=officer.officer_name,
        actor_email=officer.email,
        actor_role=officer.role,
        case_id=case_id,
        details={"case_name": case.case_name, "case_number": case.case_number},
        ip_address=req.client.host if req and req.client else None,
    )

    try:
        await repo.delete_case(case_id)
        await db.commit()
    except Exception as e:
        await db.rollback()
        logger.error("case_delete_failed", case_id=case_id, error=str(e))
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Failed to delete investigation.",
        ) from e

    logger.info("case_deleted", case_id=case_id, officer=officer.officer_name)
    return {
        "case_id": case_id,
        "message": "Investigation deleted successfully",
    }


@router.get(
    "/api/case/{case_id}/events",
    status_code=status.HTTP_200_OK,
    summary="Get normalized subscriber CDR records for a case",
)
async def get_case_events(
    case_id: str,
    limit: int = 500,
    officer: OfficerModel = Depends(get_current_officer),
    db: AsyncSession = Depends(get_db_session),
) -> dict[str, Any]:
    await check_case_access(case_id, officer, db)
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
    "/api/case/{case_id}/quality-report",
    status_code=status.HTTP_200_OK,
    summary="Get case data quality summary report",
)
async def get_case_quality_report(
    case_id: str,
    db: AsyncSession = Depends(get_db_session),
) -> dict[str, Any]:
    """
    Computes data quality statistics for an investigation case.
    """
    repo = TelecomRepository(db)
    case = await repo.get_case_by_id(case_id)
    if not case:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Case '{case_id}' not found.",
        )

    uploads = await repo.get_uploads_by_case(case_id)
    files_info = []
    unique_operators = set()
    for u in uploads:
        files_info.append({
            "upload_id": str(u.upload_id),
            "display_name": u.display_name or u.original_filename,
            "operator": u.operator,
            "source_type": u.source_type,
            "status": u.upload_status,
            "size_bytes": u.file_size_bytes,
            "error_message": u.error_message,
        })
        if u.operator:
            unique_operators.add(u.operator)

    from sqlalchemy import select, func
    from app.database.models.telecom import SubscriberEventRecordModel, MeasurementFrameModel, LocalizationFixModel

    upload_ids = [u.upload_id for u in uploads]
    if not upload_ids:
        return {
            "case_id": case_id,
            "case_name": case.case_name,
            "case_number": case.case_number,
            "operators": [],
            "files": [],
            "total_records": 0,
            "valid_records": 0,
            "rejected_records": 0,
            "unique_towers": 0,
            "unique_subscribers": 0,
            "time_range": None,
            "ta_available_pct": 0.0,
            "rtt_available_pct": 0.0,
            "frames_created": 0,
            "frames_skipped": 0,
            "fixes_generated": 0,
        }

    stmt = select(
        func.count(SubscriberEventRecordModel.event_id).label("total"),
        func.count(SubscriberEventRecordModel.timing_advance).label("ta_count"),
        func.count(SubscriberEventRecordModel.rtt).label("rtt_count"),
        func.min(SubscriberEventRecordModel.timestamp).label("min_time"),
        func.max(SubscriberEventRecordModel.timestamp).label("max_time"),
        func.count(func.distinct(SubscriberEventRecordModel.cgi)).label("unique_towers"),
        func.count(func.distinct(SubscriberEventRecordModel.phone_number)).label("unique_subscribers"),
    ).where(SubscriberEventRecordModel.upload_id.in_(upload_ids))

    res = await db.execute(stmt)
    row = res.fetchone()
    total_records = row.total if row else 0
    ta_count = row.ta_count if row else 0
    rtt_count = row.rtt_count if row else 0
    min_time = row.min_time if row else None
    max_time = row.max_time if row else None
    unique_towers = row.unique_towers if row else 0
    unique_subscribers = row.unique_subscribers if row else 0

    # Count of failed/rejected rows from the uploads or raw validation warnings
    # Since rejected records are not saved to subscriber_event_records,
    # we can count any files that failed or estimate errors.
    # For now, if upload_status is 'failed', count all records in that upload as rejected.
    rejected_records = sum(u.file_size_bytes // 100 for u in uploads if u.upload_status == "failed") # rough approximation

    frames_stmt = select(func.count(MeasurementFrameModel.frame_id)).where(
        MeasurementFrameModel.upload_id.in_(upload_ids)
    )
    frames_res = await db.execute(frames_stmt)
    frames_created = frames_res.scalar() or 0

    fixes_stmt = select(func.count(LocalizationFixModel.fix_id)).where(
        LocalizationFixModel.case_id == case_id
    )
    fixes_res = await db.execute(fixes_stmt)
    fixes_generated = fixes_res.scalar() or 0

    frames_skipped = max(0, frames_created - fixes_generated)

    return {
        "case_id": case_id,
        "case_name": case.case_name,
        "case_number": case.case_number,
        "operators": list(unique_operators),
        "files": files_info,
        "total_records": total_records,
        "valid_records": total_records,
        "rejected_records": rejected_records,
        "unique_towers": unique_towers,
        "unique_subscribers": unique_subscribers,
        "time_range": {
            "start": min_time.isoformat() if min_time else None,
            "end": max_time.isoformat() if max_time else None,
        } if min_time else None,
        "ta_available_pct": round((ta_count / total_records * 100), 2) if total_records > 0 else 0.0,
        "rtt_available_pct": round((rtt_count / total_records * 100), 2) if total_records > 0 else 0.0,
        "frames_created": frames_created,
        "frames_skipped": frames_skipped,
        "fixes_generated": fixes_generated,
    }


@router.get(
    "/api/dashboard/stats",
    status_code=status.HTTP_200_OK,
    summary="Get dashboard statistics scoped to the requesting officer",
)
async def get_dashboard_stats(
    officer: OfficerModel = Depends(get_current_officer),
    db: AsyncSession = Depends(get_db_session),
) -> dict[str, Any]:
    """Officers see stats for their own cases; admins see global totals."""
    repo = TelecomRepository(db)
    return await repo.get_dashboard_stats(officer=officer)


@router.post(
    "/api/case/{case_id}/verify-rf",
    status_code=status.HTTP_200_OK,
    summary="Ground-verify a suspect position with officer-carried RF/SDR scans",
)
async def verify_rf_ground_truth(
    case_id: str,
    scans: list[RfScan],
    officer: OfficerModel = Depends(get_current_officer),
    db: AsyncSession = Depends(get_db_session),
) -> dict[str, Any]:
    """
    Accepts a list of SDR scans (timestamp, lat, lon, frequency, RSSI, bearing)
    and produces a last-50-metre micro-fix via log-distance path loss.

    Returns a GeoJSON Feature (properties.type == 'rf_verified_fix') so the
    frontend can reuse existing map rendering. Nothing is persisted — this is a
    live ground-truth check, not evidence.
    """
    await check_case_access(case_id, officer, db)

    from app.database.repository import TelecomRepository as _Repo
    _repo = _Repo(db)
    if not await _repo.get_case_by_id(case_id):
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Case '{case_id}' not found.",
        )

    if not scans:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="No RF scans supplied.",
        )

    result = verify_scans(scans)

    if result.micro_fix_latitude is None or result.micro_fix_longitude is None:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail=(
                "Could not resolve an RF micro-fix: "
                + (f"{result.skipped_scan_count} scan(s) skipped "
                   "(missing bearing or RSSI at/below noise floor)."
                   if result.skipped_scan_count else
                   "micro-fix fell outside the India geofence.")
            ),
        )

    geojson: dict[str, Any] = {
        "type": "Feature",
        "id": str(uuid4()),
        "geometry": {
            "type": "Point",
            "coordinates": [result.micro_fix_longitude, result.micro_fix_latitude],
        },
        "properties": {
            "type": "rf_verified_fix",
            "case_id": case_id,
            "timestamp": scans[-1].timestamp.isoformat(),
            "estimated_distance_meters": result.estimated_distance_meters,
            "confidence_radius_meters": result.confidence_radius_meters,
            "method": result.method,
            "skipped_scan_count": result.skipped_scan_count,
            "scan_count": len(scans),
        },
    }

    return {
        "case_id": case_id,
        "geojson": geojson,
        "micro_fix": {
            "latitude": result.micro_fix_latitude,
            "longitude": result.micro_fix_longitude,
            "confidence_radius_meters": result.confidence_radius_meters,
        },
    }

