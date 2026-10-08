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
        self._lock = asyncio.Lock()

    async def connect(self, case_id: str, websocket: WebSocket) -> None:
        await websocket.accept()
        async with self._lock:
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
        async def _send(ws: WebSocket) -> None:
            try:
                await asyncio.wait_for(ws.send_text(message), timeout=5)
            except Exception:
                async with self._lock:
                    room = self._rooms.get(case_id)
                    if room is not None:
                        room.discard(ws)
        # Snapshot under lock, send concurrently so one wedged client cannot
        # head-of-line-block the whole room.
        async with self._lock:
            targets = list(room)
        await asyncio.gather(*(_send(ws) for ws in targets), return_exceptions=True)

    async def broadcast_many(
        self, case_ids: set[str], event_type: str, payload: Any
    ) -> None:
        for case_id in case_ids:
            await self.broadcast(case_id, event_type, payload)


# Singleton shared across API routers and the ingestion queue.
connection_manager = ConnectionManager()