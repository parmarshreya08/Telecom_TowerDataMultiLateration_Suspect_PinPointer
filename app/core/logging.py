"""
Structured logging configuration utilizing structlog.
Provides JSON formatting for production environments and colored prints for local development.
"""

import logging
import sys

import structlog
from structlog.types import EventDict, Processor

from app.core.config import settings


def drop_color_message_key(
    logger: logging.Logger, method_name: str, event_dict: EventDict
) -> EventDict:
    """
    Helper to clean up extra keys injected by some web frameworks.
    """
    event_dict.pop("color_message", None)
    return event_dict


def setup_logging() -> None:
    """
    Initializes structlog and integrates it with Python's standard logging library.
    """
    log_level_str = settings.LOG_LEVEL.upper()
    log_level = getattr(logging, log_level_str, logging.INFO)

    # Base logging processors
    shared_processors: list[Processor] = [
        structlog.contextvars.merge_contextvars,
        structlog.stdlib.add_log_level,
        structlog.stdlib.add_logger_name,
        structlog.stdlib.PositionalArgumentsFormatter(),
        structlog.processors.TimeStamper(fmt="iso"),
        structlog.processors.StackInfoRenderer(),
        structlog.processors.format_exc_info,
        drop_color_message_key,
        structlog.processors.UnicodeDecoder(),
    ]

    # Output rendering processors depending on environment
    if settings.APP_ENV == "production":
        # Production gets structured JSON logging
        renderer = structlog.processors.JSONRenderer()
    else:
        # Development gets pretty CLI output
        renderer = structlog.dev.ConsoleRenderer(colors=True)

    # Configure structlog
    structlog.configure(
        processors=shared_processors + [
            structlog.stdlib.ProcessorFormatter.wrap_for_formatter
        ],
        logger_factory=structlog.stdlib.LoggerFactory(),
        wrapper_class=structlog.stdlib.BoundLogger,
        cache_logger_on_first_use=True,
    )

    # Setup the handler
    handler = logging.StreamHandler(sys.stdout)
    handler.setFormatter(
        structlog.stdlib.ProcessorFormatter(
            foreign_pre_chain=shared_processors,
            processors=[
                structlog.stdlib.ProcessorFormatter.remove_processors_meta,
                renderer,
            ],
        )
    )

    # Configure root standard logger
    root_logger = logging.getLogger()
    root_logger.handlers = [handler]
    root_logger.setLevel(log_level)

    # Re-route third-party logs (uvicorn, fastapi) through structlog handler
    for logger_name in ("uvicorn", "uvicorn.error", "uvicorn.access", "fastapi"):
        logging_logger = logging.getLogger(logger_name)
        logging_logger.handlers = [handler]
        logging_logger.propagate = False
        logging_logger.setLevel(log_level)


# Create global structured logger instance
logger: structlog.stdlib.BoundLogger = structlog.get_logger("erakshak")
