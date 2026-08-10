"""
Seed script for E-Rakshak database.
Populates the database with realistic multi-operator dummy data for Surat city.

Usage: python -m scripts.seed_db
"""

import asyncio
import sys
import os
from datetime import datetime, timedelta
from uuid import uuid4, UUID

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from sqlalchemy.ext.asyncio import create_async_engine, async_sessionmaker, AsyncSession
from sqlalchemy import text
from sqlalchemy.dialects.postgresql import insert as pg_insert
from app.core.config import settings
from app.database.models.telecom import (
    CaseModel, UploadMetadataModel, SubscriberEventRecordModel,
    TowerRecordModel, MeasurementFrameModel, MeasurementTowerModel,
    LocalizationFixModel,
)
from app.contracts.enums import CallType, FrameStatus, Operator, RadioTechnology, SourceType


# Surat city towers (multi-operator)
TOWERS = [
    # Airtel towers
    {"cgi": "404-20-100-1", "operator": "Airtel", "radio": "LTE", "mcc": 404, "mnc": 20, "lac": 100, "cell_id": 1, "lat": 21.1702, "lon": 72.8211, "az": 0, "bw": 60, "addr": "Adajan Surat"},
    {"cgi": "404-20-100-2", "operator": "Airtel", "radio": "LTE", "mcc": 404, "mnc": 20, "lac": 100, "cell_id": 2, "lat": 21.1902, "lon": 72.8311, "az": 120, "bw": 60, "addr": "Vesu Surat"},
    {"cgi": "404-20-100-3", "operator": "Airtel", "radio": "LTE", "mcc": 404, "mnc": 20, "lac": 100, "cell_id": 3, "lat": 21.1752, "lon": 72.8411, "az": 240, "bw": 60, "addr": "Ring Road Surat"},
    {"cgi": "404-20-100-4", "operator": "Airtel", "radio": "LTE", "mcc": 404, "mnc": 20, "lac": 100, "cell_id": 4, "lat": 21.1852, "lon": 72.8261, "az": 0, "bw": 60, "addr": "Athwa Surat"},
    # Vi towers
    {"cgi": "404-20-300-1", "operator": "Vi", "radio": "LTE", "mcc": 404, "mnc": 20, "lac": 300, "cell_id": 1, "lat": 21.1722, "lon": 72.8181, "az": 30, "bw": 60, "addr": "City Light Surat"},
    {"cgi": "404-20-300-2", "operator": "Vi", "radio": "LTE", "mcc": 404, "mnc": 20, "lac": 300, "cell_id": 2, "lat": 21.1882, "lon": 72.8351, "az": 150, "bw": 60, "addr": "Nanpura Surat"},
    {"cgi": "404-20-300-3", "operator": "Vi", "radio": "LTE", "mcc": 404, "mnc": 20, "lac": 300, "cell_id": 3, "lat": 21.1772, "lon": 72.8441, "az": 270, "bw": 60, "addr": "Katargam Surat"},
    {"cgi": "404-20-300-4", "operator": "Vi", "radio": "LTE", "mcc": 404, "mnc": 20, "lac": 300, "cell_id": 4, "lat": 21.1832, "lon": 72.8231, "az": 330, "bw": 60, "addr": "Piplod Surat"},
    # BSNL towers
    {"cgi": "404-81-400-1", "operator": "BSNL", "radio": "LTE", "mcc": 404, "mnc": 81, "lac": 400, "cell_id": 1, "lat": 21.1692, "lon": 72.8251, "az": 15, "bw": 60, "addr": "Surat Railway Station"},
    {"cgi": "404-81-400-2", "operator": "BSNL", "radio": "LTE", "mcc": 404, "mnc": 81, "lac": 400, "cell_id": 2, "lat": 21.1912, "lon": 72.8321, "az": 135, "bw": 60, "addr": "Dumas Road Surat"},
    {"cgi": "404-81-400-3", "operator": "BSNL", "radio": "LTE", "mcc": 404, "mnc": 81, "lac": 400, "cell_id": 3, "lat": 21.1762, "lon": 72.8391, "az": 255, "bw": 60, "addr": "Varachha Surat"},
    {"cgi": "404-81-400-4", "operator": "BSNL", "radio": "LTE", "mcc": 404, "mnc": 81, "lac": 400, "cell_id": 4, "lat": 21.1862, "lon": 72.8271, "az": 15, "bw": 60, "addr": "Pal Surat"},
    # Jio towers
    {"cgi": "405-867-200-1", "operator": "Jio", "radio": "LTE", "mcc": 405, "mnc": 867, "lac": 200, "cell_id": 1, "lat": 21.1712, "lon": 72.8221, "az": 45, "bw": 60, "addr": "Althan Surat"},
    {"cgi": "405-867-200-2", "operator": "Jio", "radio": "LTE", "mcc": 405, "mnc": 867, "lac": 200, "cell_id": 2, "lat": 21.1892, "lon": 72.8341, "az": 165, "bw": 60, "addr": "Bhatar Road Surat"},
    {"cgi": "405-867-200-3", "operator": "Jio", "radio": "LTE", "mcc": 405, "mnc": 867, "lac": 200, "cell_id": 3, "lat": 21.1742, "lon": 72.8431, "az": 285, "bw": 60, "addr": "Ghod Dod Road Surat"},
    {"cgi": "405-867-200-4", "operator": "Jio", "radio": "LTE", "mcc": 405, "mnc": 867, "lac": 200, "cell_id": 4, "lat": 21.1842, "lon": 72.8241, "az": 15, "bw": 60, "addr": "Sarthana Surat"},
]

# Suspect path: moving through Surat from Adajan to Athwa via Vesu
SUSPECT_POSITIONS = [
    (21.1702, 72.8211, "08:00"),  # Adajan
    (21.1752, 72.8261, "08:05"),  # Moving east
    (21.1802, 72.8311, "08:10"),  # Near Vesu
    (21.1852, 72.8361, "08:15"),  # Vesu
    (21.1852, 72.8311, "08:20"),  # Moving south
    (21.1802, 72.8261, "08:25"),  # Near Athwa
    (21.1752, 72.8211, "08:30"),  # Back toward Adajan
    (21.1702, 72.8261, "08:35"),  # Adajan area
    (21.1752, 72.8311, "08:40"),  # Moving east again
    (21.1802, 72.8361, "08:45"),  # Near Ring Road
    (21.1852, 72.8411, "08:50"),  # Ring Road
    (21.1902, 72.8361, "08:55"),  # Moving north
    (21.1902, 72.8311, "09:00"),  # Vesu area
    (21.1852, 72.8261, "09:05"),  # Moving south
    (21.1802, 72.8211, "09:10"),  # Near Athwa
    (21.1752, 72.8161, "09:15"),  # West side
    (21.1702, 72.8211, "09:20"),  # Back to Adajan
    (21.1752, 72.8261, "09:25"),  # Moving east
    (21.1802, 72.8311, "09:30"),  # Near Vesu
    (21.1852, 72.8361, "09:35"),  # Vesu area
]

OPERATOR_CGIS = {
    "Airtel": ["404-20-100-1", "404-20-100-2", "404-20-100-3", "404-20-100-4"],
    "Jio": ["405-867-200-1", "405-867-200-2", "405-867-200-3", "405-867-200-4"],
    "Vi": ["404-20-300-1", "404-20-300-2", "404-20-300-3", "404-20-300-4"],
    "BSNL": ["404-81-400-1", "404-81-400-2", "404-81-400-3", "404-81-400-4"],
}

TOWER_MAP = {t["cgi"]: t for t in TOWERS}


def _find_nearest_tower(lat: float, lon: float) -> str:
    import math
    best_cgi, best_dist = None, float("inf")
    for t in TOWERS:
        d = math.sqrt((t["lat"] - lat) ** 2 + (t["lon"] - lon) ** 2)
        if d < best_dist:
            best_dist = d
            best_cgi = t["cgi"]
    return best_cgi


def _make_cdr_records(case_id: str, upload_id: UUID, operator: str, base_time: datetime):
    """Generate 20 CDR records for an operator."""
    records = []
    cgis = OPERATOR_CGIS[operator]
    for i, (lat, lon, ts_str) in enumerate(SUSPECT_POSITIONS):
        h, m = map(int, ts_str.split(":"))
        ts = base_time.replace(hour=h, minute=m, second=0, microsecond=0)
        nearest = _find_nearest_tower(lat, lon)
        t = TOWER_MAP[nearest]
        ta = max(5, 20 - i % 15)
        rtt = float(ta * 3.2)
        sig = -70 - (i % 15)
        call_type = "MOC" if i % 3 != 0 else ("MTC" if i % 3 == 1 else "SMS")
        duration = 30 + (i * 17) % 200
        records.append({
            "event_id": uuid4(),
            "upload_id": upload_id,
            "operator": operator,
            "source_type": "CDR",
            "phone_number": f"919876543210" if operator == "Airtel" else f"919765432109" if operator == "Jio" else f"919654321098" if operator == "Vi" else f"919543210987",
            "imei": f"358765432109876" if operator in ("Airtel", "Jio") else f"860123456789012" if operator == "Vi" else f"860987654321098",
            "imsi": f"404200123456789" if operator == "Airtel" else f"405867012345678" if operator == "Jio" else f"404209876543210" if operator == "Vi" else f"404810987654321",
            "timestamp": ts,
            "call_type": call_type,
            "duration_seconds": duration,
            "cgi": nearest,
            "mcc": t["mcc"],
            "mnc": t["mnc"],
            "lac": t["lac"],
            "cell_id": t["cell_id"],
            "tower_latitude": t["lat"],
            "tower_longitude": t["lon"],
            "signal_strength": float(sig),
            "timing_advance": ta,
            "rtt": rtt,
            "source_file": f"{operator.lower()}_cdr_surat.csv",
            "record_number": i + 1,
            "raw_fields": {},
        })
    return records


async def seed():
    engine = create_async_engine(settings.DATABASE_URL)
    session_factory = async_sessionmaker(engine, class_=AsyncSession, expire_on_commit=False)

    async with session_factory() as db:
        # Clear existing data if --clear flag
        if "--clear" in sys.argv:
            await db.execute(text("DELETE FROM measurement_towers"))
            await db.execute(text("DELETE FROM measurement_frames"))
            await db.execute(text("DELETE FROM localization_fixes"))
            await db.execute(text("DELETE FROM subscriber_event_records"))
            await db.execute(text("DELETE FROM upload_metadata"))
            await db.execute(text("DELETE FROM cases"))
            await db.execute(text("DELETE FROM tower_records"))
            await db.commit()
            print("[*] Cleared existing data")

        case_id = "CASE-SURAT-2026-001"
        base_time = datetime(2026, 8, 1, 8, 0, 0)

        # 1. Create case
        case = CaseModel(
            case_id=case_id,
            case_name="Surat Multi-Operator Investigation",
            case_number="SURAT-2026-001",
            suspect_name="Suspect Alpha",
            mobile_number="919876543210",
            description="Multi-operator CDR analysis for suspect localization in Surat city",
            officer_notes="Investigation into mobile movement patterns across Surat city using Airtel, Jio, Vi, and BSNL CDR data.",
            status="Active",
            created_by="Officer Patel",
        )
        db.add(case)
        await db.flush()
        print(f"[+] Created case: {case_id}")

        # 2. Create tower records (upsert)
        tower_ids = {}
        for t in TOWERS:
            tid = uuid4()
            tower_ids[t["cgi"]] = tid
            insert_stmt = pg_insert(TowerRecordModel).values(
                tower_id=tid,
                operator=t["operator"],
                radio=t["radio"],
                mcc=t["mcc"],
                mnc=t["mnc"],
                lac=t["lac"],
                cell_id=t["cell_id"],
                cgi=t["cgi"],
                latitude=t["lat"],
                longitude=t["lon"],
                azimuth=t["az"],
                beamwidth=t["bw"],
                range_meters=1200.0,
                site_address=t["addr"],
            )
            upsert = insert_stmt.on_conflict_do_update(
                index_elements=["cgi"],
                set_={
                    "latitude": t["lat"],
                    "longitude": t["lon"],
                    "azimuth": t["az"],
                    "beamwidth": t["bw"],
                    "range_meters": 1200.0,
                    "site_address": t["addr"],
                },
            )
            await db.execute(upsert)
        await db.flush()
        print(f"[+] Created {len(TOWERS)} tower records")

        # 3. Create uploads and CDR events for each operator
        all_events = []
        for op in ["Airtel", "Jio", "Vi", "BSNL"]:
            upload_id = uuid4()
            meta = UploadMetadataModel(
                upload_id=upload_id,
                case_id=case_id,
                source_type="CDR",
                operator=op,
                original_filename=f"{op.lower()}_cdr_surat.csv",
                stored_filename=f"{op.lower()}_cdr_surat.csv",
                sha256=f"{'a' * 64}"[:47] + f"{op[:5].lower().center(5, '0')}" + "e" * 12,
                mime_type="text/csv",
                file_size_bytes=4096,
                uploaded_by="Officer Patel",
                uploaded_at=base_time,
                supabase_path=f"{case_id}/{upload_id}-{op.lower()}_cdr_surat.csv",
                supabase_url="",
                display_name=f"{op} CDR - Surat",
                upload_status="completed",
                file_source="local",
            )
            db.add(meta)
            await db.flush()

            events = _make_cdr_records(case_id, upload_id, op, base_time)
            for e in events:
                model = SubscriberEventRecordModel(**e)
                db.add(model)
            all_events.extend(events)
            await db.flush()
            print(f"[+] Created {len(events)} CDR records for {op}")

        await db.flush()

        # 4. Create measurement frames directly (5 records per frame, 3+ unique CGIs)
        frame_count = 0
        all_sub_events = {}
        for e in all_events:
            sub = e["phone_number"]
            all_sub_events.setdefault(sub, []).append(e)

        for sub_id, sub_events in all_sub_events.items():
            sub_events.sort(key=lambda x: x["timestamp"])
            for i in range(0, len(sub_events), 5):
                window = sub_events[i:i+5]
                if len(window) < 3:
                    continue
                # Check unique CGIs
                unique_cgis = set(r["cgi"] for r in window)
                if len(unique_cgis) < 3:
                    continue

                frame_id = uuid4()
                midpoint = window[0]["timestamp"] + (
                    (window[-1]["timestamp"] - window[0]["timestamp"]) / 2
                )
                frame = MeasurementFrameModel(
                    frame_id=frame_id,
                    upload_id=window[0]["upload_id"],
                    subscriber_identifier=sub_id,
                    timestamp=midpoint,
                    status="Ready",
                )
                db.add(frame)

                seen = set()
                for rec in window:
                    if rec["cgi"] in seen:
                        continue
                    seen.add(rec["cgi"])
                    t = TOWER_MAP.get(rec["cgi"])
                    if not t:
                        continue
                    ta = rec.get("timing_advance")
                    pseudorange = float(ta * 78.12) if ta else None
                    tower = MeasurementTowerModel(
                        frame_id=frame_id,
                        tower_id=tower_ids.get(rec["cgi"]),
                        cgi=rec["cgi"],
                        latitude=t["lat"],
                        longitude=t["lon"],
                        azimuth=t["az"],
                        beamwidth=t["bw"],
                        signal_strength=rec.get("signal_strength"),
                        timing_advance=ta,
                        rtt=rec.get("rtt"),
                        pseudorange_meters=pseudorange,
                    )
                    db.add(tower)
                frame_count += 1

        await db.flush()
        print(f"[+] Created {frame_count} measurement frames")

        # 5. Create localization fixes
        fix_count = 0
        for i, (lat, lon, ts_str) in enumerate(SUSPECT_POSITIONS):
            if i % 3 != 0:  # Not every position produces a fix
                continue
            h, m = map(int, ts_str.split(":"))
            ts = base_time.replace(hour=h, minute=m, second=0, microsecond=0)
            nearest = _find_nearest_tower(lat, lon)
            t = TOWER_MAP[nearest]
            ta = max(5, 20 - i % 15)

            fix = LocalizationFixModel(
                fix_id=uuid4(),
                case_id=case_id,
                frame_id=None,
                subscriber_identifier="919876543210",
                timestamp=ts,
                latitude=lat + 0.001 * ((-1) ** i),  # slight noise
                longitude=lon + 0.001 * ((-1) ** (i + 1)),
                velocity_east=0.5 + (i % 5) * 0.3,
                velocity_north=-0.2 + (i % 3) * 0.4,
                confidence_radius_meters=45.0 + (i % 5) * 10.0,
                gdop=1.5 + (i % 4) * 0.3,
                residual_rms=8.0 + (i % 6) * 2.0,
                ta_inner_m=max(0.0, (ta - 0.5) * 78.12),
                ta_outer_m=(ta + 0.5) * 78.12,
                rss_i_dbm=float(-70 - (i % 15)),
                created_at=datetime.utcnow(),
            )
            db.add(fix)
            fix_count += 1

        await db.flush()
        print(f"[+] Created {fix_count} localization fixes")

        await db.commit()
        print(f"\n[OK] Database seeded successfully!")
        print(f"     Case: {case_id}")
        print(f"     Towers: {len(TOWERS)}")
        print(f"     CDR events: {len(all_events)} (4 operators x 20 records)")
        print(f"     Measurement frames: {frame_count}")
        print(f"     Localization fixes: {fix_count}")

    await engine.dispose()


if __name__ == "__main__":
    asyncio.run(seed())
