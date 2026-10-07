"""
Enum contracts defining telecom system constants.
All enums extend (str, Enum) to ensure automatic JSON serialization compatibility.
"""

from enum import Enum


class Operator(str, Enum):
    """
    Indian mobile network operators.
    """
    AIRTEL = "Airtel"
    JIO = "Jio"
    VI = "Vi"
    BSNL = "BSNL"
    UNKNOWN = "Unknown"


class SourceType(str, Enum):
    """
    Type of telecom dataset or trace evidence files uploaded.
    """
    CDR = "CDR"
    TOWER_DUMP = "TowerDump"
    SPOT_DUMP = "SpotDump"
    LBS = "LBS"
    CEIR = "CEIR"
    IPDR = "IPDR"
    NMR = "NMR"
    UNKNOWN = "Unknown"


class CallType(str, Enum):
    """
    Normalized call transaction classification.
    """
    INCOMING = "Incoming"
    OUTGOING = "Outgoing"
    SMS = "SMS"
    DATA = "Data"
    REGISTRATION = "Registration"
    UNKNOWN = "Unknown"


class RadioTechnology(str, Enum):
    """
    Wireless network technology standard.
    """
    GSM = "GSM"      # 2G
    UMTS = "UMTS"    # 3G
    LTE = "LTE"      # 4G
    NR = "NR"        # 5G New Radio
    UNKNOWN = "Unknown"


class FrameStatus(str, Enum):
    """
    Evaluation status of a compile measurement frame.
    Ready signifies 3+ functional towers are present for trilateration.
    """
    READY = "Ready"
    INCOMPLETE = "Incomplete"
    INVALID = "Invalid"
