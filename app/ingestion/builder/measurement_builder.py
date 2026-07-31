"""
Measurement Frame Builder stage.
Groups normalized SubscriberEventRecords and coordinates them with TowerRecords 
to construct structured MeasurementFrames for trilateration analysis.
"""

from datetime import timedelta
from typing import Optional
from uuid import uuid4

from app.contracts.enums import FrameStatus
from app.contracts.measurement import MeasurementFrame, MeasurementTower
from app.contracts.subscriber import SubscriberEventRecord
from app.contracts.tower import TowerRecord
from app.core.logging import logger
from app.services.tower_lookup import TowerLookupService


class MeasurementFrameBuilder:
    """
    Assembles spatial-temporal measurement frames for suspect subscriber tracking.
    """

    def __init__(self, tower_lookup: TowerLookupService) -> None:
        self.tower_lookup = tower_lookup

    async def build_frames(
        self,
        records: list[SubscriberEventRecord],
        time_window_minutes: int = 5
    ) -> list[MeasurementFrame]:
        """
        Groups normalized subscriber records temporally and compiles MeasurementFrames.

        Looks up physical site parameters for each CGI and calculates distance estimations
        based on timing advance network markers.

        Args:
            records: Normalized list of SubscriberEventRecords.
            time_window_minutes: Temporal spacing window to group signals (default 5 minutes).

        Returns:
            List of compiled MeasurementFrame objects.
        """
        logger.info(
            "building_measurement_frames",
            record_count=len(records),
            time_window_min=time_window_minutes
        )

        frames: list[MeasurementFrame] = []
        
        # Group records by subscriber phone number or IMSI
        by_subscriber: dict[str, list[SubscriberEventRecord]] = {}
        for rec in records:
            sub_id = rec.phone_number or rec.imsi or "Unknown"
            by_subscriber.setdefault(sub_id, []).append(rec)

        for subscriber_id, sub_records in by_subscriber.items():
            # Sort records chronologically
            sorted_recs = sorted(sub_records, key=lambda x: x.timestamp)
            
            # Simple grouping by time windows
            current_window: list[SubscriberEventRecord] = []
            
            for rec in sorted_recs:
                if not current_window:
                    current_window.append(rec)
                    continue
                
                # Check if current record is within the time window of the first record in window
                time_diff = rec.timestamp - current_window[0].timestamp
                if time_diff <= timedelta(minutes=time_window_minutes):
                    current_window.append(rec)
                else:
                    # Compile the frame for the closed window
                    frame = await self._compile_frame(subscriber_id, current_window)
                    if frame:
                        frames.append(frame)
                    current_window = [rec]
            
            # Compile remaining window
            if current_window:
                frame = await self._compile_frame(subscriber_id, current_window)
                if frame:
                    frames.append(frame)

        logger.info("measurement_frames_built", frame_count=len(frames))
        return frames

    async def _compile_frame(
        self, subscriber_id: str, window_records: list[SubscriberEventRecord]
    ) -> Optional[MeasurementFrame]:
        """
        Compiles a list of windowed logs into a single MeasurementFrame.
        Only generates a frame if at least 3 unique towers are found.
        """
        if not window_records:
            return None

        towers_seen: list[MeasurementTower] = []
        seen_cgis: set[str] = set()

        for rec in window_records:
            if rec.cgi in seen_cgis:
                continue

            # Resolve coordinates from database lookup
            tower_info: Optional[TowerRecord] = await self.tower_lookup.find_by_cgi(rec.cgi)
            
            if not tower_info:
                logger.warn("tower_cgi_not_found_for_frame", cgi=rec.cgi)
                continue

            # Estimate range in meters if Timing Advance (TA) is present
            distance_est = None
            if rec.timing_advance is not None:
                # Basic representation: 1 TA approx 78m in LTE
                distance_est = float(rec.timing_advance * 78.12)

            towers_seen.append(
                MeasurementTower(
                    tower_id=tower_info.tower_id,
                    cgi=rec.cgi,
                    latitude=tower_info.latitude,
                    longitude=tower_info.longitude,
                    azimuth=tower_info.azimuth,
                    beamwidth=tower_info.beamwidth,
                    signal_strength=rec.signal_strength,
                    timing_advance=rec.timing_advance,
                    rtt=rec.rtt,
                    pseudorange_meters=distance_est
                )
            )
            seen_cgis.add(rec.cgi)

        # A minimum of 3 towers is required to instantiate MeasurementFrame successfully 
        # and satisfy Pydantic validations
        if len(towers_seen) < 3:
            logger.debug(
                "skipping_measurement_frame",
                subscriber_id=subscriber_id,
                towers_count=len(towers_seen),
                reason="insufficient_towers_for_trilateration"
            )
            return None

        # Use midpoint timestamp of the window
        midpoint_ts = window_records[0].timestamp + (
            (window_records[-1].timestamp - window_records[0].timestamp) / 2
        )

        return MeasurementFrame(
            frame_id=uuid4(),
            upload_id=window_records[0].upload_id,
            subscriber_identifier=subscriber_id,
            timestamp=midpoint_ts,
            towers=towers_seen,
            status=FrameStatus.READY
        )
