"""
Operator mapping database.
Translates Mobile Network Codes (MNC) and Mobile Country Codes (MCC) to operator names.
"""

from typing import Optional


class OperatorMappingService:
    """
    Utility service mapping telecom network codes to brand name operators.
    """

    # Primary MCC for India is 404 and 405
    # Standard Indian MNC mappings mapping codes to operator and circle
    MNC_MAP: dict[tuple[int, int], str] = {
        # Airtel (MCC 404)
        (404, 10): "Airtel",
        (404, 28): "Airtel",
        (404, 40): "Airtel",
        (404, 45): "Airtel",
        (404, 49): "Airtel",
        (404, 70): "Airtel",
        (404, 94): "Airtel",
        
        # Vi - Vodafone Idea (MCC 404)
        (404, 4): "Vi",
        (404, 20): "Vi",
        (404, 46): "Vi",
        (404, 60): "Vi",
        (404, 84): "Vi",

        # Jio (MCC 405)
        (405, 854): "Jio",
        (405, 855): "Jio",
        (405, 856): "Jio",
        (405, 857): "Jio",
        (405, 861): "Jio",
        (405, 872): "Jio",

        # BSNL (MCC 404)
        (404, 34): "BSNL",
        (404, 38): "BSNL",
        (404, 51): "BSNL",
        (404, 71): "BSNL",
        (404, 81): "BSNL",
    }

    def resolve_operator(self, mcc: Optional[int], mnc: Optional[int]) -> str:
        """
        Resolves brand operator from MCC and MNC codes.

        Args:
            mcc: Mobile Country Code.
            mnc: Mobile Network Code.

        Returns:
            Operator brand name string (e.g. Jio, Airtel, Vi, BSNL, or Unknown).
        """
        if mcc is None or mnc is None:
            return "Unknown"

        operator = self.MNC_MAP.get((mcc, mnc))
        if operator:
            return operator

        # Check by MNC prefixes or generic assumptions if MCC matches India
        if mcc in (404, 405):
            # Jio owns huge blocks in 405
            if mcc == 405 and 850 <= mnc <= 880:
                return "Jio"
            if mcc == 404 and mnc in (31, 37, 43, 44, 53, 54, 55, 57, 58, 59, 62):
                return "Vi"

        return "Unknown"
