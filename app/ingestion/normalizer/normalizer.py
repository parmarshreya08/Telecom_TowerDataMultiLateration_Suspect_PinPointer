"""
Normalization engine for E-Rakshak pipeline.
Transforms validated raw database records into standard SubscriberEventRecord or TowerRecord contracts.
"""

from typing import Any, Union
from uuid import UUID

from app.contracts.subscriber import SubscriberEventRecord
from app.contracts.tower import TowerRecord
from app.core.logging import logger
from app.ingestion.normalizer.mapper import OperatorMapper


class TelecomNormalizer:
    """
    Orchestrates the conversion of various raw operator layouts into schema models.
    """

    def normalize_records(
        self,
        raw_records: list[dict[str, Any]],
        operator: str,
        file_type: str,
        upload_id: UUID,
        source_file: str
    ) -> list[Union[SubscriberEventRecord, TowerRecord]]:
        """
        Translates a batch of raw records to a clean list of Pydantic contract models.

        Args:
            raw_records: List of validated dictionary items.
            operator: Detected operator (Airtel, Jio, Vi, BSNL, Unknown).
            file_type: Data type (CDR, TowerDump, SpotDump).
            upload_id: Current ingestion execution ID.
            source_file: Name of the raw telecom file uploaded.

        Returns:
            List of SubscriberEventRecord or TowerRecord models.
        """
        logger.info(
            "normalizing_records",
            count=len(raw_records),
            operator=operator,
            file_type=file_type,
            source_file=source_file
        )
        
        normalized: list[Union[SubscriberEventRecord, TowerRecord]] = []

        for idx, record in enumerate(raw_records, start=1):
            try:
                if file_type == "TowerDump":
                    normalized.append(OperatorMapper.map_tower_dump(record))
                elif file_type == "SpotDump":
                    normalized.append(OperatorMapper.map_spot_dump(record, upload_id, source_file, idx))
                elif file_type == "CDR":
                    if operator == "Airtel":
                        normalized.append(OperatorMapper.map_airtel_cdr(record, upload_id, source_file, idx))
                    elif operator == "Jio":
                        normalized.append(OperatorMapper.map_jio_cdr(record, upload_id, source_file, idx))
                    elif operator == "Vi":
                        normalized.append(OperatorMapper.map_vi_cdr(record, upload_id, source_file, idx))
                    elif operator == "BSNL":
                        normalized.append(OperatorMapper.map_bsnl_cdr(record, upload_id, source_file, idx))
                    else:
                        normalized.append(OperatorMapper.map_airtel_cdr(record, upload_id, source_file, idx))
                else:
                    logger.warn("unsupported_file_type_in_normalizer", file_type=file_type)
            except Exception as e:
                # Log mapping errors and continue processing the rest of the batch
                logger.error("normalization_row_mapping_error", error=str(e), row=idx, record=record)

        logger.info(
            "normalization_completed",
            input_count=len(raw_records),
            output_count=len(normalized)
        )
        return normalized
