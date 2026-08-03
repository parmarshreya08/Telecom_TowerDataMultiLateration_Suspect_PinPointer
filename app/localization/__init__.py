"""
Localization engine package for E-Rakshak.
Ports the validated prototype solvers (JPL trilateration, Kalman tracking,
GIS UTM/ellipse utilities) from my_local_work/code into the backend service.
"""

from app.localization.engine import LocalizationEngine
from app.localization.gis_utils import GISUtils
from app.localization.kalman_filter import KalmanTracker
from app.localization.sector_wedge import (
    centroid_of_intersection,
    intersect_sectors,
    make_sector_polygon,
    point_in_sector,
)
from app.localization.trilateration import JPLTrilateration

__all__ = [
    "GISUtils",
    "JPLTrilateration",
    "KalmanTracker",
    "LocalizationEngine",
    "centroid_of_intersection",
    "intersect_sectors",
    "make_sector_polygon",
    "point_in_sector",
]
