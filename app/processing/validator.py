"""
Validation execution engine for processing subscriber event records.
"""

from typing import List, Optional, Tuple
from app.contracts.subscriber import SubscriberEventRecord
from app.processing.rules import (
    CallTypeRule,
    CgiRule,
    DurationRule,
    ImeiRule,
    ImsiRule,
    PhoneNumberRule,
    TimestampRule,
    UploadIdRule,
)


class ProcessingValidator:
    """
    Executes rules against SubscriberEventRecord objects to determine their validity and warnings.
    """

    def __init__(self, clock_skew_seconds: int = 300) -> None:
        self.rules = [
            UploadIdRule(),
            TimestampRule(clock_skew_seconds=clock_skew_seconds),
            PhoneNumberRule(),
            CgiRule(),
            CallTypeRule(),
            DurationRule(),
            ImeiRule(),
            ImsiRule(),
        ]

    def validate_record(self, record: SubscriberEventRecord) -> Tuple[bool, List[str], List[str], Optional[str]]:
        """
        Runs validation rules on a record.

        Returns:
            A tuple of (is_valid, errors, warnings, normalized_phone)
            where:
                - is_valid: True if no error-level failures, False otherwise.
                - errors: List of error messages.
                - warnings: List of warning messages.
                - normalized_phone: Standardized phone string from PhoneNumberRule, or None if failed/missing.
        """
        is_valid = True
        errors: List[str] = []
        warnings: List[str] = []
        normalized_phone: Optional[str] = None

        for rule in self.rules:
            ok, level, reason, extra = rule.validate(record)
            if level == "error" and not ok:
                is_valid = False
                if reason:
                    errors.append(reason)
            elif level == "warning":
                if reason:
                    warnings.append(reason)

            if isinstance(rule, PhoneNumberRule) and extra:
                normalized_phone = extra

        return is_valid, errors, warnings, normalized_phone
