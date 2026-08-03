"""
Operator mapping configurations for standardizing operator-specific raw fields.
Maps Airtel, Jio, Vi, and BSNL schemas into E-Rakshak system contracts.
"""

from datetime import datetime
from typing import Any
from uuid import uuid4

from app.contracts.enums import CallType, Operator, RadioTechnology, SourceType
from app.contracts.subscriber import SubscriberEventRecord
from app.contracts.tower import TowerRecord
from app.core.logging import logger
from app.utils.datetime_utils import parse_telecom_datetime


class OperatorMapper:
    """
    Handles translation mapping configurations between operator columns and contract formats.
    """

    @staticmethod
    def map_airtel_cdr(
        raw: dict[str, Any], upload_id: Any, source_file: str, record_number: int
    ) -> SubscriberEventRecord:
        # Standardize Airtel values
        lac_val = raw.get("lac")
        cell_id_val = raw.get("cell_id")
        lac = int(lac_val) if lac_val and str(lac_val).isdigit() else None
        cell_id = int(cell_id_val) if cell_id_val and str(cell_id_val).isdigit() else None
        
        mcc_val = raw.get("mcc", 404)
        mnc_val = raw.get("mnc", 45)
        mcc = int(mcc_val) if str(mcc_val).isdigit() else 404
        mnc = int(mnc_val) if str(mnc_val).isdigit() else 45

        cgi = f"{mcc}-{mnc}-{lac or 0}-{cell_id or 0}"
        dt = parse_telecom_datetime(raw.get("datetime", datetime.utcnow()))

        # Determine CallType enum
        raw_type = str(raw.get("type", "")).upper()
        if "MOC" in raw_type or "OUT" in raw_type:
            call_type = CallType.OUTGOING
        elif "MTC" in raw_type or "INC" in raw_type:
            call_type = CallType.INCOMING
        elif "SMS" in raw_type:
            call_type = CallType.SMS
        elif "DATA" in raw_type:
            call_type = CallType.DATA
        else:
            call_type = CallType.UNKNOWN

        return SubscriberEventRecord(
            event_id=uuid4(),
            upload_id=upload_id,
            operator=Operator.AIRTEL,
            source_type=SourceType.CDR,
            phone_number=raw.get("calling_no"),
            imei=raw.get("imei"),
            imsi=raw.get("imsi"),
            timestamp=dt,
            call_type=call_type,
            duration_seconds=int(raw.get("duration", 0)),
            cgi=cgi,
            mcc=mcc,
            mnc=mnc,
            lac=lac,
            cell_id=cell_id,
            tower_latitude=OperatorMapper._safe_float(raw.get("first_cgi_lat")),
            tower_longitude=OperatorMapper._safe_float(raw.get("first_cgi_lon")),
            signal_strength=OperatorMapper._safe_float(raw.get("signal_strength")),
            timing_advance=OperatorMapper._safe_int(raw.get("timing_advance")),
            rtt=OperatorMapper._safe_float(raw.get("rtt")),
            source_file=source_file,
            record_number=record_number,
            raw_fields=raw,
        )

    @staticmethod
    def _safe_float(value: Any) -> Any:
        """Converts a raw string to float when possible."""
        if value is None or value == "":
            return None
        try:
            return float(value)
        except (TypeError, ValueError):
            return None

    @staticmethod
    def _safe_int(value: Any) -> Any:
        """Converts a raw string to int when possible."""
        if value is None or value == "":
            return None
        try:
            return int(value)
        except (TypeError, ValueError):
            return None

    @staticmethod
    def map_jio_cdr(
        raw: dict[str, Any], upload_id: Any, source_file: str, record_number: int
    ) -> SubscriberEventRecord:
        # Standardize Jio values
        cgi = str(raw.get("cgi_code", "405-855-0-0"))
        dt = parse_telecom_datetime(raw.get("start_time", datetime.utcnow()))

        parts = cgi.split("-")
        mcc = int(parts[0]) if len(parts) > 0 and parts[0].isdigit() else 405
        mnc = int(parts[1]) if len(parts) > 1 and parts[1].isdigit() else 855
        lac = int(parts[2]) if len(parts) > 2 and parts[2].isdigit() else None
        cell_id = int(parts[3]) if len(parts) > 3 and parts[3].isdigit() else None

        sig_strength = float(raw.get("signal_dbm")) if raw.get("signal_dbm") else None
        ta = int(raw.get("ta")) if raw.get("ta") else None
        rtt = float(raw.get("rtt")) if raw.get("rtt") else None

        raw_type = str(raw.get("direction", "")).upper()
        if "OUT" in raw_type:
            call_type = CallType.OUTGOING
        elif "IN" in raw_type:
            call_type = CallType.INCOMING
        elif "SMS" in raw_type:
            call_type = CallType.SMS
        elif "DATA" in raw_type:
            call_type = CallType.DATA
        else:
            call_type = CallType.UNKNOWN

        return SubscriberEventRecord(
            event_id=uuid4(),
            upload_id=upload_id,
            operator=Operator.JIO,
            source_type=SourceType.CDR,
            phone_number=raw.get("calling_party"),
            imei=raw.get("imei_number"),
            imsi=raw.get("imsi_code"),
            timestamp=dt,
            call_type=call_type,
            duration_seconds=int(raw.get("duration_sec", 0)),
            cgi=cgi,
            mcc=mcc,
            mnc=mnc,
            lac=lac,
            cell_id=cell_id,
            signal_strength=sig_strength,
            timing_advance=ta,
            rtt=rtt,
            source_file=source_file,
            record_number=record_number,
            raw_fields=raw,
        )

    @staticmethod
    def map_vi_cdr(
        raw: dict[str, Any], upload_id: Any, source_file: str, record_number: int
    ) -> SubscriberEventRecord:
        # Standardize Vi values
        date_str = str(raw.get("call_date", ""))
        time_str = str(raw.get("call_time", ""))
        dt = parse_telecom_datetime(f"{date_str} {time_str}".strip())
        
        cgi = str(raw.get("cell_global_id", "404-20-0-0"))
        parts = cgi.split("-")
        mcc = int(parts[0]) if len(parts) > 0 and parts[0].isdigit() else 404
        mnc = int(parts[1]) if len(parts) > 1 and parts[1].isdigit() else 20
        lac = int(parts[2]) if len(parts) > 2 and parts[2].isdigit() else None
        cell_id = int(parts[3]) if len(parts) > 3 and parts[3].isdigit() else None

        raw_type = str(raw.get("call_type", "")).upper()
        if "OUT" in raw_type:
            call_type = CallType.OUTGOING
        elif "IN" in raw_type:
            call_type = CallType.INCOMING
        elif "SMS" in raw_type:
            call_type = CallType.SMS
        elif "DATA" in raw_type:
            call_type = CallType.DATA
        else:
            call_type = CallType.UNKNOWN

        return SubscriberEventRecord(
            event_id=uuid4(),
            upload_id=upload_id,
            operator=Operator.VI,
            source_type=SourceType.CDR,
            phone_number=raw.get("msisdn"),
            imei=raw.get("imei"),
            imsi=raw.get("imsi"),
            timestamp=dt,
            call_type=call_type,
            duration_seconds=int(raw.get("call_duration", 0)),
            cgi=cgi,
            mcc=mcc,
            mnc=mnc,
            lac=lac,
            cell_id=cell_id,
            signal_strength=OperatorMapper._safe_float(raw.get("signal_strength")),
            timing_advance=OperatorMapper._safe_int(raw.get("timing_advance")),
            rtt=OperatorMapper._safe_float(raw.get("rtt")),
            source_file=source_file,
            record_number=record_number,
            raw_fields=raw,
        )

    @staticmethod
    def map_bsnl_cdr(
        raw: dict[str, Any], upload_id: Any, source_file: str, record_number: int
    ) -> SubscriberEventRecord:
        # Standardize BSNL values
        cgi = str(raw.get("cgi", "404-81-0-0"))
        dt = parse_telecom_datetime(raw.get("timestamp_str", datetime.utcnow()))
        
        parts = cgi.split("-")
        mcc = int(parts[0]) if len(parts) > 0 and parts[0].isdigit() else 404
        mnc = int(parts[1]) if len(parts) > 1 and parts[1].isdigit() else 81
        lac = int(parts[2]) if len(parts) > 2 and parts[2].isdigit() else None
        cell_id = int(parts[3]) if len(parts) > 3 and parts[3].isdigit() else None

        raw_type = str(raw.get("call_direction", "")).upper()
        if "OUT" in raw_type:
            call_type = CallType.OUTGOING
        elif "IN" in raw_type:
            call_type = CallType.INCOMING
        elif "SMS" in raw_type:
            call_type = CallType.SMS
        elif "DATA" in raw_type:
            call_type = CallType.DATA
        else:
            call_type = CallType.UNKNOWN

        return SubscriberEventRecord(
            event_id=uuid4(),
            upload_id=upload_id,
            operator=Operator.BSNL,
            source_type=SourceType.CDR,
            phone_number=raw.get("target_number"),
            imei=raw.get("equipment_imei"),
            imsi=raw.get("subscriber_imsi"),
            timestamp=dt,
            call_type=call_type,
            duration_seconds=int(raw.get("duration_sec", 0)),
            cgi=cgi,
            mcc=mcc,
            mnc=mnc,
            lac=lac,
            cell_id=cell_id,
            signal_strength=OperatorMapper._safe_float(raw.get("signal_strength")),
            timing_advance=OperatorMapper._safe_int(raw.get("timing_advance")),
            rtt=OperatorMapper._safe_float(raw.get("rtt")),
            source_file=source_file,
            record_number=record_number,
            raw_fields=raw,
        )

    @staticmethod
    def map_tower_dump(raw: dict[str, Any]) -> TowerRecord:
        # Standardize Tower values
        azimuth_val = raw.get("azimuth")
        beam_val = raw.get("beamwidth")
        range_val = raw.get("range_meters")
        
        azimuth = float(azimuth_val) if azimuth_val else None
        beam = float(beam_val) if beam_val else None
        range_m = float(range_val) if range_val else None

        # operator name parsing
        raw_op = str(raw.get("operator", "Unknown")).lower()
        if "airtel" in raw_op:
            operator = Operator.AIRTEL
        elif "jio" in raw_op:
            operator = Operator.JIO
        elif "vi" in raw_op or "vodafone" in raw_op:
            operator = Operator.VI
        elif "bsnl" in raw_op:
            operator = Operator.BSNL
        else:
            operator = Operator.UNKNOWN

        # Technology parsing
        raw_radio = str(raw.get("frequency_band", "")).upper()
        if "GSM" in raw_radio or "2G" in raw_radio:
            radio = RadioTechnology.GSM
        elif "UMTS" in raw_radio or "3G" in raw_radio:
            radio = RadioTechnology.UMTS
        elif "LTE" in raw_radio or "4G" in raw_radio:
            radio = RadioTechnology.LTE
        elif "5G" in raw_radio or "NR" in raw_radio:
            radio = RadioTechnology.NR
        else:
            radio = RadioTechnology.UNKNOWN

        cgi = str(raw.get("cgi", ""))
        parts = cgi.split("-")
        mcc = int(parts[0]) if len(parts) > 0 and parts[0].isdigit() else 404
        mnc = int(parts[1]) if len(parts) > 1 and parts[1].isdigit() else 10
        lac = int(parts[2]) if len(parts) > 2 and parts[2].isdigit() else 0
        cell_id = int(parts[3]) if len(parts) > 3 and parts[3].isdigit() else 0

        return TowerRecord(
            tower_id=uuid4(),
            operator=operator,
            radio=radio,
            mcc=mcc,
            mnc=mnc,
            lac=lac,
            cell_id=cell_id,
            cgi=cgi,
            latitude=float(raw.get("latitude", 0.0)),
            longitude=float(raw.get("longitude", 0.0)),
            azimuth=azimuth,
            beamwidth=beam,
            range_meters=range_m,
            site_address=raw.get("site_address"),
        )

    @staticmethod
    def map_spot_dump(
        raw: dict[str, Any], upload_id: Any, source_file: str, record_number: int
    ) -> SubscriberEventRecord:
        # Standardize Spot dump
        cgi = str(raw.get("cell_site_cgi", ""))
        dt = parse_telecom_datetime(raw.get("event_timestamp", datetime.utcnow()))
        
        parts = cgi.split("-")
        mcc = int(parts[0]) if len(parts) > 0 and parts[0].isdigit() else 404
        mnc = int(parts[1]) if len(parts) > 1 and parts[1].isdigit() else 10
        lac = int(parts[2]) if len(parts) > 2 and parts[2].isdigit() else None
        cell_id = int(parts[3]) if len(parts) > 3 and parts[3].isdigit() else None

        raw_desc = str(raw.get("event_description", "")).upper()
        if "OUT" in raw_desc:
            call_type = CallType.OUTGOING
        elif "IN" in raw_desc:
            call_type = CallType.INCOMING
        elif "SMS" in raw_desc:
            call_type = CallType.SMS
        elif "DATA" in raw_desc:
            call_type = CallType.DATA
        elif "REG" in raw_desc or "LOC" in raw_desc:
            call_type = CallType.REGISTRATION
        else:
            call_type = CallType.UNKNOWN

        return SubscriberEventRecord(
            event_id=uuid4(),
            upload_id=upload_id,
            operator=Operator.UNKNOWN,  # Spot dumps contain numbers from multiple operators
            source_type=SourceType.SPOT_DUMP,
            phone_number=raw.get("phone_number"),
            imei=raw.get("imei"),
            imsi=raw.get("imsi"),
            timestamp=dt,
            call_type=call_type,
            duration_seconds=0,
            cgi=cgi,
            mcc=mcc,
            mnc=mnc,
            lac=lac,
            cell_id=cell_id,
            source_file=source_file,
            record_number=record_number,
            raw_fields=raw,
        )
