"""
Database repository layer for E-Rakshak.
Handles CRUD and bulk persist operations for telecom models.
Converts between Pydantic contracts and SQLAlchemy database models.
"""

from typing import Optional
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
            uploaded_at=meta.uploaded_at
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

    async def get_localization_fixes(self, case_id: str) -> list[LocalizationFixModel]:
        """
        Loads stored localization fixes for a case (cached engine output).
        """
        stmt = (
            select(LocalizationFixModel)
            .where(LocalizationFixModel.case_id == case_id)
            .order_by(LocalizationFixModel.timestamp)
        )
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
