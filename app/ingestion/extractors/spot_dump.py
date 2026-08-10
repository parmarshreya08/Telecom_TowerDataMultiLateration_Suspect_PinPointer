"""
Spot Dump data extractor.
Extracts phone numbers active under a particular cell sector inside a time window.
"""

import math
from typing import Any, Optional
from uuid import UUID
import pandas as pd
from app.core.logging import logger
from app.exceptions.parsing import ExtractionFailureError
from app.ingestion.extractors.base import BaseExtractor


class SpotDumpExtractor(BaseExtractor):
    """
    Extractor implementation for parsing Spot Dump spreadsheets.
    Spot dumps list all active subscriber devices intersecting a tower area within a specific window.
    """

    def extract(self, file_path: str, upload_id: UUID) -> list[dict[str, Any]]:
        """
        Parses spot dumps and returns raw records.

        Args:
            file_path: Local path to the spot dump.

        Returns:
            List of raw dictionaries.
        """
        logger.info("extracting_spot_dump", path=file_path)
        ext = file_path.lower()
        if ext.endswith('.csv'):
            df = pd.read_csv(file_path)
        elif ext.endswith(('.xlsx', '.xls')):
            df = pd.read_excel(file_path)
        elif ext.endswith('.tsv'):
            df = pd.read_csv(file_path, sep='\t')
        else:
            raise ExtractionFailureError(f"Unsupported spot dump format: {file_path}")
        records = df.to_dict(orient="records")
        def _clean_nan(val):
            if isinstance(val, float) and math.isnan(val):
                return None
            return val
        records = [{k: _clean_nan(v) for k, v in r.items()} for r in records]
        return [{str(k).strip(): v for k, v in r.items()} for r in records]
