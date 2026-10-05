import math
from typing import Dict, Any, Tuple
from app.core.logging import logger
from app.services.alert_service import alert_service
from app.services.ws_manager import connection_manager

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
    # In-memory state tracking for simplicity. In production, use Redis or Postgres.
    # case_id -> {"state": str, "last_lat": float, "last_lon": float, "stationary_count": int}
    _states: Dict[str, Dict[str, Any]] = {}

    @classmethod
    async def process_tsp_payload(cls, case_id: str, payload: Dict[str, Any]):
        """
        Process incoming TSP payload, localize it, evaluate state machine,
        dispatch alerts if needed, and push to WebSockets.
        """
        logger.info(f"Processing TSP payload for {case_id}")
        
        # 1. Ingestion & Localization
        # In a real scenario, we'd pass this to `engine.localize()`. 
        # For this demo, let's just make a mock localization based on TA for demonstration, 
        # or call the actual localization if we adapt the payload.
        # Let's fake the lat/long slightly moving for demo purposes.
        # Since we want to test the state machine, we can generate a mock coordinate.
        
        # Simulated localization (replace with actual engine call if data is strictly formatted)
        # We will use base coordinates and add small offsets based on timing advance
        base_lat = 28.6139
        base_lon = 77.2090
        ta = payload.get("serving_cell", {}).get("timing_advance", 10)
        
        # Create some movement based on TA
        current_lat = base_lat + (ta * 0.0001)
        current_lon = base_lon + (ta * 0.0001)
        
        # 2. Movement State Machine
        state_data = cls._states.get(case_id, {
            "state": STATIONARY,
            "last_lat": None,
            "last_lon": None,
            "stationary_count": 0
        })
        
        current_state = state_data["state"]
        last_lat = state_data["last_lat"]
        last_lon = state_data["last_lon"]
        stationary_count = state_data["stationary_count"]
        
        delta_d = 0.0
        if last_lat is not None and last_lon is not None:
            delta_d = haversine_distance(last_lat, last_lon, current_lat, current_lon)
            logger.info(f"Case {case_id}: Delta distance is {delta_d:.2f} meters")
        
            # Condition A: Start Trip
            if current_state == STATIONARY and delta_d > 50:
                current_state = MOVING
                stationary_count = 0
                logger.warning(f"Case {case_id}: State changed to MOVING! Triggering alert.")
                
                # Trigger Alert
                token = alert_service.generate_tracking_token(case_id)
                # In real app, domain should come from config
                tracking_link = f"http://localhost:3000/t/{token}"
                msg = f"Target Moving. View live: {tracking_link}"
                # Hardcoded number for demo, should fetch assigned inspector's number from DB
                alert_service.send_sms("+919999999999", msg)
                
            # Condition B: Continuing Trip
            elif current_state == MOVING and delta_d > 50:
                stationary_count = 0
                logger.info(f"Case {case_id}: Continuing to move.")
                
            # Condition C: End Trip
            elif delta_d < 10:
                stationary_count += 1
                if current_state == MOVING and stationary_count >= 3:
                    current_state = STATIONARY
                    logger.info(f"Case {case_id}: State changed to STATIONARY.")
        else:
            # First ping
            logger.info(f"Case {case_id}: Initial location fix.")
        
        # Update state
        cls._states[case_id] = {
            "state": current_state,
            "last_lat": current_lat,
            "last_lon": current_lon,
            "stationary_count": stationary_count
        }
        
        # 3. Push to WebSockets
        ws_payload = {
            "type": "live_location_update",
            "case_id": case_id,
            "lat": current_lat,
            "lng": current_lon,
            "state": current_state,
            "timestamp": payload.get("timestamp")
        }
        await connection_manager.broadcast_to_case(case_id, ws_payload)
