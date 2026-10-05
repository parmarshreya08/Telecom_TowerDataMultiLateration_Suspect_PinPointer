"""
Cross-cutting HTTP middleware and error handling for E-Rakshak.

Kept as pure ASGI middleware (not BaseHTTPMiddleware) so WebSocket upgrades
and streaming responses pass through untouched.

- RequestContextMiddleware: assigns/propagates an X-Request-ID, binds it into
  structlog contextvars, times the request, and emits a structured access log.
- SecurityHeadersMiddleware: sets conservative security headers on every HTTP
  response (HSTS only in production).
"""

from __future__ import annotations

import time
import uuid

import structlog
from starlette.datastructures import MutableHeaders
from starlette.types import ASGIApp, Message, Receive, Scope, Send

from app.core.config import settings

logger = structlog.get_logger("erakshak.access")

REQUEST_ID_HEADER = "X-Request-ID"


class RequestContextMiddleware:
    """Injects a request ID, binds log context, and logs each HTTP request."""

    def __init__(self, app: ASGIApp) -> None:
        self.app = app

    async def __call__(self, scope: Scope, receive: Receive, send: Send) -> None:
        if scope["type"] != "http":
            await self.app(scope, receive, send)
            return

        headers = dict(scope.get("headers") or [])
        incoming = headers.get(REQUEST_ID_HEADER.lower().encode())
        request_id = incoming.decode() if incoming else uuid.uuid4().hex[:16]

        # Make the request id visible to any logger used downstream.
        structlog.contextvars.clear_contextvars()
        structlog.contextvars.bind_contextvars(request_id=request_id)

        scope.setdefault("state", {})
        scope["state"]["request_id"] = request_id

        status_code = 500
        start = time.perf_counter()

        async def send_wrapper(message: Message) -> None:
            nonlocal status_code
            if message["type"] == "http.response.start":
                status_code = message["status"]
                MutableHeaders(scope=message).append(REQUEST_ID_HEADER, request_id)
            await send(message)

        try:
            await self.app(scope, receive, send_wrapper)
        finally:
            duration_ms = round((time.perf_counter() - start) * 1000, 1)
            client = scope.get("client")
            logger.info(
                "http_request",
                method=scope.get("method"),
                path=scope.get("path"),
                status_code=status_code,
                duration_ms=duration_ms,
                client=client[0] if client else None,
            )
            structlog.contextvars.clear_contextvars()


class SecurityHeadersMiddleware:
    """Adds conservative security headers to every HTTP response."""

    # Reasonable defaults for a JSON API. CSP is intentionally omitted here
    # because the API does not serve HTML; the static frontend owns its CSP.
    _BASE_HEADERS = {
        "X-Content-Type-Options": "nosniff",
        "X-Frame-Options": "DENY",
        "Referrer-Policy": "no-referrer",
        "Permissions-Policy": "geolocation=(), microphone=(), camera=()",
        "Cross-Origin-Opener-Policy": "same-origin",
    }

    def __init__(self, app: ASGIApp) -> None:
        self.app = app

    async def __call__(self, scope: Scope, receive: Receive, send: Send) -> None:
        if scope["type"] != "http":
            await self.app(scope, receive, send)
            return

        async def send_wrapper(message: Message) -> None:
            if message["type"] == "http.response.start":
                headers = MutableHeaders(scope=message)
                for key, value in self._BASE_HEADERS.items():
                    headers.append(key, value)
                if settings.APP_ENV == "production":
                    headers.append(
                        "Strict-Transport-Security",
                        "max-age=31536000; includeSubDomains",
                    )
            await send(message)

        await self.app(scope, receive, send_wrapper)
