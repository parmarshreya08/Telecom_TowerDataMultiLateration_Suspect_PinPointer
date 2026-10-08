"""
WebSocket endpoint for real-time case tracking.

Auth model: the JWT is passed as ``?token=`` in the connection URL (browsers
cannot set WebSocket headers). The token is validated *before* ``accept()`` —
unauthorised connections are rejected with a proper close code instead of a
200 handshake that silently drops messages.

Events pushed from the ingestion queue:
  - upload:status   payload: {upload_id, case_id, status}
  - upload:completed payload: {upload_id, case_id, frame_count}
"""

from uuid import UUID

from fastapi import APIRouter, WebSocket, WebSocketDisconnect

from app.core.logging import logger
from app.core.security import decode_token
from app.database.models import AuthSessionModel
from app.database.session import async_session_maker
from app.services.ws_manager import connection_manager
from app.utils.datetime_utils import now_ist
from sqlalchemy import select

router = APIRouter()


async def _authorize_websocket(token: str | None, case_id: str | None = None) -> bool:
    """
    Validate the bearer JWT and a non-revoked, non-expired session row.
    Returns True when the connection may be accepted.
    Supports both standard session tokens and short-lived live tracking tokens.
    Live-tracking tokens are bound to their token case_id: a token for case A
    must not open the room for case B.
    """
    if not token:
        return False
    payload = decode_token(token)
    if not payload:
        return False

    # Check if it's a live tracking token (bound to its own case room).
    if payload.get("type") == "live_tracking" and payload.get("case_id"):
        if case_id is not None and payload.get("case_id") != case_id:
            return False
        return True
        
    if not payload.get("sub") or not payload.get("jti"):
        return False
    jti = payload.get("jti")
    try:
        officer_id = UUID(str(payload.get("sub")))
    except (ValueError, TypeError):
        return False

    async with async_session_maker() as db:
        stmt = select(AuthSessionModel).where(
            AuthSessionModel.jti == jti,
            AuthSessionModel.officer_id == officer_id,
            AuthSessionModel.revoked_at.is_(None),
            AuthSessionModel.expires_at > now_ist(),
        )
        result = await db.execute(stmt)
        return result.scalar_one_or_none() is not None


@router.websocket("/api/ws/tracking/{case_id}")
async def tracking_ws(websocket: WebSocket, case_id: str) -> None:
    token = websocket.query_params.get("token")

    if not await _authorize_websocket(token, case_id):
        await websocket.close(code=4401)  # 4401 = unauthorised, mirrors WS 401
        return

    # Case access (assignment / creator) is re-checked by the regular HTTP
    # endpoints; here we accept the authenticated officer and gate broadcasts
    # to the case_id room they explicitly subscribed to.
    await connection_manager.connect(case_id, websocket)
    logger.info("ws_tracking_connected", case_id=case_id)
    try:
        while True:
            # Consume client pings / messages; keep the socket alive.
            await websocket.receive_text()
    except WebSocketDisconnect:
        connection_manager.disconnect(case_id, websocket)
        logger.info("ws_tracking_disconnected", case_id=case_id)
    except Exception:
        connection_manager.disconnect(case_id, websocket)