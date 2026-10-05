from fastapi import APIRouter, HTTPException, Depends
from pydantic import BaseModel
from typing import List, Optional
import random

router = APIRouter(prefix="/api/v1/bts", tags=["BTS Detector"])

class BTSScanRequest(BaseModel):
    latitude: float
    longitude: float
    radius_meters: int
    scan_duration_sec: int

class TowerInfo(BaseModel):
    cgi: str
    pci: int
    frequency: float
    signal_strength: int
    is_rogue: bool
    confidence_score: float
    anomaly_reason: Optional[str] = None

class BTSScanResponse(BaseModel):
    scan_id: str
    towers_detected: int
    rogue_towers_found: int
    towers: List[TowerInfo]

@router.post("/scan", response_model=BTSScanResponse)
async def run_bts_scan(req: BTSScanRequest):
    """
    Simulates a rogue BTS tower detection scan in a given radius.
    """
    # Simulate finding towers
    num_towers = random.randint(3, 8)
    towers = []
    has_rogue = random.choice([True, False, False]) # 33% chance of finding rogue
    
    for i in range(num_towers):
        is_rogue = has_rogue and i == 0
        towers.append(
            TowerInfo(
                cgi=f"404-20-100-{random.randint(10, 99)}",
                pci=random.randint(1, 500),
                frequency=random.choice([1800.0, 2100.0, 2300.0, 850.0]),
                signal_strength=random.randint(-110, -50),
                is_rogue=is_rogue,
                confidence_score=round(random.uniform(85.0, 99.9), 1) if is_rogue else 0.0,
                anomaly_reason="Mismatched Location Area Code & Suspicious Power Level" if is_rogue else None
            )
        )
    
    return BTSScanResponse(
        scan_id=f"scan_{random.randint(1000,9999)}",
        towers_detected=num_towers,
        rogue_towers_found=1 if has_rogue else 0,
        towers=towers
    )
