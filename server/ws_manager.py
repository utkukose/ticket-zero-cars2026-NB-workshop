"""Broadcast hub for real-time feed, leaderboard and phase updates."""

import asyncio


class Hub:
    def __init__(self):
        self.connections = set()
        self.phase = "ATTACK"
        self.frozen = False
        self._lock = asyncio.Lock()

    async def connect(self, ws):
        await ws.accept()
        async with self._lock:
            self.connections.add(ws)

    def disconnect(self, ws):
        self.connections.discard(ws)

    async def broadcast(self, message):
        dead = []
        for ws in list(self.connections):
            try:
                await ws.send_json(message)
            except Exception:
                dead.append(ws)
        for ws in dead:
            self.disconnect(ws)

    async def set_phase(self, phase):
        self.phase = phase
        await self.broadcast({"type": "phase", "phase": phase})

    async def set_frozen(self, frozen):
        self.frozen = bool(frozen)
        await self.broadcast({"type": "frozen", "frozen": self.frozen})


hub = Hub()
