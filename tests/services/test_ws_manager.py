"""ConnectionManager tests: room isolation and dead-socket resilience."""


class FakeSocket:
    def __init__(self) -> None:
        self.sent: list[str] = []
        self.fail = False

    async def accept(self) -> None:
        pass

    async def send_text(self, text: str) -> None:
        if self.fail:
            raise RuntimeError("socket closed")
        self.sent.append(text)


async def test_broadcast_reaches_only_matching_room():
    from app.services.ws_manager import ConnectionManager

    mgr = ConnectionManager()
    a, b, c = FakeSocket(), FakeSocket(), FakeSocket()
    await mgr.connect("case-1", a)
    await mgr.connect("case-1", b)
    await mgr.connect("case-2", c)

    await mgr.broadcast("case-1", "upload:status", {"status": "processing"})

    assert len(a.sent) == 1
    assert len(b.sent) == 1
    assert len(c.sent) == 0, "case-2 socket must not receive case-1 events"
    assert "upload:status" in a.sent[0]


async def test_dead_socket_dropped_without_killing_broadcast():
    from app.services.ws_manager import ConnectionManager

    mgr = ConnectionManager()
    alive, dead = FakeSocket(), FakeSocket()
    dead.fail = True
    await mgr.connect("case-1", alive)
    await mgr.connect("case-1", dead)

    await mgr.broadcast("case-1", "upload:completed", {"frame_count": 3})

    assert len(alive.sent) == 1, "live socket must still receive the event"
    assert dead not in mgr._rooms["case-1"], "dead socket must be removed"