"""
In-memory WebSocket connection manager for real-time case tracking.
Connections are keyed by case_id so broadcast events only reach
officers following that case. Non-persistent by design: a reconnect
replays the current state via HTTP anyway.
"""

import asyncio
import json
from typing import Any

from fastapi import WebSocket


class ConnectionManager:
    def __init__(self) -> None:
        self._rooms: dict[str, set[WebSocket]] = {}

    async def connect(self, case_id: str, websocket: WebSocket) -> None:
        await websocket.accept()
        self._rooms.setdefault(case_id, set()).add(websocket)

    def disconnect(self, case_id: str, websocket: WebSocket) -> None:
        room = self._rooms.get(case_id)
        if not room:
            return
        room.discard(websocket)
        if not room:
            self._rooms.pop(case_id, None)

    async def broadcast(self, case_id: str, event_type: str, payload: Any) -> None:
        """
        Push an event to every connection following ``case_id``.

        Silently drops dead sockets instead of tearing the whole broadcast down;
        the recipient's own error handler still runs.
        """
        room = self._rooms.get(case_id)
        if not room:
            return

        message = json.dumps(
            {"type": event_type, "payload": payload}, default=str
        )
        for ws in list(room):
            try:
                await ws.send_text(message)
            except Exception:
                room.discard(ws)

    async def broadcast_many(
        self, case_ids: set[str], event_type: str, payload: Any
    ) -> None:
        for case_id in case_ids:
            await self.broadcast(case_id, event_type, payload)


# Singleton shared across API routers and the ingestion queue.
connection_manager = ConnectionManager()