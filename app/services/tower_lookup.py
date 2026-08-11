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

_tower_cache: dict[str, TowerRecord] = {}


class TowerLookupService:
    """
    Locates spatial metadata coordinates for cell towers based on Cell Global Identity.
    """

    def __init__(self, db_session: AsyncSession) -> None:
        self.repo = TelecomRepository(db_session)
        self._opencellid = OpenCellIDService()

    async def find_by_cgi(self, cgi: str) -> Optional[TowerRecord]:
        """
        Looks up a cell site record by its CGI code.
        Falls back to OpenCellID API when not found in DB.

        Args:
            cgi: MCC-MNC-LAC-CI formatted identifier.

        Returns:
            The matched TowerRecord, or None if not found anywhere.
        """
        if not cgi:
            return None

        if cgi in _tower_cache:
            return _tower_cache[cgi]

        tower = await self.repo.get_tower_by_cgi(cgi)
        if tower:
            _tower_cache[cgi] = tower
            return tower

        # OpenCellID fallback
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
                )
                _tower_cache[cgi] = tower
                return tower

        return None
