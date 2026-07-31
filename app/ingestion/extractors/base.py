"""
Base Extractor interface for E-Rakshak.
Defines the extraction contract that all operators must implement.
"""

from abc import ABC, abstractmethod
from typing import Any, Optional
from uuid import UUID

from app.contracts.subscriber import SubscriberEventRecord


class BaseExtractor(ABC):
    """
    Abstract base class for operator-specific telecom CDR extractors.
    Transforms operator-specific input formats directly into standard SubscriberEventRecords.
    """

    @abstractmethod
    def extract(self, file_path: str, upload_id: UUID) -> list[Any]:
        """
        Extracts data records from the given telecom log file.

        Args:
            file_path: The local path to the raw data file.
            upload_id: Link to the ingestion batch metadata record.

        Returns:
            A list of standard models or records.

        Raises:
            ExtractionFailureError: If extraction fails due to data parsing issues.
        """
        pass
