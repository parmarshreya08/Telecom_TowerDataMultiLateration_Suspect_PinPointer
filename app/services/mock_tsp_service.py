import asyncio
import random
import math
from datetime import datetime, timezone
from typing import Dict, Any

from app.core.logging import logger
from app.services.live_tracking_service import LiveTrackingService
from app.database.session import async_session_maker
from app.database.models.live_tracking import LiveTrackingSession

class MockTSPService:
    def __init__(self):
        self.active_trackings: Dict[str, asyncio.Task] = {}
        # Stores (case_id, imsi) -> {lat, lng, mode: 'lingering' | 'traveling'}
        self.target_states: Dict[str, Dict[str, Any]] = {}

    @staticmethod
    def _track_key(case_id: str, imsi: str) -> str:
        return f"{case_id}::{imsi}"

    def _generate_step(self, current_lat: float, current_lon: float, mode: str) -> tuple[float, float]:
        """Generate a random offset based on the movement mode"""
        # Roughly 1 degree lat is ~111km. 1 meter is ~0.000009 degrees.
        METER_DEGREE = 0.000009
        
        if mode == 'lingering':
            # Move 1 to 5 meters
            dist = random.uniform(1, 5)
        else: # traveling
            # Move 20 to 100 meters (simulate a car/running)
            dist = random.uniform(20, 100)
            
        angle = random.uniform(0, 2 * math.pi)
        
        d_lat = (dist * math.cos(angle)) * METER_DEGREE
        d_lon = (dist * math.sin(angle)) * METER_DEGREE
        
        return current_lat + d_lat, current_lon + d_lon

    async def _tsp_worker(self, case_id: str, imsi: str):
        logger.info(f"Started Mock TSP Worker for IMSI: {imsi} (Case: {case_id})")

        track_key = self._track_key(case_id, imsi)
        # Initialize random starting position (center of Surat roughly)
        if track_key not in self.target_states:
            self.target_states[track_key] = {
                "lat": 21.1702 + random.uniform(-0.02, 0.02),
                "lon": 72.8311 + random.uniform(-0.02, 0.02),
                "mode": "lingering",
                "ticks": 0
            }
            
        try:
            while True:
                state = self.target_states[track_key]
                
                # Randomly switch modes to test cost-optimization
                state["ticks"] += 1
                if state["mode"] == "lingering" and state["ticks"] > random.randint(5, 10):
                    state["mode"] = "traveling"
                    state["ticks"] = 0
                elif state["mode"] == "traveling" and state["ticks"] > random.randint(3, 8):
                    state["mode"] = "lingering"
                    state["ticks"] = 0
                    
                # Generate new position
                new_lat, new_lon = self._generate_step(state["lat"], state["lon"], state["mode"])
                state["lat"] = new_lat
                state["lon"] = new_lon
                
                payload = {
                    "event_id": f"tsp_ping_{random.randint(1000, 9999)}",
                    "timestamp": datetime.now(timezone.utc).isoformat(),
                    "imsi": imsi,
                    "msisdn": imsi, # For backward compat with any older payload formats
                    "lat": new_lat,
                    "lng": new_lon,
                    "serving_cell": {
                        "cgi": f"404-45-5201-{random.randint(100, 200)}",
                        "rxlev": random.randint(-90, -60)
                    }
                }
                
                await LiveTrackingService.process_tsp_payload(imsi, case_id, payload)
                
                # Wait for 10 seconds per ping
                await asyncio.sleep(10)
        except asyncio.CancelledError:
            logger.info(f"Mock TSP Worker cancelled for IMSI: {imsi}")
            raise
        except Exception as e:
            logger.error(f"Error in Mock TSP Worker for IMSI {imsi}: {e}")

    async def start_tracking(self, case_id: str, imsi: str):
        track_key = self._track_key(case_id, imsi)
        if track_key in self.active_trackings:
            logger.warning(f"Already tracking IMSI: {imsi} in case {case_id}")
            return

        # Register the session in the DB (upsert on composite key so a
        # re-enabled toggle for the same case does not PK-conflict).
        try:
            from sqlalchemy import select as _select

            async with async_session_maker() as session:
                existing = (
                    await session.execute(
                        _select(LiveTrackingSession).where(
                            LiveTrackingSession.case_id == case_id,
                            LiveTrackingSession.imsi == imsi,
                        )
                    )
                ).scalar_one_or_none()
                if existing is None:
                    session.add(LiveTrackingSession(imsi=imsi, case_id=case_id, is_active=True))
                else:
                    existing.is_active = True
                await session.commit()
        except Exception as e:
            logger.error(f"Failed to create LiveTrackingSession for {imsi}: {e}")

        task = asyncio.create_task(self._tsp_worker(case_id, imsi))
        self.active_trackings[track_key] = task
        logger.info(f"Spawned TSP background task for IMSI {imsi}")

    async def stop_tracking(self, case_id: str, imsi: str):
        track_key = self._track_key(case_id, imsi)
        task = self.active_trackings.pop(track_key, None)
        if task is not None:
            task.cancel()
            try:
                await asyncio.wait_for(asyncio.shield(task), timeout=5)
            except (asyncio.CancelledError, asyncio.TimeoutError):
                pass
            except Exception:
                pass
            
            try:
                async with async_session_maker() as session:
                    # Deactivate in DB (scoped to this case, not all cases with same IMSI)
                    from sqlalchemy import update
                    await session.execute(
                        update(LiveTrackingSession)
                        .where(LiveTrackingSession.imsi == imsi, LiveTrackingSession.case_id == case_id)
                        .values(is_active=False)
                    )
                    await session.commit()
            except Exception as e:
                logger.error(f"Failed to deactivate LiveTrackingSession for {imsi}: {e}")
                
            logger.info(f"Stopped TSP background task for IMSI {imsi}")

mock_tsp_service = MockTSPService()
