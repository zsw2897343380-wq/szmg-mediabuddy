"""Unified skills work without selecting or changing an expert."""

from __future__ import annotations

from typing import Any

from tests.support.auth import create_user


async def test_install_and_pause_are_private_to_the_authenticated_user(env: Any) -> None:
    client, _server, admin = env
    created = await client.post("/api/skill-packages", headers=admin, json={"name": "Office"})
    package_id = created.json()["id"]
    alice = await create_user(client, admin, username="alice", permissions=["skill_packages"])
    bob = await create_user(client, admin, username="bob", permissions=["skill_packages"])
    installed = await client.put(
        f"/api/skill-packages/library/{package_id}", headers=alice, json={"installed": True}
    )
    assert installed.status_code == 200, installed.text
    assert installed.json() == {"installed_package_ids": [package_id], "disabled_package_ids": []}
    assert (await client.get("/api/skill-packages/library", headers=bob)).json() == {
        "installed_package_ids": [],
        "disabled_package_ids": [],
    }
    paused = await client.put(
        f"/api/skill-packages/library/{package_id}",
        headers=alice,
        json={"installed": True, "enabled": False},
    )
    assert paused.status_code == 200, paused.text
    assert paused.json()["disabled_package_ids"] == [package_id]
    assert (await client.get("/api/skill-packages/library", headers=admin)).json()[
        "installed_package_ids"
    ] == []
    removed = await client.put(
        f"/api/skill-packages/library/{package_id}", headers=alice, json={"installed": False}
    )
    assert removed.status_code == 200, removed.text
    assert removed.json() == {"installed_package_ids": [], "disabled_package_ids": []}


async def test_library_requires_package_permission_and_rejects_unknown_packages(env: Any) -> None:
    client, _server, admin = env
    restricted = await create_user(client, admin, username="restricted", permissions=["skills"])
    response = await client.get("/api/skill-packages/library", headers=restricted)
    assert response.status_code == 403
    response = await client.put(
        "/api/skill-packages/library/absent", headers=restricted, json={"installed": True}
    )
    assert response.status_code == 403
    response = await client.put(
        "/api/skill-packages/library/absent", headers=admin, json={"installed": True}
    )
    assert response.status_code == 404


async def test_personal_install_is_available_in_chat_and_pause_removes_it(
    env_with_agent: Any,
) -> None:
    client, server, auth, agent_id = env_with_agent
    created = await client.post("/api/skill-packages", headers=auth, json={"name": "Office"})
    package_id = created.json()["id"]
    added = await client.post(
        f"/api/skill-packages/{package_id}/skills",
        headers=auth,
        json={
            "name": "library-helper",
            "content": "---\nname: library-helper\ndescription: Test\n---\nUse this skill.",
        },
    )
    assert added.status_code == 200, added.text
    before = server.app_runtime.agent_registry.get_config(agent_id).get("skill_package_ids", [])
    installed = await client.put(
        f"/api/skill-packages/library/{package_id}", headers=auth, json={"installed": True}
    )
    assert installed.status_code == 200, installed.text
    skills = await client.get(f"/api/agents/{agent_id}/skills", headers=auth)
    assert skills.status_code == 200, skills.text
    skill = next(row for row in skills.json() if row["slug"] == "library-helper")
    assert skill["enabled"] is True
    assert skill["kind"] == "package"
    assert (
        server.app_runtime.agent_registry.get_config(agent_id).get("skill_package_ids", [])
        == before
    )
    # Existing workspace editing must not mutate a shared package-only skill.
    overwrite = await client.put(
        f"/api/agents/{agent_id}/skills/library-helper", headers=auth, json={"content": "Overwrite"}
    )
    assert overwrite.status_code == 403, overwrite.text
    paused = await client.put(
        f"/api/skill-packages/library/{package_id}",
        headers=auth,
        json={"installed": True, "enabled": False},
    )
    assert paused.status_code == 200, paused.text
    skills = await client.get(f"/api/agents/{agent_id}/skills", headers=auth)
    assert all(row["slug"] != "library-helper" for row in skills.json())
