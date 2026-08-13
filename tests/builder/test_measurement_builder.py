"""
MeasurementFrameBuilder tests.
Covers irregular / real-world CDR cadence: gaps, bursts, non-uniform intervals,
and sparse windows that must merge to reach 3 unique towers.
"""

from datetime import datetime, timedelta
from uuid import uuid4

import pytest

from app.contracts.enums import CallType, Operator, RadioTechnology, SourceType
from app.contracts.subscriber import SubscriberEventRecord
from app.contracts.tower import TowerRecord
from app.ingestion.builder.measurement_builder import MeasurementFrameBuilder
from app.services import tower_lookup as tower_lookup_module
from app.services.tower_lookup import TowerLookupService

T0 = datetime(2026, 8, 1, 8, 0, 0)


def make_tower(cgi: str, lat: float, lon: float) -> TowerRecord:
    return TowerRecord(
        tower_id=uuid4(),
        operator=Operator.AIRTEL,
        radio=RadioTechnology.LTE,
        mcc=404,
        mnc=20,
        lac=100,
        cell_id=int(cgi.rsplit("-", 1)[1]),
        cgi=cgi,
        latitude=lat,
        longitude=lon,
        azimuth=0.0,
        beamwidth=60.0,
        range_meters=1200.0,
    )


def make_event(cgi: str, ts: datetime, ta: int = 10) -> SubscriberEventRecord:
    return SubscriberEventRecord(
        event_id=uuid4(),
        upload_id=uuid4(),
        operator=Operator.AIRTEL,
        source_type=SourceType.CDR,
        phone_number="919876543210",
        timestamp=ts,
        call_type=CallType.OUTGOING,
        duration_seconds=30,
        cgi=cgi,
        timing_advance=ta,
        rtt=40.0,
        source_file="test.csv",
        record_number=1,
        raw_fields={},
    )


@pytest.fixture
async def builder() -> MeasurementFrameBuilder:
    cgis = {
        "404-20-100-1": make_tower("404-20-100-1", 21.1702, 72.8211),
        "404-20-100-2": make_tower("404-20-100-2", 21.1902, 72.8311),
        "404-20-100-3": make_tower("404-20-100-3", 21.1752, 72.8411),
        "404-20-100-4": make_tower("404-20-100-4", 21.1852, 72.8261),
    }
    tower_lookup_module._tower_cache.update(cgis)

    service = TowerLookupService(mock_db_session())
    yield MeasurementFrameBuilder(service)

    for cgi in cgis:
        tower_lookup_module._tower_cache.pop(cgi, None)


def mock_db_session():
    from unittest.mock import AsyncMock

    from sqlalchemy.ext.asyncio import AsyncSession

    return AsyncMock(spec=AsyncSession)


@pytest.mark.asyncio
async def test_regular_5min_sequence_builds_one_frame_per_window(builder):
    events = [
        make_event("404-20-100-1", T0),
        make_event("404-20-100-2", T0 + timedelta(minutes=5)),
        make_event("404-20-100-3", T0 + timedelta(minutes=10)),
        make_event("404-20-100-4", T0 + timedelta(minutes=15)),
    ]
    frames = await builder.build_frames(events, time_window_minutes=5)
    assert len(frames) == 1, "4 sequential events should merge into one frame"


@pytest.mark.asyncio
async def test_irregular_intervals_grid(builder):
    # Same 4 towers seen within a tight burst — old fixed-from-first-record
    # window would split them; gap-based grouping keeps them together.
    events = [
        make_event("404-20-100-1", T0),
        make_event("404-20-100-2", T0 + timedelta(seconds=42)),
        make_event("404-20-100-3", T0 + timedelta(minutes=2)),
        make_event("404-20-100-4", T0 + timedelta(minutes=4, seconds=30)),
    ]
    frames = await builder.build_frames(events, time_window_minutes=5)
    assert len(frames) == 1, "burst events within gap threshold merge into one frame"


@pytest.mark.asyncio
async def test_sparse_events_merge_across_gap_to_reach_3_towers(builder):
    # First two events are far apart (>5 min) and only touch 2 towers; the
    # third (also gapped) adds tower 3. Merging must bridge the gaps.
    events = [
        make_event("404-20-100-1", T0),
        make_event("404-20-100-2", T0 + timedelta(minutes=7)),
        make_event("404-20-100-3", T0 + timedelta(minutes=13)),
    ]
    frames = await builder.build_frames(
        events, time_window_minutes=5, max_window_minutes=15
    )
    assert len(frames) == 1, "sparse events must merge to reach 3 unique towers"


@pytest.mark.asyncio
async def test_gap_beyond_cap_splits_frames(builder):
    # Two clusters ~60 min apart, each with 3 unique towers → two frames.
    events = [
        make_event("404-20-100-1", T0),
        make_event("404-20-100-2", T0 + timedelta(minutes=2)),
        make_event("404-20-100-3", T0 + timedelta(minutes=4)),
        make_event("404-20-100-1", T0 + timedelta(minutes=60)),
        make_event("404-20-100-2", T0 + timedelta(minutes=61)),
        make_event("404-20-100-4", T0 + timedelta(minutes=62)),
    ]
    frames = await builder.build_frames(
        events, time_window_minutes=5, max_window_minutes=15
    )
    assert len(frames) == 2, "clusters 60 min apart must become two frames"


@pytest.mark.asyncio
async def test_less_than_3_towers_dropped(builder):
    events = [
        make_event("404-20-100-1", T0),
        make_event("404-20-100-2", T0 + timedelta(minutes=1)),
    ]
    frames = await builder.build_frames(events, time_window_minutes=5)
    assert frames == [], "frames with <3 unique towers must be dropped"
