"""
E-Rakshak API routing and endpoint handlers package.
"""

from app.api.cases import router as cases_router
from app.api.exports import router as exports_router
from app.api.files import router as files_router
from app.api.health import router as health_router
from app.api.upload import router as upload_router

__all__ = ["cases_router", "exports_router", "files_router", "health_router", "upload_router"]
