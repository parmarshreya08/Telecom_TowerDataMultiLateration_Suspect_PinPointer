"""
Tower Lookup service.
Queries database for cell tower location configurations.
Falls back to OpenCellID API when tower not found locally.
Includes in-memory caching to optimize pipeline processing performance.
"""

from typing import Optional
from uuid import uuid4

from sqlalchemy.ext.asyncio import AsyncSession

from app.contracts.enums import Operator, RadioTechnology
from app.contracts.tower import TowerRecord
from app.database.repository import TelecomRepository
from app.services.cgi_decoder import CgiDecoder
from app.services.opencellid import OpenCellIDService

_catalog_cache: dict[str, TowerRecord] = {}


def _normalize_cgi(cgi: str) -> str:
    """Normalize CGI for cache keys: strip whitespace/zero-pad-safe lowercase."""
    return str(cgi).strip()


def invalidate_catalog_cache(cgis: list[str]) -> None:
    """
    Drop cached catalog entries so a tower-dump re-upload never leaves stale
    tower_ids behind (stale IDs break measurement_towers FK inserts).
    """
    for cgi in cgis:
        _catalog_cache.pop(_normalize_cgi(cgi), None)
        _catalog_cache.pop(cgi, None)


class TowerLookupService:
    """
    Locates spatial metadata coordinates for cell towers based on Cell Global Identity.

    The authoritative whitelist is the ``tower_records`` DB catalog. OpenCellID is
    only a last-resort resolver and its results are explicitly marked ``is_catalog=False``
    so rogue-BTS detection can exclude them from solves and flag them.
    """

    def __init__(self, db_session: AsyncSession) -> None:
        self.repo = TelecomRepository(db_session)
        self._opencellid = OpenCellIDService()

    async def find_by_cgi(self, cgi: str) -> Optional[TowerRecord]:
        """
        Looks up a cell site record by its CGI code.

        DB ``tower_records`` catalog is checked first and cached separately (never
        evicted by OpenCellID results). OpenCellID is consulted only when the CGI
        is absent from the catalog, and its result carries ``is_catalog=False``.

        Args:
            cgi: MCC-MNC-LAC-CI formatted identifier.

        Returns:
            The matched TowerRecord, or None if not found anywhere.
        """
        if not cgi:
            return None

        key = _normalize_cgi(cgi)
        if key in _catalog_cache:
            return _catalog_cache[key]

        tower = await self.repo.get_tower_by_cgi(cgi)
        if tower is None and key != cgi:
            tower = await self.repo.get_tower_by_cgi(key)
        if tower:
            _catalog_cache[key] = tower
            return tower

        # OpenCellID fallback (NOT part of the authoritative whitelist)
        decoded = CgiDecoder.decode(cgi)
        if all(decoded[k] is not None for k in ("mcc", "mnc", "lac", "cell_id")):
            oc_result = await self._opencellid.lookup(
                mcc=decoded["mcc"],
                mnc=decoded["mnc"],
                lac=decoded["lac"],
                cell_id=decoded["cell_id"],
            )
            if oc_result is not None:
                tower = TowerRecord(
                    tower_id=uuid4(),
                    operator=Operator.UNKNOWN,
                    radio=RadioTechnology.LTE,
                    mcc=decoded["mcc"],
                    mnc=decoded["mnc"],
                    lac=decoded["lac"],
                    cell_id=decoded["cell_id"],
                    cgi=cgi,
                    latitude=oc_result["latitude"],
                    longitude=oc_result["longitude"],
                    range_meters=oc_result.get("range_meters"),
                    is_catalog=False,
                )
                return tower

        return None

    async def is_catalog(self, cgi: str) -> bool:
        """
        Whitelist membership test: is this CGI present in the authoritative
        ``tower_records`` DB catalog? OpenCellID fallbacks do not count.
        """
        key = _normalize_cgi(cgi)
        if key in _catalog_cache:
            return True
        tower = await self.repo.get_tower_by_cgi(cgi)
        if tower is None and key != cgi:
            tower = await self.repo.get_tower_by_cgi(key)
        if tower:
            _catalog_cache[key] = tower
            return True
        return False

    async def find_many_by_cgi(self, cgis: list[str]) -> dict[str, Optional[TowerRecord]]:
        """Batch variant to avoid N+1 SELECTs during frame building."""
        uniq = [_normalize_cgi(c) for c in dict.fromkeys([c for c in cgis if c])]
        out: dict[str, Optional[TowerRecord]] = {}
        missing: list[str] = []
        for original, key in zip([c for c in dict.fromkeys([c for c in cgis if c])], uniq):
            if key in _catalog_cache:
                out[original] = _catalog_cache[key]
            else:
                missing.append(original)
        if missing:
            batch = await self.repo.get_towers_by_cgis(missing)
            for original in missing:
                tower = batch.get(original) or batch.get(_normalize_cgi(original))
                if tower:
                    _catalog_cache[_normalize_cgi(original)] = tower
                out[original] = tower
        return out

    async def find_within_radius(
        self, lat: float, lon: float, radius_meters: float
    ) -> list[TowerRecord]:
        """
        All catalog towers within ``radius_meters`` of a point. PostGIS
        ``ST_DWithin`` with an in-memory haversine fallback.
        """
        return await self.repo.find_towers_within_radius(lat, lon, radius_meters)

    async def find_nearest(
        self, lat: float, lon: float, k: int = 5
    ) -> list[TowerRecord]:
        """
        The ``k`` nearest catalog towers to a point (PostGIS KNN ``<->``,
        haversine fallback).
        """
        return await self.repo.find_nearest_towers(lat, lon, k)
