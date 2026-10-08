"""Benchmark PostGIS spatial queries vs the pure-Python haversine fallback.

Usage:
    python -m scripts.benchmark_postgis

Measures, on the live catalog:
  1. ST_DWithin radius query (indexed geography)
  2. KNN nearest-tower query (<-> operator)
  3. Python haversine full-catalog scan (the fallback path)

Also runs the same comparison against a synthetic 1M-row table to support
the national-scale claim. The synthetic table is temporary and dropped
afterwards.
"""

import asyncio
import statistics
import time

from sqlalchemy import text

from app.database.repository import _haversine_m
from app.database.repository import TelecomRepository
from app.database.session import AsyncSessionLocal, engine

LAT, LON = 21.1676, 72.7886
ROUNDS = 5


async def timed(coro_factory, rounds=ROUNDS):
    samples = []
    out = None
    for _ in range(rounds):
        t0 = time.perf_counter()
        out = await coro_factory()
        samples.append((time.perf_counter() - t0) * 1000)
    return statistics.median(samples), out


async def main() -> None:
    async with AsyncSessionLocal() as db:
        repo = TelecomRepository(db)

        med, towers = await timed(lambda: repo.find_towers_within_radius(LAT, LON, 3000))
        print(f"PostGIS ST_DWithin 3km : {med:8.1f} ms  ({len(towers)} towers)")

        med, near = await timed(lambda: repo.find_nearest_towers(LAT, LON, 5))
        print(f"PostGIS KNN nearest 5  : {med:8.1f} ms  ({[t.cgi for t in near]})")

        async def fallback_scan():
            return sorted(
                await repo.get_all_tower_records(),
                key=lambda t: _haversine_m(LAT, LON, t.latitude, t.longitude),
            )

        med, all_t = await timed(fallback_scan)
        print(f"Python haversine scan  : {med:8.1f} ms  ({len(all_t)} towers)")

        # Synthetic 1M-row scale check (temporary table, dropped after).
        print("building synthetic 1M-row table ...")
        await db.execute(text("DROP TABLE IF EXISTS _bench_towers"))
        await db.execute(
            text(
                "CREATE TEMP TABLE _bench_towers AS "
                "SELECT ST_SetSRID(ST_MakePoint(72.7 + random() * 0.3, "
                "21.1 + random() * 0.3), 4326)::geography AS geog "
                "FROM generate_series(1, 1000000)"
            )
        )
        await db.execute(
            text("CREATE INDEX ON _bench_towers USING GIST (geog)")
        )

        async def synth_query():
            r = await db.execute(
                text(
                    "SELECT count(*) FROM _bench_towers WHERE "
                    "ST_DWithin(geog, ST_SetSRID(ST_MakePoint(:lon, :lat), "
                    "4326)::geography, 3000)"
                ),
                {"lat": LAT, "lon": LON},
            )
            return r.scalar()

        med, n = await timed(synth_query)
        print(f"PostGIS 1M-row 3km     : {med:8.1f} ms  ({n} hits)")
        await db.execute(text("DROP TABLE _bench_towers"))

    await engine.dispose()


if __name__ == "__main__":
    asyncio.run(main())
