"""General chat resolves a private runtime without a selected expert."""

from __future__ import annotations

import asyncio
from typing import Any

import httpx

from tests.support.auth import create_agent, create_user


async def test_general_chat_requires_auth(env_with_provider: Any) -> None:
    client, _server, _auth = env_with_provider
    response = await client.post("/api/chat/default-agent")
    assert response.status_code == 401


async def test_general_chat_is_private_and_idempotent(env_with_provider: Any) -> None:
    client, server, admin = env_with_provider
    alice = await create_user(client, admin, username="alice-general")
    bob = await create_user(client, admin, username="bob-general")
    responses = await asyncio.gather(
        *[client.post("/api/chat/default-agent", headers=alice) for _ in range(3)]
    )
    for response in responses:
        response.raise_for_status()
    ids = {response.json()["agent_id"] for response in responses}
    assert len(ids) == 1
    alice_agent_id = ids.pop()
    bob_response = await client.post("/api/chat/default-agent", headers=bob)
    bob_response.raise_for_status()
    assert bob_response.json()["agent_id"] != alice_agent_id
    registry = server.app_runtime.agent_registry
    row = registry.get_row(alice_agent_id)
    assert row is not None and not row.is_shared
    assert registry.get_config(alice_agent_id)["general_chat"] is True
    registry.get_agent(alice_agent_id)
    denied = await client.get(f"/api/agents/{alice_agent_id}", headers=bob)
    assert denied.status_code == 403


async def test_general_chat_with_specialist_and_stopped_runtime(env_with_provider: Any) -> None:
    client, server, admin = env_with_provider
    alice = await create_user(client, admin, username="alice-specialist")
    specialist_id = await create_agent(client, alice, name="My specialist")
    response = await client.post("/api/chat/default-agent", headers=alice)
    response.raise_for_status()
    agent_id = response.json()["agent_id"]
    assert agent_id != specialist_id
    registry = server.app_runtime.agent_registry
    await registry.stop(agent_id)
    restarted = await client.post("/api/chat/default-agent", headers=alice)
    restarted.raise_for_status()
    assert restarted.json()["agent_id"] == agent_id
    registry.get_agent(agent_id)


async def test_general_chat_reuses_bootstrap_main(env_with_provider: Any) -> None:
    client, server, admin = env_with_provider
    registry = server.app_runtime.agent_registry
    before = registry.get_row("main")
    assert before is not None
    response: httpx.Response = await client.post("/api/chat/default-agent", headers=admin)
    response.raise_for_status()
    assert response.json() == {"agent_id": "main"}
    after = registry.get_row("main")
    assert after.name == before.name
    assert after.system_prompt == before.system_prompt


async def test_general_chat_does_not_reuse_shared_main(env_with_provider: Any) -> None:
    client, server, admin = env_with_provider
    registry = server.app_runtime.agent_registry
    await registry.set_shared("main", True)
    response = await client.post("/api/chat/default-agent", headers=admin)
    response.raise_for_status()
    agent_id = response.json()["agent_id"]
    assert agent_id != "main"
    row = registry.get_row(agent_id)
    assert row is not None and row.is_shared == 0
    assert registry.get_row("main").is_shared == 1
