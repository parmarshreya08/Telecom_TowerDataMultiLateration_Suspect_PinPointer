"""NMR CSV extractor: one row per tower observation inside an event."""

import csv
import uuid
from datetime import datetime
from pathlib import Path
from typing import Any, Optional
from uuid import UUID

from app.contracts.enums import CallType, Operator, SourceType
from app.contracts.subscriber import SubscriberEventRecord
from app.ingestion.extractors.base import BaseExtractor


def _parse_timestamp(value: str) -> datetime:
    value = value.strip().replace("Z", "+00:00")
    for fmt in ("%Y-%m-%dT%H:%M:%S%z", "%Y-%m-%d %H:%M:%S%z", "%Y-%m-%d %H:%M:%S", "%Y-%m-%dT%H:%M:%S", "%d/%m/%Y %H:%M:%S"):
        try:
            return datetime.strptime(value, fmt)
        except ValueError:
            continue
    return datetime.fromisoformat(value)


_CALL_TYPE = {
    "call": CallType.UNKNOWN,
    "voice": CallType.UNKNOWN,
    "outgoing": CallType.OUTGOING,
    "out": CallType.OUTGOING,
    "incoming": CallType.INCOMING,
    "in": CallType.INCOMING,
    "sms": CallType.SMS,
    "data": CallType.DATA,
    "registration": CallType.REGISTRATION,
}


class NmrExtractor(BaseExtractor):
    """Parses the NMR long-format CSV into SubscriberEventRecord rows."""

    def extract(self, file_path: str, upload_id: UUID) -> list[Any]:
        rows: list[SubscriberEventRecord] = []
        p = Path(file_path)
        delimiter = "\t" if p.suffix.lower() == ".tsv" else ","

        with p.open("r", encoding="utf-8-sig", newline="", errors="ignore") as f:
            reader = csv.DictReader(f, delimiter=delimiter)
            required = {"event_id", "event_timestamp", "event_type", "subscriber_id", "cell_global_id", "measurement_type", "measurement_value", "measurement_unit"}
            missing = required - {c.strip().lower() for c in (reader.fieldnames or [])}
            if missing:
                raise ValueError(f"NMR CSV missing required columns: {sorted(missing)}")

            columns = {c.strip().lower(): c for c in (reader.fieldnames or [])}
            for i, row in enumerate(reader, start=1):
                raw = {k.strip().lower(): (row.get(columns[k]) or "").strip() for k in columns}
                ts = _parse_timestamp(raw["event_timestamp"])
                ctype = _CALL_TYPE.get(raw.get("event_type", "").lower(), CallType.UNKNOWN)

                tr = SubscriberEventRecord(
                    event_id=uuid.uuid4(),
                    upload_id=upload_id,
                    operator=Operator.UNKNOWN,
                    source_type=SourceType.UNKNOWN,
                    phone_number=raw.get("subscriber_id") or None,
                    imei=raw.get("imei") or None,
                    imsi=raw.get("imsi") or None,
                    timestamp=ts,
                    call_type=ctype,
                    duration_seconds=0,
                    cgi=raw["cell_global_id"],
                    mcc=None,
                    mnc=None,
                    lac=None,
                    cell_id=None,
                    tower_latitude=_to_float(raw.get("tower_latitude")),
                    tower_longitude=_to_float(raw.get("tower_longitude")),
                    signal_strength=_to_float(raw.get("signal_strength_dbm")),
                    timing_advance=_to_int(raw.get("timing_advance")),
                    rtt=_to_float(raw.get("measurement_value")) if raw.get("measurement_type", "").lower() == "radio_rtt" else None,
                    source_file=p.name,
                    record_number=i,
                    raw_fields=raw,
                )
                rows.append(tr)
        return rows


def _to_float(value: Optional[str]) -> Optional[float]:
    if value in (None, ""):
        return None
    try:
        return float(value)
    except ValueError:
        return None


def _to_int(value: Optional[str]) -> Optional[int]:
    if value in (None, ""):
        return None
    try:
        return int(float(value))
    except ValueError:
        return None
