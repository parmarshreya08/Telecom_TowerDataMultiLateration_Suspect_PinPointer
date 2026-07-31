"""
E-Rakshak structural schema contracts.
This package contains strongly-typed interfaces shared between all pipeline stages
and external consumers (like the Trilateration Engine).
"""

from app.contracts.detection import DetectionResult
from app.contracts.enums import CallType, FrameStatus, Operator, RadioTechnology, SourceType
from app.contracts.measurement import MeasurementFrame, MeasurementTower
from app.contracts.subscriber import SubscriberEventRecord
from app.contracts.tower import TowerRecord
from app.contracts.upload import UploadMetadata

__all__ = [
    # Enums
    "Operator",
    "SourceType",
    "CallType",
    "RadioTechnology",
    "FrameStatus",
    
    # Models
    "UploadMetadata",
    "SubscriberEventRecord",
    "TowerRecord",
    "MeasurementTower",
    "MeasurementFrame",
    "DetectionResult",
]
