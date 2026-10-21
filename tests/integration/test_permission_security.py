"""Authorization boundaries and usable delegated operations with real HTTP/DB."""

from __future__ import annotations

import asyncio
from typing import Any
from urllib.parse import urlencode

import pytest

from octop.api.middleware.live_authorization import LiveAuthorizationMiddleware
from octop.api.routers.chat.models import ChatTurnBody
from octop.api.routers.chat.turn import prepare_dashboard_turn
from octop.infra.errors import OctopError
from tests.support.auth import TEST_PASSWORD, bearer, create_agent, create_user, login


async def test_delegated_accounts_cannot_mutate_administrator(env: Any) -> None:
    client, server, admin = env
    auth = await create_user(
        client,
        admin,
        username="operator",
        permissions=["users.edit", "users.delete", "users.reset_password", "users.permissions"],
    )
    target = server.user_manager.get("admin")
    assert target is not None
    base = f"/api/users/{target.id}"
    for method, path, body in (
        ("POST", base + "/reset-password", {"new_password": "ChangedPass12"}),
        ("POST", base + "/unlock-login", {}),
        ("PATCH", base, {"disabled": True}),
        ("PATCH", base, {"permissions": []}),
        ("DELETE", base, None),
    ):
        response = await client.request(method, path, headers=auth, json=body)
        assert response.status_code == 403, (method, path, response.text)
    for action in ("disable", "delete", "set_token_quota"):
        response = await client.post(
            "/api/users/batch", headers=auth, json={"user_ids": [target.id], "action": action}
        )
        assert response.status_code == 200, response.text
        assert response.json()["failed"] == 1
    assert await login(client)  # Original administrator credentials still work.


async def test_delegated_password_reset_still_works_for_regular_user(env: Any) -> None:
    client, server, admin = env
    auth = await create_user(
        client, admin, username="helpdesk", permissions=["users.reset_password"]
    )
    await create_user(client, admin, username="target", permissions=[])
    target = server.user_manager.get("target")
    assert target is not None
    response = await client.post(
        f"/api/users/{target.id}/reset-password",
        headers=auth,
        json={"new_password": "ChangedPass12"},
    )
    assert response.status_code == 204, response.text
    assert await login(client, username="target", password="ChangedPass12")


async def test_last_administrator_cannot_be_disabled(env: Any) -> None:
    client, server, admin = env
    user = server.user_manager.get("admin")
    assert user is not None
    response = await client.patch(f"/api/users/{user.id}", headers=admin, json={"disabled": True})
    assert response.status_code == 403
    assert await login(client)


async def test_invites_hide_administrator_codes_from_viewer(env: Any) -> None:
    client, _server, admin = env
    invitation = await client.post("/api/users/invites", headers=admin, json={"role": "admin"})
    assert invitation.status_code == 201
    viewer = await create_user(client, admin, username="viewer", permissions=["users.view"])
    response = await client.get("/api/users/invites", headers=viewer)
    assert response.status_code == 200 and response.json() == []
    creator = await create_user(client, admin, username="creator", permissions=["users.create"])
    response = await client.post("/api/users/invites", headers=creator, json={})
    assert response.status_code == 403


async def test_delegate_can_create_read_revoke_only_own_allowed_invites(env: Any) -> None:
    client, _server, admin = env
    role = await client.post(
        "/api/users/roles",
        headers=admin,
        json={"user_role_name": "Chat reader", "permissions": ["chat.view"]},
    )
    role_id = role.json()["user_role_id"]
    grants = ["users.view", "users.create", "users.permissions", "chat.view"]
    first = await create_user(client, admin, username="first", permissions=grants)
    second = await create_user(client, admin, username="second", permissions=grants)
    invitation = await client.post("/api/users/invites", headers=first, json={"role": role_id})
    assert invitation.status_code == 201, invitation.text
    invite_id = invitation.json()["id"]
    own = await client.get("/api/users/invites", headers=first)
    assert [row["id"] for row in own.json()] == [invite_id]
    assert (await client.get("/api/users/invites", headers=second)).json() == []
    assert (
        await client.post(f"/api/users/invites/{invite_id}/revoke", headers=second)
    ).status_code == 403
    assert (
        await client.post(f"/api/users/invites/{invite_id}/revoke", headers=first)
    ).status_code == 200


async def test_host_writes_require_grant_and_still_work_when_granted(
    env: Any, tmp_path: Any, monkeypatch: Any
) -> None:
    from octop.api.routers import filesystem

    client, _server, admin = env
    empty = await create_user(client, admin, username="empty", permissions=[])
    editor = await create_user(
        client, admin, username="editor", permissions=["storage_backends.edit"]
    )
    body = {"path": str(tmp_path), "base_name": "folder"}
    assert (await client.post("/api/filesystem/mkdir", headers=empty, json=body)).status_code == 403
    assert not (tmp_path / "folder").exists()
    workspace_only = await create_user(
        client, admin, username="workspace_only", permissions=["workspace.edit"]
    )
    assert (
        await client.post("/api/filesystem/mkdir", headers=workspace_only, json=body)
    ).status_code == 403
    assert (
        await client.post("/api/filesystem/mkdir", headers=editor, json=body)
    ).status_code == 200
    rename = {"path": str(tmp_path / "folder"), "new_name": "renamed"}
    assert (
        await client.post("/api/filesystem/rename", headers=empty, json=rename)
    ).status_code == 403
    assert (
        await client.post("/api/filesystem/rename", headers=editor, json=rename)
    ).status_code == 200
    calls = []
    monkeypatch.setattr(
        filesystem, "ensure_docker", lambda: calls.append(True) or {"status": "ready"}
    )
    assert (await client.post("/api/filesystem/ensure-docker", headers=empty)).status_code == 403
    assert calls == []
    maintainer = await create_user(
        client, admin, username="maintainer", permissions=["storage_backends.edit"]
    )
    assert (
        await client.post("/api/filesystem/ensure-docker", headers=maintainer)
    ).status_code == 200
    assert calls == [True]


async def test_expert_use_covers_dashboard_mcp_and_preserves_default_chat(
    env_with_provider: Any,
) -> None:
    client, server, admin = env_with_provider
    auth = await create_user(
        client, admin, username="chatter", permissions=["chat.view", "chat.use"]
    )
    aid = await create_agent(client, admin)
    await server.app_runtime.agent_registry.set_shared(aid, True)
    user = server.user_manager.get("chatter")
    prepared = await prepare_dashboard_turn(
        server, agent_id=aid, user=user, turn=ChatTurnBody(text="test")
    )
    assert prepared.thread_id
    agent = server.app_runtime.agent_registry.get_agent(aid)
    agent.chunks = [{"type": "token", "content": "allowed"}]
    payload = {
        "jsonrpc": "2.0",
        "id": 1,
        "method": "tools/call",
        "params": {
            "name": "call_octop_expert",
            "arguments": {"expert_id": aid, "message": "test"},
        },
    }
    response = await client.post("/api/mcp/agents", headers=auth, json=payload)
    assert response.json()["result"]["structuredContent"]["response"] == "allowed"
    default = await client.post("/api/chat/default-agent", headers=auth)
    assert default.status_code == 200
    prepared = await prepare_dashboard_turn(
        server, agent_id=default.json()["agent_id"], user=user, turn=ChatTurnBody(text="test")
    )
    assert prepared.thread_id
    await server.user_manager.set_permissions("chatter", ["chat.view", "chat.use", "experts.use"])
    agent = server.app_runtime.agent_registry.get_agent(aid)
    agent.chunks = [{"type": "token", "content": "allowed"}]
    response = await client.post("/api/mcp/agents", headers=auth, json=payload)
    assert response.json()["result"]["structuredContent"]["response"] == "allowed"
    disabled = await client.put(
        "/api/admin/public-resources/shared_expert",
        headers=admin,
        json={"ids": [aid], "enabled": False},
    )
    assert disabled.status_code == 204
    response = await client.post("/api/mcp/agents", headers=auth, json=payload)
    assert response.json()["result"]["isError"] is True


async def test_readonly_memory_cannot_restore_but_editor_reaches_coordinator(
    env_with_provider: Any, monkeypatch: Any
) -> None:
    client, server, admin = env_with_provider
    auth = await create_user(
        client, admin, username="owner", permissions=["experts.create", "memory.view"]
    )
    aid = await create_agent(client, auth)
    calls = []

    def fake_restore(*args: Any, **kwargs: Any) -> None:
        calls.append(True)
        raise ValueError("test coordinator reached")

    monkeypatch.setattr(
        server.app_runtime.agent_registry.memory_slim, "start_restore", fake_restore
    )
    body = {"confirmed": True, "backup_id": "test"}
    path = f"/api/agents/{aid}/memory/storage/restore"
    assert (await client.post(path, headers=auth, json=body)).status_code == 403
    assert calls == []
    await server.user_manager.set_permissions("owner", ["memory.view", "memory.edit"])
    assert (await client.post(path, headers=auth, json=body)).status_code == 409
    assert calls == [True]


async def test_document_write_requires_owner_even_for_shared_expert(env_with_provider: Any) -> None:
    client, server, admin = env_with_provider
    editor = await create_user(client, admin, username="editor", permissions=["workspace.edit"])
    aid = await create_agent(client, admin)
    await server.app_runtime.agent_registry.set_shared(aid, True)
    path = f"/api/agents/{aid}/workspace/doc?path=test.docx"
    assert (await client.put(path, headers=editor, json={"content": "# Denied"})).status_code == 403
    assert (await client.put(path, headers=admin, json={"content": "# Allowed"})).status_code == 200


async def test_bridge_offline_creation_does_not_grant_connect(env: Any, monkeypatch: Any) -> None:
    from types import SimpleNamespace

    client, server, admin = env
    auth = await create_user(client, admin, username="creator", permissions=["bridge.create"])
    calls = []

    async def fake_create(**kwargs: Any) -> Any:
        calls.append(kwargs)
        return SimpleNamespace()

    manager = server.app_runtime.bridge_manager
    monkeypatch.setattr(manager, "create_connection", fake_create)
    monkeypatch.setattr(manager, "connection_public", lambda row: {"connection_id": "test"})
    body = {
        "peer_base_url": "https://test.invalid",
        "peer_username": "test",
        "password": "test",
        "display_name": "test",
    }
    assert (
        await client.post("/api/bridge/connections", headers=auth, json=body)
    ).status_code == 403
    assert calls == []
    assert (
        await client.post("/api/bridge/connections", headers=auth, json={**body, "connect": False})
    ).status_code == 201
    assert calls[0]["connect"] is False
    await server.user_manager.set_permissions("creator", ["bridge.create", "bridge.use"])
    assert (
        await client.post("/api/bridge/connections", headers=auth, json=body)
    ).status_code == 201
    assert calls[-1]["connect"] is True


async def test_saved_offline_bridge_cannot_auto_connect_after_restart(
    env: Any, monkeypatch: Any
) -> None:
    from unittest.mock import AsyncMock

    client, server, admin = env
    auth = await create_user(client, admin, username="offline", permissions=["bridge.create"])
    monkeypatch.setattr(
        "octop.infra.bridge.manager.login_peer",
        AsyncMock(
            return_value={
                "access_token": "test-remote-token",
                "expires_in": 3600,
            }
        ),
    )
    response = await client.post(
        "/api/bridge/connections",
        headers=auth,
        json={
            "peer_base_url": "https://test.invalid",
            "peer_username": "test",
            "password": "test",
            "display_name": "offline",
            "connect": False,
        },
    )
    assert response.status_code == 201, response.text
    cid = response.json()["connection_id"]
    row = server.services.bridge_connection_repo.get(cid)
    assert row is not None and row.auto_reconnect is False
    with pytest.raises(OctopError) as denied:
        await server.app_runtime.bridge_manager.connect(cid, owner_user_id=row.owner_user_id)
    assert denied.value.status == 403


async def test_bridge_editor_can_save_notes_but_not_connect(env: Any, monkeypatch: Any) -> None:
    from types import SimpleNamespace
    from unittest.mock import AsyncMock

    client, server, admin = env
    auth = await create_user(client, admin, username="editor", permissions=["bridge.edit"])
    manager = server.app_runtime.bridge_manager
    current = SimpleNamespace(
        peer_base_url="https://test.invalid",
        peer_username="test",
        auto_reconnect=True,
        status="connected",
    )
    monkeypatch.setattr(manager, "get_owned", lambda *args: current)
    update = AsyncMock(return_value=current)
    monkeypatch.setattr(manager, "update_connection_meta", update)
    monkeypatch.setattr(manager, "connection_public", lambda row: {"connection_id": "test"})
    path = "/api/bridge/connections/test"
    response = await client.patch(
        path,
        headers=auth,
        json={
            "peer_base_url": current.peer_base_url,
            "peer_username": current.peer_username,
            "notes": "updated",
        },
    )
    assert response.status_code == 200, response.text
    update.assert_awaited_once()
    assert (
        await client.patch(path, headers=auth, json={"auto_reconnect": True})
    ).status_code == 403
    assert (
        await client.patch(path, headers=auth, json={"peer_username": "changed"})
    ).status_code == 403
    update.assert_awaited_once()


async def test_provider_viewer_never_receives_saved_key(env_with_provider: Any) -> None:
    client, _server, admin = env_with_provider
    auth = await create_user(client, admin, username="viewer", permissions=["providers.view"])
    rows = (await client.get("/api/admin/providers", headers=auth)).json()
    assert rows[0]["api_key"] is None
    assert rows[0]["api_key_set"] is True
    assert (await client.get("/api/admin/providers", headers=admin)).json()[0]["api_key"] == "k"


async def test_voice_viewer_cannot_read_extra_credentials_but_editor_keeps_config(env: Any) -> None:
    import json

    client, _server, admin = env
    created = await client.post(
        "/api/admin/voice/providers",
        headers=admin,
        json={
            "name": "voice",
            "kind": "tencent",
            "capability": "both",
            "extra_json": json.dumps(
                {"secret_id": "test-id", "secret_key": "test-key", "region": "ap-guangzhou"}
            ),
        },
    )
    assert created.status_code == 201
    viewer = await create_user(client, admin, username="voiceviewer", permissions=["voice.view"])
    for path in ("/api/voice/providers", "/api/admin/voice/providers"):
        row = (await client.get(path, headers=viewer)).json()[0]
        assert row["api_key"] is None
        assert row["api_key_set"] is True
        assert row["extra"] == {"region": "ap-guangzhou"}
        # Configuration editor must still receive the existing configuration,
        # otherwise saving a different field could erase credentials.
        row = (await client.get(path, headers=admin)).json()[0]
        assert row["extra"]["secret_key"] == "test-key"


async def test_template_updates_following_accounts_and_relogin_refreshes(env: Any) -> None:
    client, server, admin = env
    role = await client.post(
        "/api/users/roles",
        headers=admin,
        json={
            "user_role_name": "Test role",
            "permissions": ["chat.view", "chat.use"],
        },
    )
    role_id = role.json()["user_role_id"]
    following = await client.post(
        "/api/users",
        headers=admin,
        json={
            "username": "following",
            "password": TEST_PASSWORD,
            "role": role_id,
        },
    )
    assert following.status_code == 201
    await create_user(client, admin, username="custom", role=role_id, permissions=["records.view"])
    old_token = bearer(await login(client, username="following"))
    response = await client.patch(
        f"/api/users/roles/{role_id}", headers=admin, json={"permissions": ["chat.view"]}
    )
    assert response.status_code == 200
    assert (await client.get("/api/auth/me", headers=old_token)).json()["permissions"] == [
        "chat.view"
    ]
    fresh_token = bearer(await login(client, username="following"))
    assert (await client.get("/api/auth/me", headers=fresh_token)).json()["permissions"] == [
        "chat.view"
    ]
    assert server.user_manager.get("custom").permissions == ["records.view"]


async def test_other_worker_permission_and_disable_updates_are_authoritative(env: Any) -> None:
    client, server, admin = env
    auth = await create_user(client, admin, username="cached", permissions=["users.view"])
    user = server.user_manager.get("cached")
    assert user is not None
    server.services.user_repo.set_permissions(user.id, ["chat.view"])
    assert (await client.get("/api/users", headers=auth)).status_code == 403
    assert (await client.get("/api/auth/me", headers=auth)).json()["permissions"] == ["chat.view"]
    fresh = await login(client, username="cached")
    assert (await client.get("/api/auth/me", headers=bearer(fresh))).json()["permissions"] == [
        "chat.view"
    ]
    server.services.user_repo.set_disabled(user.id, True)
    assert (await client.get("/api/auth/me", headers=auth)).status_code == 403


@pytest.mark.parametrize("change", ["permissions", "role", "disabled"])
@pytest.mark.parametrize("auth_mode", ["query", "start_frame"])
async def test_existing_live_connection_closes_after_authorization_change(
    env: Any, monkeypatch: Any, change: str, auth_mode: str
) -> None:
    import octop.api.middleware.live_authorization as live

    client, server, admin = env
    auth = await create_user(client, admin, username="live", permissions=["chat.view"])
    user = server.user_manager.get("live")
    assert user is not None
    incoming: asyncio.Queue[Any] = asyncio.Queue()
    outgoing: asyncio.Queue[Any] = asyncio.Queue()
    await incoming.put({"type": "websocket.connect"})
    frame_received = asyncio.Event()

    async def application(scope: Any, receive: Any, send: Any) -> None:
        await receive()
        await send({"type": "websocket.accept"})
        while True:
            await receive()
            frame_received.set()

    monkeypatch.setattr(live, "_CHECK_INTERVAL", 0.01)
    middleware = LiveAuthorizationMiddleware(application, server)
    token = auth["Authorization"][7:]
    task = asyncio.create_task(
        middleware(
            {
                "type": "websocket",
                "query_string": urlencode({"token": token}).encode()
                if auth_mode == "query"
                else b"",
            },
            incoming.get,
            outgoing.put,
        )
    )
    try:
        assert (await asyncio.wait_for(outgoing.get(), 2))["type"] == "websocket.accept"
        if auth_mode == "start_frame":
            import json

            await incoming.put({"type": "websocket.receive", "text": json.dumps({"token": token})})
            await asyncio.wait_for(frame_received.wait(), 2)
        if change == "permissions":
            server.services.user_repo.set_permissions(user.id, [])
        elif change == "role":
            server.services.user_repo.set_role(user.id, "media_reader")
        else:
            server.services.user_repo.set_disabled(user.id, True)
        close = await asyncio.wait_for(outgoing.get(), 2)
        assert close["type"] == "websocket.close" and close["code"] == 4003
        await asyncio.wait_for(task, 2)
    finally:
        task.cancel()


async def test_business_user_can_cancel_own_chat_without_extra_grants(
    env_with_provider: Any, monkeypatch: Any
) -> None:
    import json
    from types import SimpleNamespace

    from starlette.websockets import WebSocketDisconnect, WebSocketState

    import octop.api.routers.chat.ws as ws
    from octop.infra.gateway.threads import ThreadRegistry

    client, server, admin = env_with_provider
    auth = await create_user(
        client, admin, username="reader", permissions=["experts.create", "records.view"]
    )
    aid = await create_agent(client, auth)
    await server.user_manager.set_permissions("reader", ["records.view"])
    user = server.user_manager.get("reader")
    assert user is not None
    tid = await server.app_runtime.gateway.thread_registry.get_or_create_by_key(
        session_key=ThreadRegistry.dashboard_key(agent_id=aid, user_id=user.id),
        agent_id=aid,
        user_id=user.id,
        channel_type=ThreadRegistry.CHANNEL_DASHBOARD,
    )
    calls = []
    frames = []
    monkeypatch.setattr(ws, "resolve_user_from_token", lambda *args: user)
    monkeypatch.setattr(
        server.app_runtime.agent_registry, "cancel_stream", lambda *args: calls.append(args)
    )

    class Socket:
        app = SimpleNamespace(state=SimpleNamespace(octop_server=server))
        application_state = WebSocketState.CONNECTING
        sent = False

        async def accept(self) -> None:
            self.application_state = WebSocketState.CONNECTED

        async def close(self, **kwargs: Any) -> None:
            self.application_state = WebSocketState.DISCONNECTED

        async def send_text(self, text: str) -> None:
            frames.append(json.loads(text))

        async def receive_text(self) -> str:
            if self.sent:
                raise WebSocketDisconnect()
            self.sent = True
            return json.dumps({"type": "cancel", "thread_id": tid})

    await ws.dashboard_chat_ws(Socket(), aid, token="test")
    assert len(calls) == 1
    assert not any(frame.get("type") == "error" for frame in frames)


async def test_security_specialist_can_edit_rules_without_global_edit(env: Any) -> None:
    client, _server, admin = env
    auth = await create_user(
        client, admin, username="specialist", permissions=["security.view", "security.tool_guard"]
    )
    assert (
        await client.post("/api/admin/security/tool-guard/rules/reset", headers=auth)
    ).status_code == 200
    denied = await client.put(
        "/api/admin/security", headers=auth, json={"filesystem": {"enabled": False}}
    )
    assert denied.status_code == 403


async def test_live_input_burst_does_not_query_database_per_frame(
    env: Any, monkeypatch: Any
) -> None:
    import octop.api.middleware.live_authorization as live

    client, server, admin = env
    auth = await create_user(client, admin, username="burst", permissions=["chat.view"])
    incoming: asyncio.Queue[Any] = asyncio.Queue()
    outgoing = []
    await incoming.put({"type": "websocket.connect"})
    for _ in range(20):
        await incoming.put({"type": "websocket.receive", "text": "{}"})
    original_resolver = live.resolve_user_from_token
    lookups = []

    def resolve(*args: Any) -> Any:
        lookups.append(True)
        return original_resolver(*args)

    async def application(scope: Any, receive: Any, send: Any) -> None:
        await receive()
        await send({"type": "websocket.accept"})
        for _ in range(20):
            await receive()
        await send({"type": "websocket.close", "code": 1000})

    async def send(message: Any) -> None:
        outgoing.append(message)

    monkeypatch.setattr(live, "resolve_user_from_token", resolve)
    monkeypatch.setattr(live, "_CHECK_INTERVAL", 60)
    middleware = LiveAuthorizationMiddleware(application, server)
    await middleware(
        {
            "type": "websocket",
            "query_string": urlencode({"token": auth["Authorization"][7:]}).encode(),
        },
        incoming.get,
        send,
    )
    assert len(lookups) == 1
    assert outgoing[-1]["code"] == 1000


async def test_ready_to_use_roles_keep_basic_media_workflows(env_with_provider: Any) -> None:
    from octop.infra.users.role_presets import ROLE_PRESETS

    client, server, admin = env_with_provider
    for index, (role_id, _name, _description, grants) in enumerate(ROLE_PRESETS):
        username = f"preset{index}"
        created = await client.post(
            "/api/users",
            headers=admin,
            json={
                "username": username,
                "password": TEST_PASSWORD,
                "role": role_id,
            },
        )
        assert created.status_code == 201
        auth = bearer(await login(client, username=username))
        assert set((await client.get("/api/auth/me", headers=auth)).json()["permissions"]) == grants
        default = await client.post("/api/chat/default-agent", headers=auth)
        assert default.status_code == 200
        prepared = await prepare_dashboard_turn(
            server,
            agent_id=default.json()["agent_id"],
            user=server.user_manager.get(username),
            turn=ChatTurnBody(text="test"),
        )
        assert prepared.thread_id
        for path in (
            "/api/providers/resolved",
            "/api/experts",
            "/api/skill-packages",
            "/api/knowledge-bases",
            "/api/usage/summary",
        ):
            response = await client.get(path, headers=auth)
            assert response.status_code == 200, (role_id, path, response.text)
