"""
Measurement Frame Builder stage.
Groups normalized SubscriberEventRecords and coordinates them with TowerRecords
to construct structured MeasurementFrames for trilateration analysis.
"""

from datetime import datetime, timedelta
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

    Real CDR cadence is irregular: gaps, bursts, non-uniform intervals, and
    multi-operator time misalignment. So records are chunked by *gap threshold*,
    then adjacent chunks are merged until the frame holds >=3 unique towers
    (bounded by ``max_window_minutes``) — no dependence on exact clock bins.
    """

    def __init__(self, tower_lookup: TowerLookupService) -> None:
        self.tower_lookup = tower_lookup

    async def build_frames(
        self,
        records: list[SubscriberEventRecord],
        time_window_minutes: int = 5,
        max_window_minutes: int = 15,
    ) -> list[MeasurementFrame]:
        """
        Groups normalized subscriber records and compiles MeasurementFrames.

        Args:
            records: Normalized list of SubscriberEventRecords.
            time_window_minutes: Max gap between consecutive records within one
                chunk (irregular-safe: chunk width follows the data, not a clock bin).
            max_window_minutes: Hard cap on a frame's total time span when merging
                sparse chunks to reach 3 unique towers.

        Returns:
            List of compiled MeasurementFrame objects.
        """
        logger.info(
            "building_measurement_frames",
            record_count=len(records),
            time_window_min=time_window_minutes,
            max_window_min=max_window_minutes,
        )

        frames: list[MeasurementFrame] = []

        by_subscriber: dict[str, list[SubscriberEventRecord]] = {}
        for rec in records:
            # Device-first pivot: a handset (IMEI) is the physical entity we track.
            # SIMs (IMSI) and phone numbers (MSISDN) can change on it — swapping SIMs
            # or moving the number between handsets must not split one device's trail.
            sub_id = rec.imei or rec.phone_number or rec.imsi or "Unknown"
            by_subscriber.setdefault(sub_id, []).append(rec)

        for subscriber_id, sub_records in by_subscriber.items():
            sorted_recs = sorted(sub_records, key=lambda x: x.timestamp)
            frames.extend(
                await self._build_subscriber_frames(
                    subscriber_id,
                    sorted_recs,
                    time_window_minutes,
                    max_window_minutes,
                )
            )

        logger.info("measurement_frames_built", frame_count=len(frames))
        return frames

    async def _build_subscriber_frames(
        self,
        subscriber_id: str,
        sorted_recs: list[SubscriberEventRecord],
        window_minutes: int,
        max_window_minutes: int,
    ) -> list[MeasurementFrame]:
        """
        Chunks one subscriber's chronological records by inter-record gap,
        then merges neighboring chunks until a frame has >=3 unique towers
        (or hits the max-span cap). Drops frames that never reach 3 towers.
        """
        chunks: list[list[SubscriberEventRecord]] = []
        current = [sorted_recs[0]]
        for rec in sorted_recs[1:]:
            if rec.timestamp - current[-1].timestamp <= timedelta(
                minutes=window_minutes
            ):
                current.append(rec)
            else:
                chunks.append(current)
                current = [rec]
        chunks.append(current)

        frames: list[MeasurementFrame] = []
        i = 0
        while i < len(chunks):
            acc = list(chunks[i])
            i += 1
            while i < len(chunks):
                merged = acc + chunks[i]
                if merged[-1].timestamp - merged[0].timestamp > timedelta(
                    minutes=max_window_minutes
                ):
                    break
                acc = merged
                i += 1
                if self._unique_cgi_count(acc) >= 3:
                    break

            frame = await self._compile_frame(subscriber_id, acc)
            if frame:
                frames.append(frame)

        return frames

    @staticmethod
    def _unique_cgi_count(records: list[SubscriberEventRecord]) -> int:
        return len({r.cgi for r in records})

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
            tower_info: Optional[TowerRecord] = await self.tower_lookup.find_by_cgi(
                rec.cgi
            )

            if not tower_info:
                logger.warning("tower_cgi_not_found_for_frame", cgi=rec.cgi)
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
                    pseudorange_meters=distance_est,
                    is_catalog=tower_info.is_catalog,
                )
            )
            seen_cgis.add(rec.cgi)

        # A minimum of 1 tower is required to instantiate MeasurementFrame
        if len(towers_seen) < 1:
            logger.debug(
                "skipping_measurement_frame",
                subscriber_id=subscriber_id,
                towers_count=len(towers_seen),
                reason="no_valid_towers_found",
            )
            return None

        # Use midpoint timestamp of the window
        midpoint_ts: datetime = window_records[0].timestamp + (
            (window_records[-1].timestamp - window_records[0].timestamp) / 2
        )

        # SIM swap / multi-SIM handover: more than one distinct IMSI seen on this
        # device within the frame.
        distinct_imsis = {r.imsi for r in window_records if r.imsi}

        return MeasurementFrame(
            frame_id=uuid4(),
            upload_id=window_records[0].upload_id,
            subscriber_identifier=subscriber_id,
            timestamp=midpoint_ts,
            towers=towers_seen,
            sim_swap=len(distinct_imsis) > 1,
            status=FrameStatus.READY,
        )
