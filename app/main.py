"""
Main entry point for the E-Rakshak Telecom Ingestion Pipeline application.
Initializes FastAPI, configures routers, configures documentation, and manages lifespans.
"""

from contextlib import asynccontextmanager
from typing import AsyncGenerator

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.api import cases_router, exports_router, files_router, health_router, upload_router
from app.core.config import settings
from app.core.logging import logger, setup_logging
from app.database.session import check_database_connection


@asynccontextmanager
async def app_lifespan(app: FastAPI) -> AsyncGenerator[None, None]:
    """
    Context manager managing app lifecycle events.
    Verifies database connectivity before serving, then yields.
    """
    # 1. Initialize structured logging
    setup_logging()

    # 2. Verify database connectivity before accepting requests
    if not await check_database_connection():
        logger.error("startup_database_unreachable", database_url=settings.DATABASE_URL)
        raise RuntimeError(
            "Database is unreachable at startup. Check DATABASE_URL and Neon connection."
        )

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

# Configure CORS for frontend access
app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "http://localhost:5173",
        "http://127.0.0.1:5173",
        "http://localhost:3000",
        "http://127.0.0.1:3000",
        "http://localhost:4173",
        "http://127.0.0.1:4173",
    ],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Include API endpoints
app.include_router(health_router)
app.include_router(upload_router)
app.include_router(cases_router)
app.include_router(exports_router)
app.include_router(files_router)

