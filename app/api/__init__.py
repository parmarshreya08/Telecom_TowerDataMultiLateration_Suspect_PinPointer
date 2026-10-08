"""
E-Rakshak API routing and endpoint handlers package.
"""

from app.api.admin import router as admin_router
from app.api.auth import router as auth_router
from app.api.cases import router as cases_router
from app.api.exports import router as exports_router
from app.api.files import router as files_router
from app.api.health import router as health_router
from app.api.localization import router as localization_router
from app.api.tracking_ws import router as tracking_ws_router
from app.api.upload import router as upload_router
from app.api.live_tracking import router as live_tracking_router
from app.api.sdr import router as sdr_router
from app.api.events_localization import router as events_localization_router

from app.api.bts import router as bts_router

__all__ = [
    "admin_router",
    "auth_router",
    "cases_router",
    "exports_router",
    "files_router",
    "health_router",
    "localization_router",
    "tracking_ws_router",
    "upload_router",
    "live_tracking_router",
    "sdr_router",
    "events_localization_router",
    "bts_router",
]

