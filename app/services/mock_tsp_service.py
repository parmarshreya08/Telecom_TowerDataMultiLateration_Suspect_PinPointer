import asyncio
import random
from datetime import datetime, timezone
from typing import Dict, Any, List

from app.core.logging import logger

class MockTSPService:
    def __init__(self):
        self.active_trackings: Dict[str, asyncio.Task] = {}
        
    async def _tsp_worker(self, case_id: str, msisdn: str):
        logger.info(f"Started Mock TSP Worker for case_id: {case_id}, msisdn: {msisdn}")
        
        # Base coordinates for simulation (e.g., somewhere in India)
        base_lat = 28.6139
        base_lon = 77.2090
        
        step_index = 0
        
        try:
            while True:
                # Simulate moving around slowly
                # In real scenario, we get CGI, TA, NMR data.
                # Since we have an engine, we will generate fake NMR data that localizes to slightly moving lat/lng
                # But actually, the engine expects NMR data and then computes lat/lng.
                # For this mock, we can just send "raw" TSP payload and the backend will process it.
                
                # We'll just generate some synthetic payload. The actual localization engine takes NMR.
                # To make this easy, maybe we just mock the TSP payload. 
                # If we want the localization engine to give changing lat/long, we need to change the NMR data's CGI or TA.
                
                payload = {
                    "event_id": f"tsp_ping_{random.randint(1000, 9999)}",
                    "timestamp": datetime.now(timezone.utc).isoformat(),
                    "msisdn": msisdn,
                    "serving_cell": {
                        "cgi": "404-45-5201-14021",
                        "timing_advance": 10 + step_index % 5 # Change TA to simulate movement
                    },
                    "neighbor_cells": [
                        {"cgi": "404-45-5201-14022", "rssi_dbm": -75},
                        {"cgi": "404-45-5201-14023", "rssi_dbm": -88}
                    ]
                }
                
                logger.info(f"Mock TSP generated payload for {case_id}: {payload['event_id']}")
                
                # Import here to avoid circular imports if needed
                from app.services.live_tracking_service import LiveTrackingService
                await LiveTrackingService.process_tsp_payload(case_id, payload)
                
                step_index += 1
                # Wait for 10 seconds for demo purposes (Architecture says 3-5 mins, but for hackathon 10s is better for live demo)
                await asyncio.sleep(10)
        except asyncio.CancelledError:
            logger.info(f"Mock TSP Worker cancelled for case_id: {case_id}")
            raise
        except Exception as e:
            logger.error(f"Error in Mock TSP Worker for case_id {case_id}: {e}")

    def start_tracking(self, case_id: str, msisdn: str):
        if case_id in self.active_trackings:
            logger.warning(f"Already tracking case_id: {case_id}")
            return
            
        task = asyncio.create_task(self._tsp_worker(case_id, msisdn))
        self.active_trackings[case_id] = task
        logger.info(f"Spawned TSP background task for case {case_id}")

    def stop_tracking(self, case_id: str):
        if case_id in self.active_trackings:
            self.active_trackings[case_id].cancel()
            del self.active_trackings[case_id]
            logger.info(f"Stopped TSP background task for case {case_id}")

mock_tsp_service = MockTSPService()
