import os
from typing import Optional
from datetime import datetime, timedelta, timezone
import jwt
from app.core.logging import logger
from app.core.config import settings

# If Twilio is not installed or configured, we will mock it
try:
    from twilio.rest import Client
    TWILIO_AVAILABLE = True
except ImportError:
    TWILIO_AVAILABLE = False

class AlertService:
    def __init__(self):
        self.twilio_account_sid = os.environ.get("TWILIO_ACCOUNT_SID")
        self.twilio_auth_token = os.environ.get("TWILIO_AUTH_TOKEN")
        self.twilio_from_number = os.environ.get("TWILIO_FROM_NUMBER")

        self.is_configured = bool(self.twilio_account_sid and self.twilio_auth_token and self.twilio_from_number)
        # Idempotency: (to_number, message-hash) -> last sent timestamp (cooldown).
        self._last_sent: dict[tuple[str, str], datetime] = {}
        self._cooldown_s = 300

    def generate_tracking_token(self, case_id: str, expires_in_hours: int = 2) -> str:
        """
        Generate a short-lived signed JWT link for the Field Officer UI.
        """
        expiration = datetime.now(timezone.utc) + timedelta(hours=expires_in_hours)
        payload = {
            "case_id": case_id,
            "exp": expiration,
            "type": "live_tracking"
        }
        
        # Using the existing secret key from settings
        token = jwt.encode(payload, settings.API_KEY_SECRET, algorithm="HS256")
        return token

    def send_sms(self, to_number: str, message: str) -> bool:
        import hashlib

        if not TWILIO_AVAILABLE or not self.is_configured:
            logger.warning(f"[MOCK SMS not sent — Twilio unconfigured] To: {to_number}")
            return False

        key = (to_number, hashlib.sha256(message.encode()).hexdigest()[:16])
        now = datetime.now(timezone.utc)
        last = self._last_sent.get(key)
        if last is not None and (now - last).total_seconds() < self._cooldown_s:
            logger.info("sms_deduped_cooldown", to=to_number)
            return True
        self._last_sent[key] = now
            
        try:
            client = Client(self.twilio_account_sid, self.twilio_auth_token)
            msg = client.messages.create(
                body=message,
                from_=self.twilio_from_number,
                to=to_number
            )
            logger.info(f"Twilio SMS dispatched. SID: {msg.sid}")
            return True
        except Exception as e:
            logger.error(f"Failed to send Twilio SMS: {e}")
            return False

alert_service = AlertService()
