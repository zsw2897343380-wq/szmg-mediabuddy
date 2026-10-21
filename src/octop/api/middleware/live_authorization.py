"""Stop authenticated WebSockets when the persisted account authorization changes."""

from __future__ import annotations

import asyncio
import contextlib
import json
from typing import TYPE_CHECKING, Any
from urllib.parse import parse_qs

from starlette.types import ASGIApp, Message, Receive, Scope, Send

from octop.api.deps import resolve_user_from_token
from octop.infra.errors import OctopError

if TYPE_CHECKING:
    from octop.infra.server import OctopServer
    from octop.infra.users.identity import User

_CHECK_INTERVAL = 1.0


class _AuthorizationChanged(Exception):
    pass


class LiveAuthorizationMiddleware:
    def __init__(self, app: ASGIApp, server: OctopServer) -> None:
        self.app = app
        self.server = server

    async def __call__(self, scope: Scope, receive: Receive, send: Send) -> None:
        if scope["type"] != "websocket":
            await self.app(scope, receive, send)
            return
        query = parse_qs(scope.get("query_string", b"").decode())
        token = query.get("token", [None])[0]
        username: str | None = None
        original: tuple[Any, ...] | None = None
        closed = False

        def identity(refresh: bool = True) -> tuple[Any, ...] | None:
            nonlocal username
            if not token:
                return None
            manager = self.server.user_manager
            if manager is None:
                return None
            user: User | None
            if refresh:
                try:
                    user = resolve_user_from_token(self.server, token)
                except OctopError:
                    return None
                username = user.username
            else:
                # Input frames can arrive at mouse/keyboard frequency. Local
                # changes already mutate the cache; the watcher refreshes DB
                # changes from other workers without a SQL query per frame.
                user = manager.get(username) if username else None
                if user is None:
                    return None
            return user.id, user.role, tuple(sorted(user.permissions))

        original = identity()

        async def close() -> None:
            nonlocal closed
            if not closed:
                closed = True
                await send(
                    {"type": "websocket.close", "code": 4003, "reason": "authorization changed"}
                )

        async def guarded_receive() -> Message:
            nonlocal token, original
            message = await receive()
            if message["type"] == "websocket.receive":
                if not token and message.get("text"):
                    with contextlib.suppress(ValueError):
                        frame = json.loads(message["text"])
                        if isinstance(frame, dict) and isinstance(frame.get("token"), str):
                            token = frame["token"]
                            original = identity()
                if original is not None and identity(refresh=False) != original:
                    await close()
                    raise _AuthorizationChanged
            return message

        async def guarded_send(message: Message) -> None:
            nonlocal closed
            if closed:
                return
            if message["type"] == "websocket.close":
                closed = True
            await send(message)

        async def watch() -> None:
            while True:
                await asyncio.sleep(_CHECK_INTERVAL)
                if original is not None:
                    current = await asyncio.get_running_loop().run_in_executor(None, identity)
                    if current != original:
                        return

        async def run() -> None:
            await self.app(scope, guarded_receive, guarded_send)

        application = asyncio.create_task(run())
        watcher = asyncio.create_task(watch())
        try:
            done, _ = await asyncio.wait(
                (application, watcher), return_when=asyncio.FIRST_COMPLETED
            )
            if watcher in done:
                # Propagate DB failures rather than silently treating them as revocation.
                await watcher
                await close()
                application.cancel()
                with contextlib.suppress(asyncio.CancelledError):
                    await application
            else:
                try:
                    await application
                except _AuthorizationChanged:
                    await close()
        finally:
            watcher.cancel()
            application.cancel()
            with contextlib.suppress(asyncio.CancelledError):
                await watcher
            with contextlib.suppress(asyncio.CancelledError, _AuthorizationChanged):
                await application
