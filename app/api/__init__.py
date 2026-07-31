"""
E-Rakshak API routing and endpoint handlers package.
"""

from app.api.health import router as health_router
from app.api.upload import router as upload_router

__all__ = ["health_router", "upload_router"]
