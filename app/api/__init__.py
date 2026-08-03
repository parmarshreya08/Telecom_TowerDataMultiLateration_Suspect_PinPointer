"""
E-Rakshak API routing and endpoint handlers package.
"""

from app.api.cases import router as cases_router
from app.api.health import router as health_router
from app.api.upload import router as upload_router

__all__ = ["cases_router", "health_router", "upload_router"]
