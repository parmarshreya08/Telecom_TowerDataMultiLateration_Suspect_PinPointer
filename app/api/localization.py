"""
Standalone Localization Engine API Router for E-Rakshak.
Provides open API endpoints for external callers, models, and services
to submit tower observation data and receive 3-tower multilateration + Kalman
position estimates and map GeoJSON.
"""

from uuid import uuid4
from fastapi import APIRouter, HTTPException, status

from app.contracts.enums import FrameStatus
from app.contracts.localization import (
    LocalizationEstimateRequest,
    LocalizationEstimateResponse,
    SingleFrameInput,
)
from app.contracts.measurement import MeasurementFrame, MeasurementTower
from app.core.logging import logger
from app.localization.engine import LocalizationEngine
from app.utils.datetime_utils import now_ist

router = APIRouter(prefix="/api/v1/localization", tags=["Localization Engine API"])


def _convert_input_to_measurement_frame(
    frame_input: SingleFrameInput,
    subscriber_identifier: str,
    upload_id: str,
) -> MeasurementFrame:
    """
    Utility converting standalone input schema into internal MeasurementFrame contract.
    """
    towers: list[MeasurementTower] = []
    for tower_in in frame_input.towers:
        tower_id = tower_in.tower_id if tower_in.tower_id else uuid4()
        towers.append(
            MeasurementTower(
                tower_id=tower_id,
                cgi=tower_in.cgi,
                latitude=tower_in.latitude,
                longitude=tower_in.longitude,
                azimuth=tower_in.azimuth,
                beamwidth=tower_in.beamwidth,
                signal_strength=tower_in.signal_strength,
                timing_advance=tower_in.timing_advance,
                rtt=tower_in.rtt,
                pseudorange_meters=tower_in.pseudorange_meters,
                is_catalog=tower_in.is_catalog,
            )
        )

    timestamp = frame_input.timestamp if frame_input.timestamp else now_ist()

    return MeasurementFrame(
        frame_id=uuid4(),
        upload_id=upload_id,
        subscriber_identifier=subscriber_identifier,
        timestamp=timestamp,
        towers=towers,
        status=FrameStatus.READY,
    )


@router.post(
    "/estimate",
    response_model=LocalizationEstimateResponse,
    status_code=status.HTTP_200_OK,
    summary="Compute position estimates for tower measurement frames",
    description=(
        "Public endpoint allowing any caller to submit cell tower observations "
        "(timing advance, pseudoranges, RSSI, cell site coordinates) and receive "
        "stage-1 JPL multilateration + stage-2 Kalman position estimates with GeoJSON."
    ),
)
async def estimate_localization(
    payload: LocalizationEstimateRequest,
) -> LocalizationEstimateResponse:
    """
    Computes position fixes for submitted measurement frames.
    """
    if not payload.frames:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="At least one frame containing minimum 3 cell towers is required.",
        )

    upload_id = uuid4()
    measurement_frames: list[MeasurementFrame] = []

    for frame_in in payload.frames:
        if len(frame_in.towers) < 3:
            raise HTTPException(
                status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
                detail=f"Each frame requires at least 3 observed cell towers. Provided: {len(frame_in.towers)}.",
            )
        mf = _convert_input_to_measurement_frame(
            frame_in,
            subscriber_identifier=payload.subscriber_identifier,
            upload_id=upload_id,
        )
        measurement_frames.append(mf)

    logger.info(
        "standalone_localization_estimate_requested",
        subscriber=payload.subscriber_identifier,
        frame_count=len(measurement_frames),
        target_type=payload.target_type,
        apply_kalman=payload.apply_kalman,
    )

    engine = LocalizationEngine(
        utm_zone=payload.utm_zone,
        target_type=payload.target_type,
    )

    fixes = engine.compute_fixes(
        frames=measurement_frames,
        case_id=payload.case_id,
    )

    if not fixes:
        logger.warning(
            "standalone_localization_estimate_no_fixes",
            subscriber=payload.subscriber_identifier,
            frame_count=len(measurement_frames),
        )
        return LocalizationEstimateResponse(
            status="no_fixes_resolved",
            fix_count=0,
            fixes=[],
            geojson={"type": "FeatureCollection", "features": []},
            rogue_cgis_detected=list(getattr(engine, "rogue_cgis", set())),
        )

    if not payload.include_velocity:
        for fix in fixes:
            fix.velocity_east = None
            fix.velocity_north = None

    geojson_output = engine.to_geojson(
        fixes=fixes,
        include_ellipses=True,
        include_sector_wedges=True,
        frames=measurement_frames,
    )

    if not payload.include_velocity:
        for feat in geojson_output.get("features", []):
            if feat.get("properties"):
                feat["properties"].pop("velocity_east", None)
                feat["properties"].pop("velocity_north", None)

    rogue_cgis = list(getattr(engine, "rogue_cgis", set()))

    return LocalizationEstimateResponse(
        status="success",
        fix_count=len(fixes),
        fixes=fixes,
        geojson=geojson_output,
        rogue_cgis_detected=rogue_cgis,
    )



@router.post(
    "/estimate/single",
    response_model=LocalizationEstimateResponse,
    status_code=status.HTTP_200_OK,
    summary="Compute position estimate for a single frame of towers",
    description="Convenience endpoint for single spatial-temporal observation instant.",
)
async def estimate_single_frame(
    frame_input: SingleFrameInput,
    subscriber_identifier: str = "EXTERNAL_TARGET",
    target_type: str = "pedestrian",
) -> LocalizationEstimateResponse:
    """
    Computes single instant multilateration position estimate.
    """
    request_payload = LocalizationEstimateRequest(
        subscriber_identifier=subscriber_identifier,
        case_id="SINGLE_FRAME_QUERY",
        target_type=target_type,
        frames=[frame_input],
        apply_kalman=False,
    )
    return await estimate_localization(request_payload)
