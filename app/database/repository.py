"""
Database repository layer for E-Rakshak.
Handles CRUD and bulk persist operations for telecom models.
Converts between Pydantic contracts and SQLAlchemy database models.
"""

from datetime import datetime
from math import asin, cos, radians, sin, sqrt
from typing import Any, Optional
from uuid import UUID

from sqlalchemy import delete, func, select
from sqlalchemy.dialects.postgresql import insert
from sqlalchemy.ext.asyncio import AsyncSession

from app.contracts.enums import CallType, FrameStatus, Operator, RadioTechnology, SourceType
from app.contracts.localization import LocalizationFix
from app.contracts.measurement import MeasurementFrame, MeasurementTower
from app.contracts.subscriber import SubscriberEventRecord
from app.contracts.tower import TowerRecord
from app.contracts.upload import UploadMetadata
from app.core.logging import logger
from app.database.models.telecom import (
    CaseModel,
    LocalizationFixModel,
    MeasurementFrameModel,
    MeasurementTowerModel,
    SubscriberEventRecordModel,
    TowerRecordModel,
    UploadMetadataModel,
)


def _haversine_m(lat1: float, lon1: float, lat2: float, lon2: float) -> float:
    """Great-circle distance in metres (pure-Python PostGIS fallback)."""
    dlat, dlon = radians(lat2 - lat1), radians(lon2 - lon1)
    a = sin(dlat / 2) ** 2 + cos(radians(lat1)) * cos(radians(lat2)) * sin(dlon / 2) ** 2
    return 2 * 6371000.0 * asin(sqrt(a))


class TelecomRepository:
    """
    Encapsulates database operations for telemetry models.
    """

    def __init__(self, session: AsyncSession) -> None:
        self.session = session

    # ── Case CRUD ────────────────────────────────────────────

    async def create_case(self, case: CaseModel) -> CaseModel:
        """
        Persists a new investigation case.
        """
        self.session.add(case)
        await self.session.flush()
        return case

    async def get_case_by_id(self, case_id: str) -> Optional[CaseModel]:
        """
        Retrieves a case by its ID.
        """
        stmt = select(CaseModel).where(CaseModel.case_id == case_id)
        result = await self.session.execute(stmt)
        return result.scalar_one_or_none()

    # ponytail: removed duplicate get_all_cases — kept the dict-returning version below

    async def update_case(self, case: CaseModel) -> CaseModel:
        """
        Updates an existing case.
        """
        await self.session.flush()
        return case

    async def delete_case(self, case_id: str) -> bool:
        """
        Deletes a case after removing uploads, pipeline data, localization fixes,
        assignments and live-tracking state. Audit rows are preserved for
        chain-of-custody (they reference case_id as plain text).
        """
        case = await self.get_case_by_id(case_id)
        if not case:
            return False
        await self.delete_uploads_by_case(case_id)
        await self.delete_localization_fixes_by_case(case_id)
        # Explicit cleanup: these tables have no ORM-level cascade here and
        # would otherwise orphan (assignments) or leak tracking state.
        try:
            from app.database.models import CaseAssignmentModel  # type: ignore
            await self.session.execute(
                delete(CaseAssignmentModel).where(CaseAssignmentModel.case_id == case_id)
            )
        except Exception:
            pass
        try:
            from app.database.models.live_tracking import (  # type: ignore
                LiveTrackingSession,
                LiveTrackingFixModel,
            )
            await self.session.execute(
                delete(LiveTrackingSession).where(LiveTrackingSession.case_id == case_id)
            )
            # Fixes are keyed by imsi only; best-effort: leave global fixes intact
            # (no case FK) to avoid deleting other cases' anchors.
        except Exception:
            pass
        await self.session.delete(case)
        await self.session.flush()
        return True

    async def delete_localization_fixes_by_case(self, case_id: str) -> None:
        """Removes all localization fixes for a case (including orphaned rows)."""
        await self.session.execute(
            delete(LocalizationFixModel).where(LocalizationFixModel.case_id == case_id)
        )

    # ── Upload Metadata ──────────────────────────────────────

    async def get_upload_by_hash(self, file_hash: str) -> Optional[UploadMetadataModel]:
        """
        Retrieves upload metadata by file checksum hash (SHA-256).
        Legacy global lookup; prefer get_upload_by_case_hash for scoped dedup.
        """
        stmt = select(UploadMetadataModel).where(UploadMetadataModel.sha256 == file_hash)
        result = await self.session.execute(stmt)
        return result.scalar_one_or_none()

    async def get_upload_by_case_hash(self, case_id: str, file_hash: str) -> Optional[UploadMetadataModel]:
        """Scoped dedup: same bytes in a different case must not be rejected."""
        stmt = select(UploadMetadataModel).where(
            UploadMetadataModel.case_id == case_id,
            UploadMetadataModel.sha256 == file_hash,
        )
        result = await self.session.execute(stmt)
        return result.scalar_one_or_none()

    async def create_upload_metadata(self, meta: UploadMetadata) -> UploadMetadataModel:
        """
        Registers a new file upload transaction record.
        """
        model = UploadMetadataModel(
            upload_id=meta.upload_id,
            case_id=meta.case_id,
            source_type=meta.source_type.value,
            operator=meta.operator.value,
            original_filename=meta.original_filename,
            stored_filename=meta.stored_filename,
            sha256=meta.sha256,
            mime_type=meta.mime_type,
            file_size_bytes=meta.file_size_bytes,
            uploaded_by=meta.uploaded_by,
            uploaded_at=meta.uploaded_at,
            supabase_path=meta.supabase_path,
            supabase_url=meta.supabase_url,
            display_name=meta.display_name,
            upload_status=meta.upload_status,
            file_source=meta.file_source,
        )
        self.session.add(model)
        return model

    async def get_tower_by_cgi(self, cgi: str) -> Optional[TowerRecord]:
        """
        Queries tower coordinates by Cell Global Identity code.
        """
        stmt = select(TowerRecordModel).where(TowerRecordModel.cgi == cgi)
        result = await self.session.execute(stmt)
        model = result.scalar_one_or_none()
        if not model:
            return None

        return TowerRecord(
            tower_id=model.tower_id,
            operator=Operator(model.operator),
            radio=RadioTechnology(model.radio),
            mcc=model.mcc,
            mnc=model.mnc,
            lac=model.lac,
            cell_id=model.cell_id,
            cgi=model.cgi,
            latitude=model.latitude,
            longitude=model.longitude,
            azimuth=model.azimuth,
            beamwidth=model.beamwidth,
            range_meters=model.range_meters,
            site_address=model.site_address
        )

    async def get_towers_by_cgis(self, cgis: list[str]) -> dict[str, TowerRecord]:
        """Batch lookup to avoid per-CGI N+1 round trips during framing."""
        uniq = list(dict.fromkeys([c for c in cgis if c]))
        if not uniq:
            return {}
        stmt = select(TowerRecordModel).where(TowerRecordModel.cgi.in_(uniq))
        result = await self.session.execute(stmt)
        out: dict[str, TowerRecord] = {}
        for model in result.scalars().all():
            try:
                out[model.cgi] = TowerRecord(
                    tower_id=model.tower_id,
                    operator=Operator(model.operator),
                    radio=RadioTechnology(model.radio),
                    mcc=model.mcc,
                    mnc=model.mnc,
                    lac=model.lac,
                    cell_id=model.cell_id,
                    cgi=model.cgi,
                    latitude=model.latitude,
                    longitude=model.longitude,
                    azimuth=model.azimuth,
                    beamwidth=model.beamwidth,
                    range_meters=model.range_meters,
                    site_address=model.site_address,
                )
            except Exception:
                continue
        return out

    async def save_tower_records(self, towers: list[TowerRecord]) -> None:
        """
        Bulk upserts tower coordinates (ON CONFLICT (cgi) DO UPDATE).
        """
        if not towers:
            return

        for t in towers:
            insert_stmt = insert(TowerRecordModel).values(
                tower_id=t.tower_id,
                operator=t.operator.value,
                radio=t.radio.value,
                mcc=t.mcc,
                mnc=t.mnc,
                lac=t.lac,
                cell_id=t.cell_id,
                cgi=t.cgi,
                latitude=t.latitude,
                longitude=t.longitude,
                azimuth=t.azimuth,
                beamwidth=t.beamwidth,
                range_meters=t.range_meters,
                site_address=t.site_address
            )
            # Update fields on conflict
            upsert_stmt = insert_stmt.on_conflict_do_update(
                index_elements=["cgi"],
                set_={
                    "latitude": t.latitude,
                    "longitude": t.longitude,
                    "azimuth": t.azimuth,
                    "beamwidth": t.beamwidth,
                    "range_meters": t.range_meters,
                    "site_address": t.site_address
                }
            )
            await self.session.execute(upsert_stmt)

        from app.services.tower_lookup import invalidate_catalog_cache
        invalidate_catalog_cache([t.cgi for t in towers])

    async def save_subscriber_events(self, events: list[SubscriberEventRecord]) -> None:
        """
        Bulk inserts normalized subscriber connection records.
        """
        if not events:
            return

        models = [
            SubscriberEventRecordModel(
                event_id=e.event_id,
                upload_id=e.upload_id,
                operator=e.operator.value,
                source_type=e.source_type.value,
                phone_number=e.phone_number,
                imei=e.imei,
                imsi=e.imsi,
                timestamp=e.timestamp,
                call_type=e.call_type.value,
                duration_seconds=e.duration_seconds,
                cgi=e.cgi,
                mcc=e.mcc,
                mnc=e.mnc,
                lac=e.lac,
                cell_id=e.cell_id,
                tower_latitude=e.tower_latitude,
                tower_longitude=e.tower_longitude,
                signal_strength=e.signal_strength,
                timing_advance=e.timing_advance,
                rtt=e.rtt,
                source_file=e.source_file,
                record_number=e.record_number,
                raw_fields=e.raw_fields
            )
            for e in events
        ]
        self.session.add_all(models)

    async def save_measurement_frames(self, frames: list[MeasurementFrame]) -> None:
        """
        Bulk inserts compiled Measurement Frames and their observed towers list.
        """
        if not frames:
            return

        for f in frames:
            frame_model = MeasurementFrameModel(
                frame_id=f.frame_id,
                upload_id=f.upload_id,
                subscriber_identifier=f.subscriber_identifier,
                timestamp=f.timestamp,
                status=f.status.value
            )
            self.session.add(frame_model)
            
            # Map child connection points
            tower_models = [
                MeasurementTowerModel(
                    frame_id=f.frame_id,
                    tower_id=t.tower_id,
                    cgi=t.cgi,
                    latitude=t.latitude,
                    longitude=t.longitude,
                    azimuth=t.azimuth,
                    beamwidth=t.beamwidth,
                    signal_strength=t.signal_strength,
                    timing_advance=t.timing_advance,
                    rtt=t.rtt,
                    pseudorange_meters=t.pseudorange_meters
                )
                for t in f.towers
            ]
            self.session.add_all(tower_models)

    async def count_measurement_frames_by_case(
        self, case_id: str, upload_ids: Optional[list] = None
    ) -> int:
        """
        Returns the number of measurement frames stored for a case,
        before trilateration eligibility filtering.
        """
        stmt = (
            select(func.count())
            .select_from(MeasurementFrameModel)
            .join(UploadMetadataModel, UploadMetadataModel.upload_id == MeasurementFrameModel.upload_id)
            .where(UploadMetadataModel.case_id == case_id)
        )
        if upload_ids:
            stmt = stmt.where(MeasurementFrameModel.upload_id.in_(upload_ids))
        result = await self.session.execute(stmt)
        return result.scalar() or 0

    async def get_frames_by_case(
        self, case_id: str, upload_ids: Optional[list] = None
    ) -> list[MeasurementFrame]:
        """
        Loads all MeasurementFrames (with their towers) belonging to an investigation case,
        optionally filtered to a subset of upload_ids (file selection).
        """
        stmt = (
            select(MeasurementFrameModel)
            .join(UploadMetadataModel, UploadMetadataModel.upload_id == MeasurementFrameModel.upload_id)
            .where(UploadMetadataModel.case_id == case_id)
            .order_by(MeasurementFrameModel.timestamp)
        )
        if upload_ids:
            stmt = stmt.where(MeasurementFrameModel.upload_id.in_(upload_ids))
        result = await self.session.execute(stmt)
        models = result.scalars().all()

        frames: list[MeasurementFrame] = []
        for m in models:
            tower_count = len(m.towers)
            # Frames with fewer than 1 observed tower are skipped
            if tower_count < 1:
                logger.info(
                    "measurement_frame_skipped_insufficient_towers",
                    case_id=case_id,
                    frame_id=str(m.frame_id),
                    tower_count=tower_count,
                )
                continue
            frames.append(MeasurementFrame(
                frame_id=m.frame_id,
                upload_id=m.upload_id,
                subscriber_identifier=m.subscriber_identifier,
                timestamp=m.timestamp,
                status=FrameStatus(m.status),
                towers=[
                    MeasurementTower(
                        tower_id=t.tower_id,
                        cgi=t.cgi,
                        latitude=t.latitude,
                        longitude=t.longitude,
                        azimuth=t.azimuth,
                        beamwidth=t.beamwidth,
                        signal_strength=t.signal_strength,
                        timing_advance=t.timing_advance,
                        rtt=t.rtt,
                        pseudorange_meters=t.pseudorange_meters,
                    )
                    for t in m.towers
                ],
            ))
        return frames

    async def get_uploads_by_case(self, case_id: str) -> list[UploadMetadataModel]:
        """
        Loads all upload metadata rows registered to an investigation case (1:N).
        """
        stmt = (
            select(UploadMetadataModel)
            .where(UploadMetadataModel.case_id == case_id)
            .order_by(UploadMetadataModel.uploaded_at)
        )
        result = await self.session.execute(stmt)
        return list(result.scalars().all())

    async def save_localization_fixes(self, fixes: list[LocalizationFix]) -> None:
        """
        Bulk inserts resolved localization fixes for a case.
        """
        if not fixes:
            return

        models = [
            LocalizationFixModel(
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
                geocoded_address=f.geocoded_address,
                fix_method=getattr(f, "fix_method", "multilateration"),
                n_towers=getattr(f, "n_towers", 3),
                created_at=f.created_at,
            )
            for f in fixes
        ]
        self.session.add_all(models)

    async def delete_localization_fixes(self, case_id: str, frame_ids: list[str]) -> None:
        """
        Removes existing fixes for a case whose frames are being re-localized,
        making re-runs idempotent instead of accumulating duplicates.
        """
        if not frame_ids:
            return
        await self.session.execute(
            delete(LocalizationFixModel).where(
                LocalizationFixModel.case_id == case_id,
                LocalizationFixModel.frame_id.in_(frame_ids),
            )
        )

    async def get_localization_fixes(
        self,
        case_id: str,
        start_time: Optional[datetime] = None,
        end_time: Optional[datetime] = None,
    ) -> list[LocalizationFixModel]:
        """
        Loads stored localization fixes for a case, optionally filtered by time range.
        """
        stmt = select(LocalizationFixModel).where(
            LocalizationFixModel.case_id == case_id
        )
        if start_time is not None:
            stmt = stmt.where(LocalizationFixModel.timestamp >= start_time)
        if end_time is not None:
            stmt = stmt.where(LocalizationFixModel.timestamp <= end_time)
        stmt = stmt.order_by(LocalizationFixModel.timestamp)
        result = await self.session.execute(stmt)
        return list(result.scalars().all())

    async def find_towers_within_radius(
        self, lat: float, lon: float, radius_meters: float
    ) -> list[TowerRecord]:
        """
        Finds towers within a radius of a point using PostGIS spatial query,
        falling back to an in-memory haversine scan when PostGIS is unavailable
        (extension missing, geometry NULL, or offline catalog).
        """
        try:
            from sqlalchemy import text

            stmt = text(
                "SELECT tower_id, operator, radio, mcc, mnc, lac, cell_id, cgi, "
                "latitude, longitude, azimuth, beamwidth, range_meters, site_address "
                "FROM tower_records "
                "WHERE ST_DWithin(geometry::geography, "
                "ST_SetSRID(ST_MakePoint(:lon, :lat), 4326)::geography, :radius)"
            )
            result = await self.session.execute(
                stmt, {"lat": lat, "lon": lon, "radius": radius_meters}
            )
            rows = result.fetchall()
            if rows:
                return [self._tower_record_from_row(row) for row in rows]
        except Exception:
            pass
        # Fallback: haversine scan over the catalog (same signature).
        return [
            t
            for t in await self.get_all_tower_records()
            if _haversine_m(lat, lon, t.latitude, t.longitude) <= radius_meters
        ]

    async def find_nearest_towers(
        self, lat: float, lon: float, k: int = 5
    ) -> list[TowerRecord]:
        """
        Returns the k nearest catalog towers to a point (PostGIS KNN ``<->``
        operator, haversine fallback). Used to find adjacent towers for a
        suspect's last known position.
        """
        try:
            from sqlalchemy import text

            stmt = text(
                "SELECT tower_id, operator, radio, mcc, mnc, lac, cell_id, cgi, "
                "latitude, longitude, azimuth, beamwidth, range_meters, site_address "
                "FROM tower_records "
                "WHERE geometry IS NOT NULL "
                "ORDER BY geometry::geography <-> "
                "ST_SetSRID(ST_MakePoint(:lon, :lat), 4326)::geography "
                "LIMIT :k"
            )
            result = await self.session.execute(stmt, {"lat": lat, "lon": lon, "k": k})
            rows = result.fetchall()
            if rows:
                return [self._tower_record_from_row(row) for row in rows]
        except Exception:
            pass
        scored = sorted(
            await self.get_all_tower_records(),
            key=lambda t: _haversine_m(lat, lon, t.latitude, t.longitude),
        )
        return scored[:k]

    async def get_all_tower_records(self) -> list[TowerRecord]:
        """Loads the full tower catalog (used by the haversine fallback)."""
        result = await self.session.execute(
            select(TowerRecordModel).order_by(TowerRecordModel.cgi)
        )
        return [self._tower_record_from_model(m) for m in result.scalars().all()]

    @staticmethod
    def _tower_record_from_model(model: TowerRecordModel) -> TowerRecord:
        return TowerRecord(
            tower_id=model.tower_id,
            operator=Operator(model.operator),
            radio=RadioTechnology(model.radio),
            mcc=model.mcc,
            mnc=model.mnc,
            lac=model.lac,
            cell_id=model.cell_id,
            cgi=model.cgi,
            latitude=model.latitude,
            longitude=model.longitude,
            azimuth=model.azimuth,
            beamwidth=model.beamwidth,
            range_meters=model.range_meters,
            site_address=model.site_address,
        )

    @staticmethod
    def _tower_record_from_row(row: Any) -> TowerRecord:
        return TowerRecord(
            tower_id=row[0],
            operator=Operator(row[1]),
            radio=RadioTechnology(row[2]),
            mcc=row[3],
            mnc=row[4],
            lac=row[5],
            cell_id=row[6],
            cgi=row[7],
            latitude=row[8],
            longitude=row[9],
            azimuth=row[10],
            beamwidth=row[11],
            range_meters=row[12],
            site_address=row[13],
        )

    async def find_fixes_within_radius(
        self, case_id: str, lat: float, lon: float, radius_meters: float
    ) -> list[LocalizationFixModel]:
        """
        Finds localization fixes within a radius of a point using PostGIS.
        """
        from sqlalchemy import text

        stmt = text(
            "SELECT fix_id, case_id, frame_id, subscriber_identifier, timestamp, "
            "latitude, longitude, confidence_radius_meters, gdop, residual_rms, "
            "ta_inner_m, ta_outer_m, rss_i_dbm, created_at "
            "FROM localization_fixes "
            "WHERE case_id = :case_id "
            "AND ST_DWithin(geometry::geography, "
            "ST_SetSRID(ST_MakePoint(:lon, :lat), 4326)::geography, :radius) "
            "ORDER BY timestamp"
        )
        result = await self.session.execute(
            stmt, {"case_id": case_id, "lat": lat, "lon": lon, "radius": radius_meters}
        )
        rows = result.fetchall()
        return [
            LocalizationFixModel(
                fix_id=row[0],
                case_id=row[1],
                frame_id=row[2],
                subscriber_identifier=row[3],
                timestamp=row[4],
                latitude=row[5],
                longitude=row[6],
                confidence_radius_meters=row[7],
                gdop=row[8],
                residual_rms=row[9],
                ta_inner_m=row[10],
                ta_outer_m=row[11],
                rss_i_dbm=row[12],
                created_at=row[13],
            )
            for row in rows
        ]

    async def get_subscriber_events_by_case(
        self, case_id: str, limit: int = 500
    ) -> list[SubscriberEventRecordModel]:
        """
        Loads normalized subscriber event records associated with a case.
        """
        stmt = (
            select(SubscriberEventRecordModel)
            .join(UploadMetadataModel, UploadMetadataModel.upload_id == SubscriberEventRecordModel.upload_id)
            .where(UploadMetadataModel.case_id == case_id)
            .order_by(SubscriberEventRecordModel.timestamp.desc())
            .limit(limit)
        )
        result = await self.session.execute(stmt)
        return list(result.scalars().all())

    async def get_all_cases(self) -> list[dict[str, Any]]:
        """
        Returns all investigation cases with upload/fix counts via single query with subqueries.
        """
        from sqlalchemy import func

        upload_counts = (
            select(
                UploadMetadataModel.case_id,
                func.count(UploadMetadataModel.upload_id).label("upload_count"),
            )
            .group_by(UploadMetadataModel.case_id)
            .subquery()
        )

        fix_counts = (
            select(
                LocalizationFixModel.case_id,
                func.count(LocalizationFixModel.fix_id).label("fix_count"),
            )
            .group_by(LocalizationFixModel.case_id)
            .subquery()
        )

        stmt = (
            select(
                CaseModel,
                func.coalesce(upload_counts.c.upload_count, 0).label("upload_count"),
                func.coalesce(fix_counts.c.fix_count, 0).label("fix_count"),
            )
            .outerjoin(upload_counts, CaseModel.case_id == upload_counts.c.case_id)
            .outerjoin(fix_counts, CaseModel.case_id == fix_counts.c.case_id)
            .order_by(CaseModel.created_at.desc())
        )

        result = await self.session.execute(stmt)
        rows = result.all()

        return [
            {
                "id": row[0].case_id,
                "case_name": row[0].case_name,
                "case_number": row[0].case_number,
                "suspect_name": row[0].suspect_name or f"Target {row[0].case_id}",
                "mobile_number": row[0].mobile_number or "Unknown",
                "description": row[0].description or "",
                "officer_notes": row[0].officer_notes or "",
                "status": row[0].status or "Active",
                "created_by": row[0].created_by or "Officer",
                "created_at": row[0].created_at.isoformat() if row[0].created_at else "",
                "updated_at": row[0].updated_at.isoformat() if row[0].updated_at else "",
                "tracking_status": "Completed" if row[2] > 0 else "Idle",
                "upload_count": row[1],
                "fix_count": row[2],
            }
            for row in rows
        ]

    async def get_dashboard_stats(
        self,
        officer: Optional["OfficerModel"] = None,  # noqa: F821
    ) -> dict[str, Any]:
        """
        Calculates summary statistics.

        Scope:
        - ADMIN (or no officer passed, e.g. internal callers): global totals.
        - INSPECTOR: only cases they created or are assigned to. Uploads and
          fixes are narrowed to those cases.

        `total_towers` is intentionally global — tower_records is a shared
        reference catalog (open operator data), not per-investigation data.
        """
        from sqlalchemy import func, or_

        from app.database.models.audit import CaseAssignmentModel
        from app.database.models.telecom import CaseModel

        # ── Resolve the set of case ids visible to this officer ──────────
        scoped_case_ids: Optional[list[str]] = None
        if officer is not None and getattr(officer, "role", None) != "ADMIN":
            created_stmt = select(CaseModel.case_id).where(
                or_(
                    CaseModel.created_by == officer.officer_name,
                    CaseModel.created_by == officer.email,
                )
            )
            created_res = await self.session.execute(created_stmt)
            ids = {row[0] for row in created_res.all()}

            assigned_stmt = select(CaseAssignmentModel.case_id).where(
                CaseAssignmentModel.officer_id == officer.officer_id
            )
            assigned_res = await self.session.execute(assigned_stmt)
            ids.update(row[0] for row in assigned_res.all())

            scoped_case_ids = list(ids)

        def scope_case(query, column):
            """Restrict a query to the officer's cases when scoped."""
            if scoped_case_ids is None:
                return query
            return query.where(column.in_(scoped_case_ids))

        # ── Totals (all real `cases` rows, not just those with uploads) ──
        cases_stmt = scope_case(select(func.count(CaseModel.case_id)), CaseModel.case_id)
        total_cases = (await self.session.execute(cases_stmt)).scalar() or 0

        active_stmt = scope_case(
            select(func.count(CaseModel.case_id)).where(CaseModel.status == "Active"),
            CaseModel.case_id,
        )
        active_cases = (await self.session.execute(active_stmt)).scalar() or 0

        completed_stmt = scope_case(
            select(func.count(CaseModel.case_id)).where(CaseModel.status == "Completed"),
            CaseModel.case_id,
        )
        completed_cases = (await self.session.execute(completed_stmt)).scalar() or 0

        uploads_stmt = scope_case(
            select(func.count(UploadMetadataModel.upload_id)),
            UploadMetadataModel.case_id,
        )
        total_uploads = (await self.session.execute(uploads_stmt)).scalar() or 0

        fixes_stmt = scope_case(
            select(func.count(LocalizationFixModel.fix_id)),
            LocalizationFixModel.case_id,
        )
        total_fixes = (await self.session.execute(fixes_stmt)).scalar() or 0

        # Shared reference catalog — always global.
        towers_stmt = select(func.count(TowerRecordModel.tower_id))
        total_towers = (await self.session.execute(towers_stmt)).scalar() or 0

        return {
            "total_cases": total_cases,
            "total_uploads": total_uploads,
            # Historically surfaced as "Total Measurements" but the counter is
            # localization fixes; return it under an accurate key and keep the
            # legacy key for backwards compatibility.
            "total_localization_fixes": total_fixes,
            "total_measurements": total_fixes,
            "total_towers": total_towers,
            "active_cases": active_cases,
            "completed_cases": completed_cases,
            "scope": "global" if scoped_case_ids is None else "officer",
        }

    # ── File Management ──────────────────────────────────────

    async def get_upload_by_id(self, upload_id: UUID) -> Optional[UploadMetadataModel]:
        """
        Retrieves a single upload by its UUID.
        """
        stmt = select(UploadMetadataModel).where(UploadMetadataModel.upload_id == upload_id)
        result = await self.session.execute(stmt)
        return result.scalar_one_or_none()

    async def update_upload_status(
        self, upload_id: UUID, status: str, error_message: Optional[str] = None
    ) -> None:
        """
        Updates the processing status of an upload.
        """
        upload = await self.get_upload_by_id(upload_id)
        if upload:
            upload.upload_status = status
            if error_message:
                upload.error_message = error_message
            await self.session.flush()

    async def update_upload_display_name(self, upload_id: UUID, display_name: str) -> None:
        """
        Updates the display name of an upload.
        """
        upload = await self.get_upload_by_id(upload_id)
        if upload:
            upload.display_name = display_name
            await self.session.flush()

    async def update_upload_supabase_info(
        self, upload_id: UUID, supabase_path: str, supabase_url: str
    ) -> None:
        """
        Updates Supabase storage info after upload.
        """
        upload = await self.get_upload_by_id(upload_id)
        if upload:
            upload.supabase_path = supabase_path
            upload.supabase_url = supabase_url
            upload.upload_status = "uploaded"
            await self.session.flush()

    async def delete_upload(self, upload_id: UUID) -> bool:
        """
        Deletes a single upload record and all dependent pipeline data
        (events, frames, towers, and their localization fixes).
        """
        upload = await self.get_upload_by_id(upload_id)
        if not upload:
            return False
        await self._delete_pipeline_data(upload_id)
        await self.session.delete(upload)
        await self.session.flush()
        return True

    async def delete_uploads_by_case(self, case_id: str) -> int:
        """
        Deletes all uploads for a case (reinitialize).
        Returns the count of deleted records.
        """
        uploads = await self.get_uploads_by_case(case_id)
        count = len(uploads)
        for upload in uploads:
            await self._delete_pipeline_data(upload.upload_id)
            await self.session.delete(upload)
        await self.session.flush()
        return count

    async def _delete_pipeline_data(self, upload_id: UUID) -> None:
        """
        Removes subscriber events, measurement frames + towers, and the
        localization fixes derived from those frames for a given upload.
        Prevents orphaned rows when files are deleted or a case is reinitialized.
        """
        frame_stmt = select(MeasurementFrameModel.frame_id).where(
            MeasurementFrameModel.upload_id == upload_id
        )
        frame_ids = list((await self.session.execute(frame_stmt)).scalars().all())

        await self.session.execute(
            delete(SubscriberEventRecordModel).where(
                SubscriberEventRecordModel.upload_id == upload_id
            )
        )
        if frame_ids:
            await self.session.execute(
                delete(MeasurementTowerModel).where(
                    MeasurementTowerModel.frame_id.in_(frame_ids)
                )
            )
            await self.session.execute(
                delete(LocalizationFixModel).where(
                    LocalizationFixModel.frame_id.in_(frame_ids)
                )
            )
        await self.session.execute(
            delete(MeasurementFrameModel).where(
                MeasurementFrameModel.upload_id == upload_id
            )
        )

    async def get_uploads_by_status(
        self, case_id: str, status: str
    ) -> list[UploadMetadataModel]:
        """
        Retrieves uploads filtered by status.
        """
        stmt = (
            select(UploadMetadataModel)
            .where(UploadMetadataModel.case_id == case_id)
            .where(UploadMetadataModel.upload_status == status)
        )
        result = await self.session.execute(stmt)
        return list(result.scalars().all())

    async def get_total_file_size_by_case(self, case_id: str) -> int:
        """
        Returns total file size in bytes for a case.
        """
        from sqlalchemy import func
        stmt = (
            select(func.coalesce(func.sum(UploadMetadataModel.file_size_bytes), 0))
            .where(UploadMetadataModel.case_id == case_id)
        )
        result = await self.session.execute(stmt)
        return result.scalar() or 0

