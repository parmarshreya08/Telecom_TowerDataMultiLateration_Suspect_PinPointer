"""
File and operator detection modules.
"""

from app.ingestion.detector.base import BaseDetector
from app.ingestion.detector.detector import TelecomFileDetector

__all__ = ["BaseDetector", "TelecomFileDetector"]
