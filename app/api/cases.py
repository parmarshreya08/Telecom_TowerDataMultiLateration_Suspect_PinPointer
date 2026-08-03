"""
Case + Localization Router.
Exposes endpoints for listing a case's uploads and running/reading
localization fixes (GeoJSON) for an investigation case.
"""

from typing import Any

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import settings
from app.core.logging import logger
from app.database.repository import TelecomRepository
from app.database.session import get_db_session
from app.localization.engine import LocalizationEngine

router = APIRouter()


def _fixes_to_geojson(fixes: list[Any]) -> dict[str, Any]:
    """
    Serializes stored LocalizationFixModel rows into a GeoJSON FeatureCollection.
    """
    from datetime import datetime, timezone

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
            "generated_at": datetime.now(timezone.utc).isoformat(),
        },
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
    db: AsyncSession = Depends(get_db_session),
) -> dict[str, Any]:
    """
    Returns the previously computed GeoJSON fixes for a case, without recomputation.
    """
    repo = TelecomRepository(db)
    fixes = await repo.get_localization_fixes(case_id)

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
