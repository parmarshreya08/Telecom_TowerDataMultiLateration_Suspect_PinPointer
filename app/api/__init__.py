"""
E-Rakshak API routing and endpoint handlers package.
"""

from app.api.admin import router as admin_router
from app.api.auth import router as auth_router
from app.api.cases import router as cases_router
from app.api.exports import router as exports_router
from app.api.files import router as files_router
from app.api.health import router as health_router
from app.api.upload import router as upload_router

__all__ = [
    "admin_router",
    "auth_router",
    "cases_router",
    "exports_router",
    "files_router",
    "health_router",
    "upload_router",
]
