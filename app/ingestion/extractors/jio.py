"""
Jio-specific Call Detail Record (CDR) data extractor.
Processes Jio CSV file outputs and maps rows to SubscriberEventRecord models.
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


class JioExtractor(BaseExtractor):
    """
    Concrete extractor for Jio CDR files.
    """

    # Direct mapping config between Jio CSV columns and SubscriberEventRecord properties
    COLUMN_MAP = {
        "calling party telephone number": "phone_number",
        "calling_party_telephone_number": "phone_number",
        "imei": "imei",
        "imsi": "imsi",
        "call date": "call_date",
        "call_date": "call_date",
        "call time": "call_time",
        "call_time": "call_time",
        "call duration": "duration_seconds",
        "call_duration": "duration_seconds",
        "first cell id": "cgi",
        "first_cell_id": "cgi",
        "call type": "call_type",
        "call_type": "call_type",
    }

    # Dedicated Jio CallType mapping dictionary
    CALL_TYPE_MAP = {
        "moc": CallType.OUTGOING,
        "mtc": CallType.INCOMING,
        "outgoing": CallType.OUTGOING,
        "incoming": CallType.INCOMING,
        "sms": CallType.SMS,
        "data": CallType.DATA,
        "registration": CallType.REGISTRATION,
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
        Parses Jio files and returns a list of normalized SubscriberEventRecords.
        """
        logger.info("extraction_started", extractor=self.__class__.__name__, path=file_path)

        if not os.path.exists(file_path):
            raise FileNotFoundError(f"Jio CDR file not found: {file_path}")

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
        Locates the header row by matching standard Jio telecom keywords.
        """
        telecom_keywords = {
            "calling party telephone number", "calling_party_telephone_number",
            "called party telephone number", "first cell id", "first_cell_id",
            "imei", "imsi", "call date", "call_date", "call time", "call_time"
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

    def _parse_cgi_components(self, cgi: str) -> tuple[Optional[int], Optional[int], Optional[int], Optional[int]]:
        """
        Parses CGI components from a string formatted as MCC-MNC-LAC-CI (e.g., 405-854-1234-5678).
        """
        if not cgi:
            return None, None, None, None
        parts = cgi.split("-")
        if len(parts) == 4:
            try:
                mcc = int(parts[0].strip())
                mnc = int(parts[1].strip())
                lac = int(parts[2].strip())
                cell_id = int(parts[3].strip())
                return mcc, mnc, lac, cell_id
            except ValueError:
                pass
        return None, None, None, None

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

        # Combine Call Date and Call Time for timestamp
        call_date = mapped_data.get("call_date")
        call_time = mapped_data.get("call_time")
        if not call_date:
            raise ValueError("Row is missing mandatory Call Date column.")

        if call_time:
            timestamp_str = f"{call_date.strip()} {call_time.strip()}"
        else:
            timestamp_str = call_date.strip()

        timestamp = parse_telecom_datetime(timestamp_str)

        # First Cell ID / CGI
        cgi = mapped_data.get("cgi")
        if not cgi:
            raise ValueError("Row is missing mandatory First Cell ID column.")

        # Parse CGI parts if the format clearly supports MCC-MNC-LAC-CI
        mcc, mnc, lac, cell_id = self._parse_cgi_components(cgi)

        # Phone Number
        phone_number = mapped_data.get("phone_number")

        duration_seconds = self._safe_int(mapped_data.get("duration_seconds")) or 0

        # Dedicated Jio CallType mapping
        call_type_str = str(mapped_data.get("call_type", "")).strip().lower()
        call_type = self.CALL_TYPE_MAP.get(call_type_str, CallType.UNKNOWN)

        return SubscriberEventRecord(
            event_id=uuid4(),
            upload_id=upload_id,
            operator=Operator.JIO,
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
            tower_latitude=None,
            tower_longitude=None,
            signal_strength=None,
            timing_advance=None,
            rtt=None,
            source_file=source_file,
            record_number=row_idx,
            raw_fields=row_dict  # Preserve every original column from the Jio file
        )
