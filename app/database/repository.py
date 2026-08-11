"""
Database repository layer for E-Rakshak.
Handles CRUD and bulk persist operations for telecom models.
Converts between Pydantic contracts and SQLAlchemy database models.
"""

from datetime import datetime
from typing import Any, Optional
from uuid import UUID

from sqlalchemy import select
from sqlalchemy.dialects.postgresql import insert
from sqlalchemy.ext.asyncio import AsyncSession

from app.contracts.enums import CallType, FrameStatus, Operator, RadioTechnology, SourceType
from app.contracts.localization import LocalizationFix
from app.contracts.measurement import MeasurementFrame, MeasurementTower
from app.contracts.subscriber import SubscriberEventRecord
from app.contracts.tower import TowerRecord
from app.contracts.upload import UploadMetadata
from app.database.models.telecom import (
    CaseModel,
    LocalizationFixModel,
    MeasurementFrameModel,
    MeasurementTowerModel,
    SubscriberEventRecordModel,
    TowerRecordModel,
    UploadMetadataModel,
)


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
        Deletes a case and all its uploads (cascade).
        """
        case = await self.get_case_by_id(case_id)
        if not case:
            return False
        await self.session.delete(case)
        await self.session.flush()
        return True

    # ── Upload Metadata ──────────────────────────────────────

    async def get_upload_by_hash(self, file_hash: str) -> Optional[UploadMetadataModel]:
        """
        Retrieves upload metadata by file checksum hash (SHA-256).
        """
        stmt = select(UploadMetadataModel).where(UploadMetadataModel.sha256 == file_hash)
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

    async def get_frames_by_case(self, case_id: str) -> list[MeasurementFrame]:
        """
        Loads all MeasurementFrames (with their towers) belonging to an investigation case.
        """
        stmt = (
            select(MeasurementFrameModel)
            .join(UploadMetadataModel, UploadMetadataModel.upload_id == MeasurementFrameModel.upload_id)
            .where(UploadMetadataModel.case_id == case_id)
            .order_by(MeasurementFrameModel.timestamp)
        )
        result = await self.session.execute(stmt)
        models = result.scalars().all()

        frames: list[MeasurementFrame] = []
        for m in models:
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
                created_at=f.created_at,
            )
            for f in fixes
        ]
        self.session.add_all(models)

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
        Finds towers within a radius of a point using PostGIS spatial query.
        """
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
        return [
            TowerRecord(
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
            for row in rows
        ]

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

    async def get_dashboard_stats(self) -> dict[str, Any]:
        """
        Calculates real summary statistics across all cases, uploads, fixes, towers.
        """
        from sqlalchemy import func

        cases_count_stmt = select(func.count(func.distinct(UploadMetadataModel.case_id)))
        cases_res = await self.session.execute(cases_count_stmt)
        total_cases = cases_res.scalar() or 0

        uploads_count_stmt = select(func.count(UploadMetadataModel.upload_id))
        uploads_res = await self.session.execute(uploads_count_stmt)
        total_uploads = uploads_res.scalar() or 0

        fixes_count_stmt = select(func.count(LocalizationFixModel.fix_id))
        fixes_res = await self.session.execute(fixes_count_stmt)
        total_fixes = fixes_res.scalar() or 0

        towers_count_stmt = select(func.count(TowerRecordModel.tower_id))
        towers_res = await self.session.execute(towers_count_stmt)
        total_towers = towers_res.scalar() or 0

        active_cases_stmt = select(func.count(CaseModel.case_id)).where(CaseModel.status == "Active")
        active_res = await self.session.execute(active_cases_stmt)
        active_cases = active_res.scalar() or 0

        completed_cases_stmt = select(func.count(CaseModel.case_id)).where(CaseModel.status == "Completed")
        completed_res = await self.session.execute(completed_cases_stmt)
        completed_cases = completed_res.scalar() or 0

        return {
            "total_cases": total_cases,
            "total_uploads": total_uploads,
            "total_measurements": total_fixes,
            "total_towers": total_towers,
            "active_cases": active_cases,
            "completed_cases": completed_cases,
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
        Deletes a single upload record.
        """
        upload = await self.get_upload_by_id(upload_id)
        if not upload:
            return False
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
            await self.session.delete(upload)
        await self.session.flush()
        return count

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

