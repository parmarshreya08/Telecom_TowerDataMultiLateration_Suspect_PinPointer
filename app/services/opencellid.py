"""
OpenCellID fallback service.
Queries the OpenCellID API to resolve tower coordinates when not in the local DB.
Requires OPENCELLID_API_KEY in environment/config.
"""

from typing import Optional

import httpx

from app.core.config import settings
from app.core.logging import logger

_OPENCELLID_BASE = "https://opencellid.org/cell/get"


class OpenCellIDService:
    """
    Queries OpenCellID API for tower geolocation when not found locally.
    """

    def __init__(self) -> None:
        self.api_key = settings.OPENCELLID_API_KEY
        self.enabled = bool(self.api_key)

    async def lookup(
        self,
        mcc: int,
        mnc: int,
        lac: int,
        cell_id: int,
    ) -> Optional[dict]:
        """
        Queries OpenCellID for tower lat/lon by CGI components.
        Returns dict with lat, lon, range, samples, or None on failure.
        """
        if not self.enabled:
            return None

        params = {
            "mcc": mcc,
            "mnc": mnc,
            "lac": lac,
            "cid": cell_id,
            "format": "json",
            "key": self.api_key,
        }

        try:
            async with httpx.AsyncClient(timeout=5.0) as client:
                resp = await client.get(_OPENCELLID_BASE, params=params)
                if resp.status_code == 200:
                    data = resp.json()
                    if data and data.get("lat") and data.get("lon"):
                        logger.info(
                            "opencellid_lookup_success",
                            mcc=mcc, mnc=mnc, lac=lac, cid=cell_id,
                            lat=data["lat"], lon=data["lon"],
                        )
                        return {
                            "latitude": float(data["lat"]),
                            "longitude": float(data["lon"]),
                            "range_meters": float(data.get("range", 0)),
                            "samples": int(data.get("samples", 0)),
                        }
                logger.warn(
                    "opencellid_lookup_miss",
                    mcc=mcc, mnc=mnc, lac=lac, cid=cell_id,
                    status=resp.status_code,
                )
        except Exception as e:
            logger.warn("opencellid_lookup_error", error=str(e))

        return None
