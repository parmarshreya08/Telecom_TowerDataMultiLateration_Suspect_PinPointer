import math
from typing import Dict, Any, Tuple
from app.core.logging import logger
from app.utils.datetime_utils import now_ist, parse_telecom_datetime
from app.services.alert_service import alert_service
from app.services.ws_manager import connection_manager
from app.core.config import settings
from app.database.session import async_session_maker
from app.database.models.live_tracking import LiveTrackingFixModel

# Movement states
STATIONARY = "STATIONARY"
MOVING = "MOVING"

def haversine_distance(lat1: float, lon1: float, lat2: float, lon2: float) -> float:
    """Calculate the great circle distance in meters between two points on the earth."""
    R = 6371000  # Radius of earth in meters
    phi_1 = math.radians(lat1)
    phi_2 = math.radians(lat2)
    delta_phi = math.radians(lat2 - lat1)
    delta_lambda = math.radians(lon2 - lon1)
    
    a = math.sin(delta_phi / 2.0) ** 2 + math.cos(phi_1) * math.cos(phi_2) * math.sin(delta_lambda / 2.0) ** 2
    c = 2 * math.atan2(math.sqrt(a), math.sqrt(1 - a))
    
    return R * c

class LiveTrackingService:
    # In-memory state tracking for simplicity.
    # (case_id, imsi) -> {"state": str, "last_lat": float, "last_lon": float, "stationary_count": int}
    _states: Dict[str, Dict[str, Any]] = {}

    @staticmethod
    def _state_key(case_id: str, imsi: str) -> str:
        return f"{case_id}::{imsi}"

    @classmethod
    async def process_tsp_payload(cls, imsi: str, case_id: str, payload: Dict[str, Any]):
        """
        Process incoming TSP payload, localize it, evaluate state machine,
        dispatch alerts if needed, persist significant anchors, and push to WebSockets.
        """
        logger.info(f"Processing TSP payload for IMSI {imsi} in case {case_id}")
        
        # 1. Ingestion & Localization
        # In this implementation, the mock generator directly provides simulated lat/lng to skip trilateration math.
        current_lat = payload.get("lat")
        current_lon = payload.get("lng")
        
        if current_lat is None or current_lon is None:
            # Fallback to older behavior if payload doesn't contain lat/lng
            base_lat, base_lon = 28.6139, 77.2090
            ta = payload.get("serving_cell", {}).get("timing_advance", 10)
            current_lat = base_lat + (ta * 0.0001)
            current_lon = base_lon + (ta * 0.0001)
        
        # 2. Movement State Machine (hysteresis: enter MOVING >50m, exit <10m x3;
        # 10-50m dead-zone holds state but still advances the anchor).
        state_key = cls._state_key(case_id, imsi)
        state_data = cls._states.get(state_key, {
            "state": STATIONARY,
            "last_lat": None,
            "last_lon": None,
            "stationary_count": 0,
        })
        
        current_state = state_data["state"]
        last_lat = state_data["last_lat"]
        last_lon = state_data["last_lon"]
        stationary_count = state_data["stationary_count"]
        
        delta_d = 0.0
        is_significant = False
        
        if last_lat is not None and last_lon is not None:
            delta_d = haversine_distance(last_lat, last_lon, current_lat, current_lon)
            logger.info(f"IMSI {imsi}: Delta distance is {delta_d:.2f} meters")
            
            is_significant = delta_d > settings.LIVE_TRACKING_MOVEMENT_THRESHOLD_M

            # Condition A: Start Trip
            if current_state == STATIONARY and is_significant:
                current_state = MOVING
                stationary_count = 0
                logger.warning(f"IMSI {imsi}: State changed to MOVING! Triggering alert.")
                
                # Trigger Alert (Removed hardcoded SMS logic, sticking to WS alerts)
                
            # Condition B: Continuing Trip
            elif current_state == MOVING and is_significant:
                stationary_count = 0
                logger.info(f"IMSI {imsi}: Continuing to move.")
                
            # Condition C: End Trip (requires 3 consecutive <10m pings)
            elif delta_d < 10:
                stationary_count += 1
                if current_state == MOVING and stationary_count >= 3:
                    current_state = STATIONARY
                    logger.info(f"IMSI {imsi}: State changed to STATIONARY.")
            else:
                # Dead-zone 10-50m: hold state, reset dwell counter so drift
                # cannot accumulate into a false MOVING flip.
                stationary_count = 0
        else:
            # First ping is always significant to establish anchor
            logger.info(f"IMSI {imsi}: Initial location fix.")
            is_significant = True

        # DB timestamp columns are naive (IST wall-clock); an aware datetime
        # crashes asyncpg at bind time ("can't subtract offset-naive and
        # offset-aware datetimes"). parse_telecom_datetime normalizes to naive.
        timestamp_str = payload.get("timestamp")
        try:
            dt_timestamp = parse_telecom_datetime(timestamp_str) if timestamp_str else now_ist()
        except (ValueError, TypeError):
            dt_timestamp = now_ist()
        
        if is_significant:
            try:
                async with async_session_maker() as session:
                    fix = LiveTrackingFixModel(
                        case_id=case_id,
                        imsi=imsi,
                        timestamp=dt_timestamp,
                        latitude=current_lat,
                        longitude=current_lon,
                        is_significant_anchor=True
                    )
                    session.add(fix)
                    await session.commit()
            except Exception as e:
                logger.error(f"Failed to persist live tracking fix: {e}")

        # Always advance the anchor so the dead-zone cannot go stale.
        cls._states[state_key] = {
            "state": current_state,
            "last_lat": current_lat,
            "last_lon": current_lon,
            "stationary_count": stationary_count,
        }
        
        # 3. Always Push to WebSockets to keep UI responsive
        ws_payload = {
            "type": "live_location_update",
            "case_id": case_id,
            "imsi": imsi,
            "lat": current_lat,
            "lng": current_lon,
            "state": current_state,
            "is_significant_anchor": is_significant,
            "timestamp": dt_timestamp.isoformat()
        }
        await connection_manager.broadcast(case_id, "tracking:fix", ws_payload)
