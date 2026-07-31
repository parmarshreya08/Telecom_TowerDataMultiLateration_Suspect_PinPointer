"""
Main entry point for the E-Rakshak Telecom Ingestion Pipeline application.
Initializes FastAPI, configures routers, configures documentation, and manages lifespans.
"""

from contextlib import asynccontextmanager
from typing import AsyncGenerator

from fastapi import FastAPI

from app.api import health_router, upload_router
from app.core.config import settings
from app.core.logging import logger, setup_logging


@asynccontextmanager
async def app_lifespan(app: FastAPI) -> AsyncGenerator[None, None]:
    """
    Context manager managing app lifecycle events.
    Fires startup logging configurations and shutdown cleanups.
    """
    # 1. Initialize structured logging
    setup_logging()
    
    logger.info(
        "starting_erakshak_backend",
        version="1.0.0",
        environment=settings.APP_ENV,
        debug=settings.DEBUG,
        docs_url=f"http://{settings.HOST}:{settings.PORT}/docs"
    )

    yield

    logger.info("stopping_erakshak_backend", reason="system_shutdown")


# Initialize FastAPI app
app = FastAPI(
    title=settings.APP_NAME,
    description=(
        "Pipeline-based data ingestion engine for telecom investigation intelligence (E-Rakshak).\n\n"
        "Ingests subscriber call records, cell-site coordinates, and device dumps. "
        "Outputs standard geographic measurement frames for downstream localization/trilateration solvers."
    ),
    version="1.0.0",
    docs_url="/docs",
    redoc_url="/redoc",
    lifespan=app_lifespan
)

# Include API endpoints
app.include_router(health_router)
app.include_router(upload_router)
