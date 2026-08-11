"""
CGI decoder utility service.
Decomposes standard Cell Global Identity (CGI) values into MCC, MNC, LAC, and Cell ID.
"""

from typing import Optional
import re
from app.core.logging import logger


class CgiDecoder:
    """
    Decodes standard CGI formatting strings (MCC-MNC-LAC-CI).
    """

    @staticmethod
    def decode(cgi: str) -> dict[str, Optional[int]]:
        """
        Parses CGI identifier string and extracts constituents.

        Accepts standard hyphenated or dotted strings:
        e.g. "404-45-1234-5678" or "404.45.1234.5678"

        Args:
            cgi: String identifier code.

        Returns:
            Dict containing mcc, mnc, lac, and cell_id.
        """
        result: dict[str, Optional[int]] = {
            "mcc": None,
            "mnc": None,
            "lac": None,
            "cell_id": None
        }

        if not cgi:
            return result

        # Match numbers separated by dashes, dots, or spaces
        parts = re.split(r"[-.\s]+", cgi.strip())
        
        # Verify if we have standard 4 sections (MCC-MNC-LAC-CellID)
        if len(parts) >= 4:
            try:
                result["mcc"] = int(parts[0]) if parts[0].isdigit() else None
                result["mnc"] = int(parts[1]) if parts[1].isdigit() else None
                result["lac"] = int(parts[2]) if parts[2].isdigit() else None
                result["cell_id"] = int(parts[3]) if parts[3].isdigit() else None
            except Exception as e:
                logger.warning("cgi_decode_failed", cgi=cgi, error=str(e))
        else:
            logger.debug("cgi_decode_insufficient_parts", cgi=cgi, parts=parts)

        return result
