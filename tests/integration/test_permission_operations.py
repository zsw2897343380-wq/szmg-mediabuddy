"""Operation grants apply to HTTP calls even when navigation is bypassed."""

from typing import Any

import pytest

from tests.support.auth import create_user


@pytest.mark.parametrize(
    ("permission", "method", "path", "body"),
    [
        ("experts.view", "POST", "/api/experts/published/missing/install", {}),
        (
            "tasks.view",
            "POST",
            "/api/agents/missing/cron",
            {"prompt": "x", "trigger": "interval:60"},
        ),
        ("connectors.view", "POST", "/api/connector-instances", {"kind": "missing", "name": "x"}),
        ("bridge.view", "DELETE", "/api/bridge/connections/missing", None),
        ("acp.view", "PUT", "/api/acp/custom", {"command": "echo"}),
        ("backup.view", "POST", "/api/admin/backup/create", {}),
        ("workspace.view", "DELETE", "/api/agents/missing/workspace/file?path=x", None),
        ("records.view", "DELETE", "/api/agents/missing/threads/missing", None),
    ],
)
async def test_viewer_cannot_mutate(
    env: Any, permission: str, method: str, path: str, body: Any
) -> None:
    client, _server, admin = env
    viewer = await create_user(client, admin, username="viewer", permissions=[permission])
    response = await client.request(method, path, headers=viewer, json=body)
    assert response.status_code == 403, response.text


async def test_usage_scope_is_delegated_without_user_management(env: Any) -> None:
    client, _server, admin = env
    analyst = await create_user(
        client, admin, username="analyst", permissions=["token_usage.view", "token_usage.all"]
    )
    assert (await client.get("/api/admin/usage/summary", headers=analyst)).status_code == 200
    assert (await client.get("/api/usage/users", headers=analyst)).status_code == 200
    assert (await client.get("/api/users", headers=analyst)).status_code == 403
    assert (await client.get("/api/admin/usage/export.xlsx", headers=analyst)).status_code == 403


async def test_account_editor_cannot_change_authorization(env: Any) -> None:
    client, server, admin = env
    editor = await create_user(client, admin, username="editor", permissions=["users.edit"])
    await create_user(client, admin, username="target", permissions=[])
    target = server.user_manager.get("target")
    assert target is not None
    response = await client.patch(
        f"/api/users/{target.id}", headers=editor, json={"permissions": ["users"]}
    )
    assert response.status_code == 403
    assert server.user_manager.get_by_id(target.id).permissions == []
    assert (
        await client.patch(
            f"/api/users/{target.id}", headers=editor, json={"display_name": "Edited"}
        )
    ).status_code == 200


async def test_public_resource_operations_are_category_specific(env: Any) -> None:
    client, _server, admin = env
    publisher = await create_user(
        client,
        admin,
        username="publisher",
        permissions=["public_resources.view", "public_resources.experts"],
    )
    assert (await client.get("/api/admin/public-resources", headers=publisher)).status_code == 200
    response = await client.put(
        "/api/admin/public-resources/builtin_skill",
        headers=publisher,
        json={"ids": ["missing"], "enabled": False},
    )
    assert response.status_code == 403


async def test_permission_catalog_contains_all_menus_without_legacy_all_access(env: Any) -> None:
    client, _server, admin = env
    response = await client.get("/api/users/permissions", headers=admin)
    assert response.status_code == 200
    keys = {item["key"] for item in response.json()}
    assert {
        "assistants.view",
        "chat.use",
        "records.view",
        "bridge.view",
        "acp.view",
        "public_resources.view",
        "workspace.view",
    } <= keys
    assert "users" not in keys


async def test_chat_does_not_default_to_ungranted_capabilities(env_with_provider: Any) -> None:
    from octop.api.routers.chat.models import ChatTurnBody
    from octop.api.routers.chat.turn import build_dashboard_inbound, prepare_dashboard_turn

    client, server, admin = env_with_provider
    auth = await create_user(
        client, admin, username="chat_only", permissions=["chat.view", "chat.use"]
    )
    response = await client.post("/api/chat/default-agent", headers=auth)
    assert response.status_code == 200, response.text
    user = server.user_manager.get("chat_only")
    turn = ChatTurnBody(text="hello")
    agent_id = response.json()["agent_id"]
    prepared = await prepare_dashboard_turn(server, agent_id=agent_id, user=user, turn=turn)
    assert prepared.skills == []
    assert prepared.mcp_servers == []
    inbound = build_dashboard_inbound(
        agent_id=agent_id, user_id=user.id, prepared=prepared, turn=turn, ws_connection_id="test"
    )
    assert inbound.metadata["knowledge_base_ids"] == []


async def test_role_options_do_not_grant_role_management(env: Any) -> None:
    client, _server, admin = env
    viewer = await create_user(client, admin, username="account_viewer", permissions=["users.view"])
    assert (await client.get("/api/users/roles", headers=viewer)).status_code == 200
    response = await client.post(
        "/api/users/roles", headers=viewer, json={"user_role_name": "forbidden", "permissions": []}
    )
    assert response.status_code == 403
