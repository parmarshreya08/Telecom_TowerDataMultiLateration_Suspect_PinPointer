"""
Extractor Factory for E-Rakshak Ingestion Pipeline.
Maps operator classifications to their respective extractor engine implementations.
"""

from app.contracts.detection import DetectionResult
from app.contracts.enums import Operator
from app.core.logging import logger
from app.exceptions.parsing import ExtractorNotFoundError
from app.ingestion.extractors.airtel import AirtelExtractor
from app.ingestion.extractors.base import BaseExtractor
from app.ingestion.extractors.bsnl import BSNLExtractor
from app.ingestion.extractors.jio import JioExtractor
from app.ingestion.extractors.vi import ViExtractor


class ExtractorFactory:
    """
    Factory resolving concrete BaseExtractor instances based on DetectionResult contracts.
    """

    # Registry mapping Operator enums directly to Extractor classes
    _REGISTRY: dict[Operator, type[BaseExtractor]] = {
        Operator.AIRTEL: AirtelExtractor,
        Operator.JIO: JioExtractor,
        Operator.VI: ViExtractor,
        Operator.BSNL: BSNLExtractor,
    }

    @classmethod
    def get_extractor(cls, detection_result: DetectionResult) -> BaseExtractor:
        """
        Retrieves the concrete extractor mapped to the detection result's operator.

        Args:
            detection_result: The classification contract result.

        Returns:
            An instantiated concrete class extending BaseExtractor.

        Raises:
            ExtractorNotFoundError: If the operator is unknown or unsupported in the registry.
        """
        operator = detection_result.operator
        extractor_class = cls._REGISTRY.get(operator)

        if not extractor_class:
            logger.warning("extractor_missing", operator=operator.value)
            raise ExtractorNotFoundError(
                f"No database extractor configuration registered for operator: '{operator.value}'."
            )

        logger.info(
            "extractor_selected",
            operator=operator.value,
            extractor_name=extractor_class.__name__
        )
        return extractor_class()
