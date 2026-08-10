"""
Export Router for E-Rakshak.
Provides CSV, KML, and PDF download endpoints for localization fixes.
All endpoints accept optional start/end query params for time-range filtering.
"""

from datetime import datetime as _dt
from typing import Any, Optional

from fastapi import APIRouter, Depends, HTTPException, Query, status
from fastapi.responses import Response, StreamingResponse
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.logging import logger
from app.database.repository import TelecomRepository
from app.database.session import get_db_session
from app.localization.exports import generate_csv, generate_kml, generate_pdf
from app.localization.forensic_report import generate_forensic_report
from app.contracts.localization import LocalizationFix as FixContract

router = APIRouter()


async def _get_filtered_fixes(
    case_id: str,
    start: Optional[str],
    end: Optional[str],
    db: AsyncSession,
) -> list[Any]:
    """Common helper: fetch time-filtered fixes or raise 404."""
    start_dt = _dt.fromisoformat(start) if start else None
    end_dt = _dt.fromisoformat(end) if end else None

    repo = TelecomRepository(db)
    fixes = await repo.get_localization_fixes(case_id, start_time=start_dt, end_time=end_dt)

    if not fixes:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"No localization fixes found for case '{case_id}' in the given time range.",
        )
    return fixes


def _to_contract(fix: Any) -> FixContract:
    """Convert DB model to Pydantic contract for forensic report generator."""
    return FixContract(
        fix_id=fix.fix_id,
        case_id=fix.case_id,
        frame_id=fix.frame_id,
        subscriber_identifier=fix.subscriber_identifier,
        timestamp=fix.timestamp,
        latitude=fix.latitude,
        longitude=fix.longitude,
        velocity_east=fix.velocity_east,
        velocity_north=fix.velocity_north,
        confidence_radius_meters=fix.confidence_radius_meters,
        gdop=fix.gdop,
        residual_rms=fix.residual_rms,
        ta_inner_m=fix.ta_inner_m,
        ta_outer_m=fix.ta_outer_m,
        rss_i_dbm=fix.rss_i_dbm,
    )


# ── CSV Export ──────────────────────────────────────────────


@router.get(
    "/api/case/{case_id}/export/csv",
    status_code=status.HTTP_200_OK,
    summary="Export localization fixes as CSV",
)
async def export_csv(
    case_id: str,
    start: str | None = Query(None, description="ISO datetime start (e.g. 2026-01-01T00:00:00)"),
    end: str | None = Query(None, description="ISO datetime end"),
    db: AsyncSession = Depends(get_db_session),
) -> Response:
    fixes = await _get_filtered_fixes(case_id, start, end, db)
    csv_content = generate_csv(fixes, case_id)
    logger.info("export_csv", case_id=case_id, fix_count=len(fixes))
    return Response(
        content=csv_content,
        media_type="text/csv",
        headers={"Content-Disposition": f'attachment; filename="e-rakshak_{case_id}_fixes.csv"'},
    )


# ── KML Export ──────────────────────────────────────────────


@router.get(
    "/api/case/{case_id}/export/kml",
    status_code=status.HTTP_200_OK,
    summary="Export localization fixes as KML (Google Earth)",
)
async def export_kml(
    case_id: str,
    start: str | None = Query(None, description="ISO datetime start"),
    end: str | None = Query(None, description="ISO datetime end"),
    db: AsyncSession = Depends(get_db_session),
) -> Response:
    fixes = await _get_filtered_fixes(case_id, start, end, db)
    kml_content = generate_kml(fixes, case_id)
    logger.info("export_kml", case_id=case_id, fix_count=len(fixes))
    return Response(
        content=kml_content,
        media_type="application/vnd.google-earth.kml+xml",
        headers={"Content-Disposition": f'attachment; filename="e-rakshak_{case_id}_fixes.kml"'},
    )


# ── PDF Export ──────────────────────────────────────────────


@router.get(
    "/api/case/{case_id}/export/pdf",
    status_code=status.HTTP_200_OK,
    summary="Export forensic PDF report for localization fixes",
)
async def export_pdf(
    case_id: str,
    start: str | None = Query(None, description="ISO datetime start"),
    end: str | None = Query(None, description="ISO datetime end"),
    db: AsyncSession = Depends(get_db_session),
) -> Response:
    fixes = await _get_filtered_fixes(case_id, start, end, db)

    # Generate forensic report data for metadata/methodology sections
    contract_fixes = [_to_contract(f) for f in fixes]
    report_data = generate_forensic_report(case_id, contract_fixes)

    pdf_bytes = generate_pdf(fixes, case_id, report_data)
    logger.info("export_pdf", case_id=case_id, fix_count=len(fixes))
    return Response(
        content=pdf_bytes,
        media_type="application/pdf",
        headers={"Content-Disposition": f'attachment; filename="e-rakshak_{case_id}_forensic_report.pdf"'},
    )
