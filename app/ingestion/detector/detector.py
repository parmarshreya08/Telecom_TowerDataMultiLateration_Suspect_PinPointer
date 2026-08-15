"""
Telecom File Detection Engine.
Classifies the operator and dataset source type of uploaded files based on column headers.

Design Heuristics:
1. Signatures: Known header fields (exact and partial) are loaded from `signatures.py`.
2. Confidence: Calculated as:
   (matched_exact_fields + matched_partial_fields) / (total_exact_fields + total_partial_fields)
3. Scaling: New operators or source types can be added by declaring signatures in `signatures.py` 
   and registering them in `OPERATOR_SIGNATURES` or `SOURCE_TYPE_SIGNATURES`.
"""

import csv
import os
from typing import Optional

from app.contracts.detection import DetectionResult
from app.contracts.enums import Operator, SourceType
from app.core.logging import logger
from app.exceptions.parsing import InvalidFileTypeError, MissingHeadersError
from app.ingestion.detector.base import BaseDetector
from app.ingestion.detector.signatures import OPERATOR_SIGNATURES, SOURCE_TYPE_SIGNATURES

# Map Operator and SourceType tuples directly to the corresponding Extractor class name
EXTRACTOR_MAP: dict[tuple[Operator, SourceType], str] = {
    (Operator.AIRTEL, SourceType.CDR): "AirtelExtractor",
    (Operator.JIO, SourceType.CDR): "JioExtractor",
    (Operator.VI, SourceType.CDR): "ViExtractor",
    (Operator.BSNL, SourceType.CDR): "BSNLExtractor",
    
    # Tower dump map routes
    (Operator.AIRTEL, SourceType.TOWER_DUMP): "TowerDumpExtractor",
    (Operator.JIO, SourceType.TOWER_DUMP): "TowerDumpExtractor",
    (Operator.VI, SourceType.TOWER_DUMP): "TowerDumpExtractor",
    (Operator.BSNL, SourceType.TOWER_DUMP): "TowerDumpExtractor",
    (Operator.UNKNOWN, SourceType.TOWER_DUMP): "TowerDumpExtractor",

    # Spot dump map routes
    (Operator.AIRTEL, SourceType.SPOT_DUMP): "SpotDumpExtractor",
    (Operator.JIO, SourceType.SPOT_DUMP): "SpotDumpExtractor",
    (Operator.VI, SourceType.SPOT_DUMP): "SpotDumpExtractor",
    (Operator.BSNL, SourceType.SPOT_DUMP): "SpotDumpExtractor",
    (Operator.UNKNOWN, SourceType.SPOT_DUMP): "SpotDumpExtractor",
}


class TelecomFileDetector(BaseDetector):
    """
    Refactored, dependency-free file detector that uses rule configurations from signatures.py.
    """

    def detect(self, file_path: str, original_filename: Optional[str] = None) -> DetectionResult:
        """
        Deduces the operator, source type, and confidence based on CSV headers.
        
        Only raises exceptions for invalid file formats, unreadable files, or missing headers.
        Returns Operator.UNKNOWN / SourceType.UNKNOWN if classification fails.
        """
        logger.info("file_detection_started", path=file_path)

        # 1. Validate File Format (CSV, XLSX, XLS, TSV all accepted after conversion)
        valid_exts = (".csv", ".xlsx", ".xls", ".tsv")
        if not file_path.lower().endswith(valid_exts):
            logger.error("invalid_file_format", path=file_path)
            raise InvalidFileTypeError(f"Unsupported file type. Supported: {', '.join(valid_exts)}")

        if not os.path.exists(file_path):
            logger.error("file_not_found", path=file_path)
            raise FileNotFoundError(f"File not found: {file_path}")

        # 2. Extract Columns (Safe read)
        columns = self._extract_columns(file_path)
        if not columns:
            logger.error("missing_headers", path=file_path)
            raise MissingHeadersError("No valid header row could be identified in the CSV file.")

        # 3. Detect Operator and Source Type
        operator, op_conf, op_matched = self.detect_operator(columns)
        source_type, st_conf, st_matched = self.detect_source_type(columns)

        # Fallback filename-based operator detection
        import re
        check_name = original_filename or os.path.basename(file_path)
        filename_tokens = [t.lower() for t in re.split(r'[^a-zA-Z0-9]', check_name)]
        filename_op = None
        if "airtel" in filename_tokens:
            filename_op = Operator.AIRTEL
        elif "jio" in filename_tokens:
            filename_op = Operator.JIO
        elif "vi" in filename_tokens or "vodafone" in filename_tokens or "idea" in filename_tokens:
            filename_op = Operator.VI
        elif "bsnl" in filename_tokens:
            filename_op = Operator.BSNL

        if filename_op and (operator == Operator.UNKNOWN or op_conf < 0.5):
            operator = filename_op
            op_conf = 1.0
            op_matched = list(set(op_matched + ["filename"]))

        # 4. Resolve Extractor Name using Mapping Dictionary
        extractor_name = EXTRACTOR_MAP.get(
            (operator, source_type), "UnknownExtractor"
        )

        # Calculate overall confidence as the average of the two confidence percentages
        overall_confidence = round((op_conf + st_conf) / 2.0, 2)
        matched_columns = list(set(op_matched + st_matched))

        # If either classification is unknown, reset confidence and matched columns
        if operator == Operator.UNKNOWN or source_type == SourceType.UNKNOWN:
            overall_confidence = 0.0
            matched_columns = []

        logger.info(
            "file_detected",
            operator=operator.value,
            source_type=source_type.value,
            confidence=overall_confidence,
            extractor=extractor_name,
            matched_count=len(matched_columns)
        )

        return DetectionResult(
            operator=operator,
            source_type=source_type,
            confidence=overall_confidence,
            detected_by=self.__class__.__name__,
            extractor_name=extractor_name,
            matched_columns=matched_columns
        )

    def detect_operator(self, columns: list[str]) -> tuple[Operator, float, list[str]]:
        """
        Scans columns against registered operator signatures to identify the brand source.
        """
        best_op = Operator.UNKNOWN
        best_conf = 0.0
        best_matched: list[str] = []

        columns_lower = [c.strip().lower() for c in columns]

        for op, sig in OPERATOR_SIGNATURES.items():
            matched_exact: set[str] = set()
            matched_partial: set[str] = set()
            col_matches: list[str] = []

            # Match exact headers
            for exact in sig["exact"]:
                if exact in columns_lower:
                    matched_exact.add(exact)
                    idx = columns_lower.index(exact)
                    col_matches.append(columns[idx])

            # Match partial headers
            for part in sig["partial"]:
                for idx, col_lower in enumerate(columns_lower):
                    if part in col_lower:
                        matched_partial.add(part)
                        col_matches.append(columns[idx])

            total_fields = len(sig["exact"]) + len(sig["partial"])
            matched_fields = len(matched_exact) + len(matched_partial)

            conf = 0.0
            if total_fields > 0:
                conf = round(matched_fields / total_fields, 2)
            conf = max(0.0, min(1.0, conf))

            if conf > best_conf:
                best_op = op
                best_conf = conf
                best_matched = list(set(col_matches))

        return best_op, best_conf, best_matched

    def detect_source_type(self, columns: list[str]) -> tuple[SourceType, float, list[str]]:
        """
        Scans columns against registered source signatures to identify the layout format.
        """
        best_st = SourceType.UNKNOWN
        best_conf = 0.0
        best_matched: list[str] = []

        columns_lower = [c.strip().lower() for c in columns]

        for st, sig in SOURCE_TYPE_SIGNATURES.items():
            matched_exact: set[str] = set()
            matched_partial: set[str] = set()
            col_matches: list[str] = []

            # Match exact headers
            for exact in sig["exact"]:
                if exact in columns_lower:
                    matched_exact.add(exact)
                    idx = columns_lower.index(exact)
                    col_matches.append(columns[idx])

            # Match partial headers
            for part in sig["partial"]:
                for idx, col_lower in enumerate(columns_lower):
                    if part in col_lower:
                        matched_partial.add(part)
                        col_matches.append(columns[idx])

            total_fields = len(sig["exact"]) + len(sig["partial"])
            matched_fields = len(matched_exact) + len(matched_partial)

            conf = 0.0
            if total_fields > 0:
                conf = round(matched_fields / total_fields, 2)
            conf = max(0.0, min(1.0, conf))

            if conf > best_conf:
                best_st = st
                best_conf = conf
                best_matched = list(set(col_matches))

        return best_st, best_conf, best_matched

    def _extract_columns(self, file_path: str) -> list[str]:
        """
        Analyzes the first 15 lines of a CSV text buffer.
        Finds the header row by measuring the density of telecom-related keywords.
        """
        try:
            with open(file_path, "r", encoding="utf-8", errors="ignore") as f:
                lines = [f.readline().strip() for _ in range(15)]
        except Exception as e:
            raise InvalidFileTypeError(f"Failed to open file: {e}")

        # Combined lookup list of key indicators
        telecom_keywords = {
            "cgi", "lac", "cell", "calling", "msisdn", "imei", "imsi", "target", "a party", 
            "b party", "direction", "duration", "timestamp", "datetime", "latitude", "longitude", 
            "azimuth", "beamwidth", "range", "gps", "roaming", "rtt", "ta", "signal"
        }

        best_columns: list[str] = []
        max_density = 0

        for line in lines:
            if not line:
                continue
            
            # Standard CSV parser logic (comma split)
            reader = csv.reader([line])
            try:
                parts = next(reader)
            except Exception:
                continue

            parts = [p.strip() for p in parts if p.strip()]
            density = sum(1 for p in parts if any(kw in p.lower() for kw in telecom_keywords))
            
            if density > max_density:
                max_density = density
                best_columns = parts

        # Fallback to the first non-empty line
        if not best_columns:
            for line in lines:
                if line:
                    try:
                        best_columns = next(csv.reader([line]))
                        best_columns = [p.strip() for p in best_columns if p.strip()]
                        if best_columns:
                            break
                    except Exception:
                        continue

        return best_columns
