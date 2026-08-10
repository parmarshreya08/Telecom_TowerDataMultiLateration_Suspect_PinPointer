"""
Tower Dump data extractor.
Extracts cell site physical records and configurations.
"""

import math
from typing import Any, Optional
from uuid import UUID
import pandas as pd
from app.core.logging import logger
from app.exceptions.parsing import ExtractionFailureError
from app.ingestion.extractors.base import BaseExtractor


class TowerDumpExtractor(BaseExtractor):
    """
    Extractor implementation for parsing Cell Tower configurations (typically CSV/XLSX).
    Loads tower location database dumps into the system.
    """

    def extract(self, file_path: str, upload_id: UUID) -> list[dict[str, Any]]:
        """
        Parses cell site coordinate maps.

        Args:
            file_path: Local path to the cell tower dump file.

        Returns:
            List of raw dictionaries representing towers.
        """
        logger.info("extracting_tower_dump", path=file_path)
        ext = file_path.lower()
        if ext.endswith('.csv'):
            df = pd.read_csv(file_path)
        elif ext.endswith(('.xlsx', '.xls')):
            df = pd.read_excel(file_path)
        elif ext.endswith('.tsv'):
            df = pd.read_csv(file_path, sep='\t')
        else:
            raise ExtractionFailureError(f"Unsupported tower dump format: {file_path}")
        records = df.to_dict(orient="records")
        def _clean_nan(val):
            if isinstance(val, float) and math.isnan(val):
                return None
            return val
        records = [{k: _clean_nan(v) for k, v in r.items()} for r in records]
        return [{str(k).strip(): v for k, v in r.items()} for r in records]
