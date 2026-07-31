"""
Signature definitions for E-Rakshak File Detection.
Contains exact and partial keyword match definitions for classifying operators and sources.
Allows easy addition of future formats (e.g. LBS, CEIR, IPDR).
"""

from app.contracts.enums import Operator, SourceType

# ==============================================================================
# Operator Column Signatures
# ==============================================================================

AIRTEL_SIGNATURE = {
    "exact": ["target no", "first cgi", "first cgi lat/long", "calling_no", "called_no", "calling no"],
    "partial": ["airtel", "called"]
}

JIO_SIGNATURE = {
    "exact": ["calling party", "first cell id", "roaming circle name", "calling_party", "receiving_party", "cgi_code", "imei_number", "imsi_code"],
    "partial": ["jio", "ta", "signal_dbm"]
}

VI_SIGNATURE = {
    "exact": ["target /a party number", "first bts location", "first cell global id", "cell_global_id", "call_duration"],
    "partial": ["vi", "vodafone", "idea", "other_party"]
}

BSNL_SIGNATURE = {
    "exact": ["target/a-party number", "equipment_imei", "subscriber_imsi", "lat-", "long-", "target_number"],
    "partial": ["bsnl", "associated"]
}

# ==============================================================================
# Source Type Column Signatures
# ==============================================================================

CDR_SIGNATURE = {
    "exact": [
        "calling number", "called number", "calling party", "target no", "a party number", 
        "target/a-party number", "calling_no", "called_no", "calling_party", "receiving_party", 
        "msisdn", "target_number", "phone_number", "duration", "duration_sec", "call_duration"
    ],
    "partial": ["call", "sms", "imsi", "imei", "time", "date"]
}

TOWER_DUMP_SIGNATURE = {
    "exact": ["ecgi", "band", "pci", "rsrp", "rsrq", "azimuth", "beamwidth", "range_meters", "frequency_band"],
    "partial": ["tower", "site", "lat", "long", "antenna", "cell_id"]
}

SPOT_DUMP_SIGNATURE = {
    "exact": ["google map", "event_description", "cell_site_cgi", "event_timestamp"],
    "partial": ["spot", "google", "map", "event", "description"]
}

# Future source type stubs (LBS, CEIR, IPDR) can be added here
LBS_SIGNATURE = {
    "exact": ["lbs_latitude", "lbs_longitude", "accuracy_radius"],
    "partial": ["lbs", "accuracy", "loc"]
}

CEIR_SIGNATURE = {
    "exact": ["blocked_imei", "ceir_case_id", "request_type"],
    "partial": ["ceir", "blocked", "stolen"]
}

IPDR_SIGNATURE = {
    "exact": ["source_ip", "dest_ip", "source_port", "dest_port", "bytes_transferred"],
    "partial": ["ipdr", "ipv4", "ipv6", "port", "protocol"]
}

# ==============================================================================
# Mapping Registries
# ==============================================================================

OPERATOR_SIGNATURES: dict[Operator, dict[str, list[str]]] = {
    Operator.AIRTEL: AIRTEL_SIGNATURE,
    Operator.JIO: JIO_SIGNATURE,
    Operator.VI: VI_SIGNATURE,
    Operator.BSNL: BSNL_SIGNATURE
}

SOURCE_TYPE_SIGNATURES: dict[SourceType, dict[str, list[str]]] = {
    SourceType.CDR: CDR_SIGNATURE,
    SourceType.TOWER_DUMP: TOWER_DUMP_SIGNATURE,
    SourceType.SPOT_DUMP: SPOT_DUMP_SIGNATURE,
    SourceType.LBS: LBS_SIGNATURE,
    SourceType.CEIR: CEIR_SIGNATURE,
    SourceType.IPDR: IPDR_SIGNATURE,
}
