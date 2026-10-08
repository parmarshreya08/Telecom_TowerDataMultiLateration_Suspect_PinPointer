"""
Main entry point for the E-Rakshak Telecom Ingestion Pipeline application.
Initializes FastAPI, configures routers, configures documentation, and manages lifespans.
"""

from contextlib import asynccontextmanager
from typing import AsyncGenerator

from fastapi import Depends, FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse

from app.api import (
    admin_router,
    auth_router,
    cases_router,
    exports_router,
    files_router,
    health_router,
    localization_router,
    tracking_ws_router,
    upload_router,
    live_tracking_router,
    sdr_router,
    events_localization_router,
    bts_router,
)
from app.core.config import settings
from app.core.deps import get_current_officer
from app.core.logging import logger, setup_logging
from app.core.middleware import RequestContextMiddleware, SecurityHeadersMiddleware
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

    # 3. Recover and re-enqueue any stuck uploads from previous runs
    try:
        from app.database.session import AsyncSessionLocal
        from app.database.models.telecom import UploadMetadataModel
        from app.services.ingest_queue import ingest_queue
        from sqlalchemy import select

        async with AsyncSessionLocal() as session:
            stmt = select(UploadMetadataModel).where(
                UploadMetadataModel.upload_status.in_(["pending", "uploaded", "processing"])
            )
            result = await session.execute(stmt)
            stuck_uploads = result.scalars().all()
            if stuck_uploads:
                logger.info("re_enqueuing_stuck_uploads_count", count=len(stuck_uploads))
                for upload in stuck_uploads:
                    logger.info(
                        "re_enqueuing_stuck_upload",
                        upload_id=str(upload.upload_id),
                        case_id=upload.case_id,
                        status=upload.upload_status,
                    )
                    await ingest_queue.enqueue(upload.upload_id, upload.case_id, upload.supabase_path)
    except Exception as e:
        logger.error("stuck_upload_recovery_failed", error=str(e))

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

# Cross-cutting HTTP middleware (Starlette wraps in reverse order of addition: last added is outermost).
app.add_middleware(RequestContextMiddleware)
app.add_middleware(SecurityHeadersMiddleware)

# Configure CORS for frontend access (outermost so CORS headers apply to all responses and error handlers)
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.effective_cors_origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
    expose_headers=["X-Request-ID"],
)


@app.exception_handler(Exception)
async def unhandled_exception_handler(request: Request, exc: Exception) -> JSONResponse:
    """Catch-all so unexpected errors return JSON (with a request id) and are
    logged with context instead of leaking a bare 500 traceback to clients."""
    request_id = request.scope.get("state", {}).get("request_id")
    logger.exception(
        "unhandled_exception",
        path=request.url.path,
        method=request.method,
        request_id=request_id,
    )
    return JSONResponse(
        status_code=500,
        content={
            "detail": "Internal server error",
            "request_id": request_id,
        },
    )

# Include API endpoints
# Auth & Localization estimation routers are public (open access)
app.include_router(auth_router)
app.include_router(localization_router)
app.include_router(live_tracking_router)
app.include_router(sdr_router)
app.include_router(events_localization_router)
app.include_router(bts_router)


# Admin router - requires ADMIN role
app.include_router(admin_router)

# Protected routers - require authentication
app.include_router(upload_router, dependencies=[Depends(get_current_officer)])
app.include_router(cases_router, dependencies=[Depends(get_current_officer)])
app.include_router(exports_router, dependencies=[Depends(get_current_officer)])
app.include_router(files_router, dependencies=[Depends(get_current_officer)])

# Health check stays public
app.include_router(health_router)


@app.get("/", tags=["meta"], summary="API index")
async def root() -> dict[str, str]:
    """Friendly API index so hitting the base URL is not a bare 404."""
    return {
        "service": settings.APP_NAME,
        "version": settings.APP_VERSION,
        "environment": settings.APP_ENV,
        "docs": "/docs",
        "health": "/health",
    }


# WebSocket tracking (auth validated inside the handler before accept)
app.include_router(tracking_ws_router)


if __name__ == "__main__":
    import uvicorn
    uvicorn.run("app.main:app", host=settings.HOST, port=settings.PORT, reload=settings.DEBUG)

