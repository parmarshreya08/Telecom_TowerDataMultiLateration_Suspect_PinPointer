"""
Telecom-specific calculations and math utilities.
Provides tools to estimate ranges from Timing Advance (TA) and RSSI values, 
and distance checks via Haversine logic.
"""

import math
from typing import Optional


def haversine_distance(
    lat1: float, lon1: float, lat2: float, lon2: float
) -> float:
    """
    Calculates the great-circle distance between two GPS coordinates in meters.
    """
    # Earth radius in meters
    R = 6371000.0

    phi1 = math.radians(lat1)
    phi2 = math.radians(lat2)
    delta_phi = math.radians(lat2 - lat1)
    delta_lambda = math.radians(lon2 - lon1)

    a = (math.sin(delta_phi / 2.0) ** 2 +
         math.cos(phi1) * math.cos(phi2) *
         math.sin(delta_lambda / 2.0) ** 2)
    
    c = 2.0 * math.atan2(math.sqrt(a), math.sqrt(1.0 - a))
    return R * c


def estimate_distance_from_ta(ta: int, tech: str = "LTE") -> float:
    """
    Estimates range distance in meters from cellular Timing Advance (TA).

    In GSM/2G: 1 TA step ≈ 554 meters.
    In LTE/4G: 1 TA step ≈ 78 meters.
    In 5G: 1 TA step ≈ 9.24 to 78 meters depending on subcarrier spacing.

    Args:
        ta: Timing Advance integer step index.
        tech: Cellular technology generation (GSM, LTE, 5G).

    Returns:
        Estimated distance in meters.
    """
    tech_upper = tech.upper()
    if tech_upper == "GSM":
        # 1 TA step corresponds to round-trip delay of 3.69 microseconds
        return float(ta * 554.0)
    elif tech_upper == "LTE":
        # 1 TA step in LTE represents 0.52 microseconds round-trip delay
        return float(ta * 78.12)
    elif tech_upper == "5G":
        # Standard subcarrier spacing basic approximation
        return float(ta * 39.0)
    
    # Generic conservative default
    return float(ta * 100.0)


def rssi_to_pathloss_distance(
    rssi: float, reference_power: float = -30.0, pathloss_exponent: float = 3.0
) -> float:
    """
    Estimates distance based on Received Signal Strength Indicator (RSSI) using Log-Distance Pathloss Model.
    Formula: RSSI = TxPower - 10 * n * log10(d)

    Args:
        rssi: Received signal strength in dBm.
        reference_power: RSSI at 1 meter distance (default -30 dBm).
        pathloss_exponent: Path loss exponent (2 for free space, 3-5 for urban/obstructed).

    Returns:
        Estimated distance in meters.
    """
    try:
        # Prevent division by zero
        if pathloss_exponent <= 0:
            return 0.0
        
        ratio = (reference_power - rssi) / (10.0 * pathloss_exponent)
        return float(10.0 ** ratio)
    except Exception:
        return 0.0
