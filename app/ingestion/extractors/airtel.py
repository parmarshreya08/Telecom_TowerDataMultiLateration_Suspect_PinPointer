"""
Airtel Call Detail Record (CDR) data extractor.
Processes Airtel CSV file outputs and maps rows to SubscriberEventRecord models.
"""

import csv
import os
from datetime import datetime
from typing import Any, Generator, Optional
from uuid import UUID, uuid4

from app.contracts.enums import CallType, Operator, SourceType
from app.contracts.subscriber import SubscriberEventRecord
from app.core.logging import logger
from app.ingestion.extractors.base import BaseExtractor
from app.utils.datetime_utils import parse_telecom_datetime


class AirtelExtractor(BaseExtractor):
    """
    Concrete extractor for Airtel CDR files.
    """

    # Direct mapping config between potential Airtel CSV columns and SubscriberEventRecord fields
    COLUMN_MAP = {
        "calling_no": "phone_number",
        "calling no": "phone_number",
        "target no": "phone_number",
        "phone_number": "phone_number",
        "called_no": "phone_number_other",
        "called no": "phone_number_other",
        "imei": "imei",
        "imsi": "imsi",
        "datetime": "timestamp",
        "timestamp": "timestamp",
        "event_time": "timestamp",
        "first_cgi": "cgi",
        "first cgi": "cgi",
        "cgi": "cgi",
        "duration": "duration_seconds",
        "duration_seconds": "duration_seconds",
        "type": "call_type",
        "call_type": "call_type",
        "mcc": "mcc",
        "mnc": "mnc",
        "lac": "lac",
        "cell_id": "cell_id",
        "first_cgi_lat": "tower_latitude",
        "first cgi lat/long": "coords_raw",
        "latitude": "tower_latitude",
        "longitude": "tower_longitude",
        "signal_strength": "signal_strength",
        "rssi": "signal_strength",
        "timing_advance": "timing_advance",
        "ta": "timing_advance",
        "rtt": "rtt",
    }

    def _iter_rows(self, file_path: str) -> Generator[list[str], None, None]:
        """
        Lazily streams and parses CSV lines, falling back to latin-1 encoding if needed.
        """
        try:
            with open(file_path, "r", encoding="utf-8", errors="ignore") as f:
                for line in f:
                    if not line.strip():
                        continue
                    try:
                        row = next(csv.reader([line.strip()]))
                        yield row
                    except Exception:
                        continue
        except UnicodeDecodeError:
            with open(file_path, "r", encoding="latin-1") as f:
                for line in f:
                    if not line.strip():
                        continue
                    try:
                        row = next(csv.reader([line.strip()]))
                        yield row
                    except Exception:
                        continue

    def extract(self, file_path: str, upload_id: UUID) -> list[SubscriberEventRecord]:
        """
        Parses Airtel files and returns a list of normalized SubscriberEventRecords.
        """
        logger.info("extraction_started", extractor=self.__class__.__name__, path=file_path)
        
        if not os.path.exists(file_path):
            raise FileNotFoundError(f"Airtel CDR file not found: {file_path}")

        row_iterator = self._iter_rows(file_path)

        # 1. Read first 100 non-empty rows for header search
        preview_rows = []
        for _ in range(100):
            try:
                row = next(row_iterator)
                preview_rows.append(row)
            except StopIteration:
                break

        if not preview_rows:
            logger.info("extraction_completed", count=0, reason="empty_file")
            return []

        # 2. Find header
        headers, header_idx = self._find_header(preview_rows)
        if not headers:
            logger.warn("extraction_completed", count=0, reason="headers_not_found")
            return []

        source_file = os.path.basename(file_path)
        records: list[SubscriberEventRecord] = []
        skipped_count = 0

        # Define data rows generator starting after the header
        def data_rows_generator():
            for row in preview_rows[header_idx + 1:]:
                yield row
            for row in row_iterator:
                yield row

        # 3. Process data rows in a streaming fashion
        for idx, row in enumerate(data_rows_generator(), start=1):
            if len(row) < len(headers):
                logger.warn("row_skipped", row_number=idx, reason="column_count_mismatch")
                skipped_count += 1
                continue

            row_dict = dict(zip(headers, row))
            try:
                record = self._parse_row(row_dict, source_file, idx, upload_id)
                records.append(record)
                logger.debug("row_parsed", row_number=idx, event_id=str(record.event_id))
            except Exception as e:
                logger.warn("row_skipped", row_number=idx, reason=str(e))
                skipped_count += 1
                continue

        logger.info(
            "extraction_completed",
            extractor=self.__class__.__name__,
            total_parsed=len(records),
            total_skipped=skipped_count
        )
        return records

    def _find_header(self, raw_rows: list[list[str]]) -> tuple[list[str], int]:
        """
        Locates the header row by matching standard Airtel telecom keywords.
        """
        telecom_keywords = {
            "calling_no", "calling no", "target no", "called_no", "called no", 
            "first_cgi", "first cgi", "cgi", "imei", "imsi", "timestamp", "datetime"
        }
        best_idx = 0
        max_density = 0
        best_header: list[str] = []

        for idx, row in enumerate(raw_rows):
            density = sum(1 for cell in row if cell.strip().lower() in telecom_keywords)
            if density > max_density:
                max_density = density
                best_idx = idx
                best_header = [cell.strip() for cell in row]

        # Fallback to the first non-empty row if density scan fails
        if not best_header and raw_rows:
            for idx, row in enumerate(raw_rows):
                if any(cell.strip() for cell in row):
                    best_header = [cell.strip() for cell in row]
                    best_idx = idx
                    break

        return best_header, best_idx

    def _parse_coordinates(self, coords_raw: Optional[str]) -> tuple[Optional[str], Optional[str]]:
        """
        Parses coords_raw formatted as 'latitude/longitude' (e.g. '28.6139/77.2090').
        """
        if coords_raw:
            parts = coords_raw.split("/")
            if len(parts) == 2:
                return parts[0].strip(), parts[1].strip()
        return None, None

    def _safe_int(self, value: Optional[str]) -> Optional[int]:
        """
        Safely converts a string value to an integer, returning None on failure.
        """
        if value:
            try:
                return int(value)
            except ValueError:
                pass
        return None

    def _safe_float(self, value: Optional[str]) -> Optional[float]:
        """
        Safely converts a string value to a float, returning None on failure.
        """
        if value:
            try:
                return float(value)
            except ValueError:
                pass
        return None

    def _parse_row(self, row_dict: dict[str, str], source_file: str, row_idx: int, upload_id: UUID) -> SubscriberEventRecord:
        """
        Extracts and converts CSV cells into Pydantic models.
        """
        # Build normalized keys mapping
        mapped_data: dict[str, Any] = {}
        for raw_col, val in row_dict.items():
            norm_field = self.COLUMN_MAP.get(raw_col.strip().lower())
            if norm_field:
                mapped_data[norm_field] = val.strip()

        # 1. Coordinate split support for "First CGI Lat/Long" like "28.6139/77.2090"
        coords_raw = mapped_data.get("coords_raw")
        if coords_raw:
            lat_str, lon_str = self._parse_coordinates(coords_raw)
            if lat_str is not None and lon_str is not None:
                mapped_data["tower_latitude"] = lat_str
                mapped_data["tower_longitude"] = lon_str

        # 2. Convert Data Types
        # Timestamps
        timestamp_str = mapped_data.get("timestamp")
        if not timestamp_str:
            raise ValueError("Row is missing mandatory timestamp column.")
        
        # Convert timestamp using central date utility helper
        timestamp = parse_telecom_datetime(timestamp_str)

        # CGI
        cgi = mapped_data.get("cgi")
        if not cgi:
            raise ValueError("Row is missing mandatory CGI column.")

        # Phone Number
        phone_number = mapped_data.get("phone_number")

        duration_seconds = self._safe_int(mapped_data.get("duration_seconds")) or 0
        mcc = self._safe_int(mapped_data.get("mcc"))
        mnc = self._safe_int(mapped_data.get("mnc"))
        lac = self._safe_int(mapped_data.get("lac"))
        cell_id = self._safe_int(mapped_data.get("cell_id"))
        tower_latitude = self._safe_float(mapped_data.get("tower_latitude"))
        tower_longitude = self._safe_float(mapped_data.get("tower_longitude"))
        signal_strength = self._safe_float(mapped_data.get("signal_strength"))
        timing_advance = self._safe_int(mapped_data.get("timing_advance"))
        rtt = self._safe_float(mapped_data.get("rtt"))

        # Call Type resolving
        call_type_str = str(mapped_data.get("call_type", "")).upper()
        if "MOC" in call_type_str or "OUT" in call_type_str:
            call_type = CallType.OUTGOING
        elif "MTC" in call_type_str or "INC" in call_type_str:
            call_type = CallType.INCOMING
        elif "SMS" in call_type_str:
            call_type = CallType.SMS
        elif "DATA" in call_type_str:
            call_type = CallType.DATA
        elif "REG" in call_type_str:
            call_type = CallType.REGISTRATION
        else:
            call_type = CallType.UNKNOWN

        # Check for numeric conversion logic for optional coordinates/values mapping
        return SubscriberEventRecord(
            event_id=uuid4(),
            upload_id=upload_id,
            operator=Operator.AIRTEL,
            source_type=SourceType.CDR,
            phone_number=phone_number if phone_number else None,
            imei=mapped_data.get("imei") if mapped_data.get("imei") else None,
            imsi=mapped_data.get("imsi") if mapped_data.get("imsi") else None,
            timestamp=timestamp,
            call_type=call_type,
            duration_seconds=duration_seconds,
            cgi=cgi,
            mcc=mcc,
            mnc=mnc,
            lac=lac,
            cell_id=cell_id,
            tower_latitude=tower_latitude,
            tower_longitude=tower_longitude,
            signal_strength=signal_strength,
            timing_advance=timing_advance,
            rtt=rtt,
            source_file=source_file,
            record_number=row_idx,
            raw_fields=row_dict
        )
