"""
Base interface for File / Operator detection stage.
"""

from abc import ABC, abstractmethod

from app.contracts.detection import DetectionResult


class BaseDetector(ABC):
    """
    Abstract base class for E-Rakshak file format and operator detection logic.
    Analyzes uploaded telemetry document structure to classify operator and data source category.
    """

    @abstractmethod
    def detect(self, file_path: str) -> DetectionResult:
        """
        Detects the operator and source format of the file.

        Args:
            file_path: The local filesystem path of the uploaded CSV.

        Returns:
            A DetectionResult contract holding the classification stats.

        Raises:
            IngestionParsingError: If detection fails due to malformed headers.
        """
        pass

    @abstractmethod
    def detect_operator(self, columns: list[str]) -> tuple[str, float, list[str]]:
        """
        Matches columns list against operator rule headers to identify brand source.

        Args:
            columns: List of header names.

        Returns:
            A tuple of (operator_name, confidence, matched_columns).
        """
        pass

    @abstractmethod
    def detect_source_type(self, columns: list[str]) -> tuple[str, float, list[str]]:
        """
        Matches columns list against source type rule headers to identify dataset classification.

        Args:
            columns: List of header names.

        Returns:
            A tuple of (source_type_name, confidence, matched_columns).
        """
        pass
