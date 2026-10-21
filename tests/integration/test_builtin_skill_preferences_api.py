"""Preset toggles are private, persistent, and affect actual runtime filters."""

from typing import Any

import pytest

from tests.support.auth import create_user


async def test_builtin_preferences_without_an_expert_are_private_and_validated(env: Any) -> None:
    client, _server, admin = env
    alice = await create_user(client, admin, username="presets-alice", permissions=["skills"])
    bob = await create_user(client, admin, username="presets-bob", permissions=["skills"])
    response = await client.get("/api/skills/builtin", headers={**alice, "Accept-Language": "zh"})
    assert response.status_code == 200, response.text
    rows = response.json()
    assert {"skill-manager", "apple-notes"} <= {row["slug"] for row in rows}
    assert "install-skill" not in {row["slug"] for row in rows}
    assert all(row["enabled"] for row in rows)
    result = await client.put(
        "/api/skills/builtin", headers=alice, json={"slugs": ["apple-notes"], "enabled": False}
    )
    assert result.status_code == 204, result.text
    for auth, enabled in ((alice, False), (bob, True)):
        rows = (await client.get("/api/skills/builtin", headers=auth)).json()
        assert next(row for row in rows if row["slug"] == "apple-notes")["enabled"] is enabled
    rejected = await client.put(
        "/api/skills/builtin",
        headers=alice,
        json={"slugs": ["skill-manager", "unknown-preset"], "enabled": False},
    )
    assert rejected.status_code == 404
    rows = (await client.get("/api/skills/builtin", headers=alice)).json()
    assert next(row for row in rows if row["slug"] == "skill-manager")["enabled"] is True


@pytest.mark.parametrize("method", ["GET", "PUT"])
async def test_builtin_preferences_require_auth_but_no_business_grant(
    env: Any, method: str
) -> None:
    client, _server, admin = env
    kwargs = {"json": {"slugs": ["apple-notes"], "enabled": False}} if method == "PUT" else {}
    assert (await client.request(method, "/api/skills/builtin", **kwargs)).status_code == 401
    restricted = await create_user(
        client, admin, username="presets-denied", permissions=["skill_packages"]
    )
    response = await client.request(method, "/api/skills/builtin", headers=restricted, **kwargs)
    assert response.status_code == (204 if method == "PUT" else 200)


async def test_bulk_toggle_hot_updates_and_survives_restart_without_overwriting_expert_config(
    env_with_agent: Any,
) -> None:
    client, server, auth, agent_id = env_with_agent
    registry = server.app_runtime.agent_registry
    await registry.persist_skills_disabled(agent_id, {"skill-manager"})
    before = registry.get_config(agent_id).copy()
    rows = (await client.get("/api/skills/builtin", headers=auth)).json()
    slugs = [row["slug"] for row in rows]
    disabled = await client.put(
        "/api/skills/builtin", headers=auth, json={"slugs": slugs, "enabled": False}
    )
    assert disabled.status_code == 204, disabled.text
    assert set(slugs) <= registry.get_agent(agent_id).config.skills_disabled
    assert registry.get_config(agent_id) == before
    summaries = (await client.get(f"/api/agents/{agent_id}/skills", headers=auth)).json()
    assert all(not row["enabled"] for row in summaries if row.get("kind") == "builtin")
    await registry.stop(agent_id)
    await registry.start(agent_id)
    assert set(slugs) <= registry._harness_manager.get_agent(agent_id).config.skills_disabled
    restored = await client.put(
        "/api/skills/builtin", headers=auth, json={"slugs": slugs, "enabled": True}
    )
    assert restored.status_code == 204, restored.text
    assert "apple-notes" not in registry.get_agent(agent_id).config.skills_disabled
    assert "skill-manager" in registry.get_agent(agent_id).config.skills_disabled
    assert registry.get_config(agent_id) == before
