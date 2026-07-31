"""
Tower Lookup service.
Queries database for cell tower location configurations.
Includes in-memory caching to optimize pipeline processing performance.
"""

from typing import Optional

from sqlalchemy.ext.asyncio import AsyncSession

from app.contracts.tower import TowerRecord
from app.database.repository import TelecomRepository


class TowerLookupService:
    """
    Locates spatial metadata coordinates for cell towers based on Cell Global Identity.
    """

    def __init__(self, db_session: AsyncSession) -> None:
        self.repo = TelecomRepository(db_session)
        # Cache resolved towers in-memory to prevent redundant db queries during frame building loops
        self._cache: dict[str, TowerRecord] = {}

    async def find_by_cgi(self, cgi: str) -> Optional[TowerRecord]:
        """
        Looks up a cell site record by its CGI code.

        Args:
            cgi: MCC-MNC-LAC-CI formatted identifier.

        Returns:
            The matched TowerRecord, or None if not registered.
        """
        if not cgi:
            return None

        # Check local frame cache
        if cgi in self._cache:
            return self._cache[cgi]

        # Query DB repository
        tower = await self.repo.get_tower_by_cgi(cgi)
        if tower:
            self._cache[cgi] = tower
            return tower

        return None
