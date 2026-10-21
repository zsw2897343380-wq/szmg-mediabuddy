"""Unified skills work without selecting or changing an expert."""

from __future__ import annotations

from typing import Any

import pytest

from tests.support.auth import create_user


async def test_install_and_pause_are_private_to_the_authenticated_user(env: Any) -> None:
    client, _server, admin = env
    created = await client.post("/api/skill-packages", headers=admin, json={"name": "Office"})
    package_id = created.json()["id"]
    alice = await create_user(
        client,
        admin,
        username="alice",
        permissions=[
            "skill_packages.view",
            "skill_packages.use",
            "skill_packages.create",
            "skill_packages.edit",
            "skill_packages.delete",
            "skill_packages.export",
            "skill_packages.publish",
        ],
    )
    bob = await create_user(
        client,
        admin,
        username="bob",
        permissions=[
            "skill_packages.view",
            "skill_packages.use",
            "skill_packages.create",
            "skill_packages.edit",
            "skill_packages.delete",
            "skill_packages.export",
            "skill_packages.publish",
        ],
    )
    installed = await client.put(
        f"/api/skill-packages/library/{package_id}", headers=alice, json={"installed": True}
    )
    assert installed.status_code == 200, installed.text
    assert installed.json() == {
        "installed_package_ids": [package_id],
        "disabled_package_ids": [],
        "skill_states": {},
    }
    assert (await client.get("/api/skill-packages/library", headers=bob)).json() == {
        "installed_package_ids": [],
        "disabled_package_ids": [],
        "skill_states": {},
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
    assert removed.json() == {
        "installed_package_ids": [],
        "disabled_package_ids": [],
        "skill_states": {},
    }


async def test_library_requires_package_permission_and_rejects_unknown_packages(env: Any) -> None:
    client, _server, admin = env
    restricted = await create_user(
        client,
        admin,
        username="restricted",
        permissions=[
            "skills.view",
            "skills.use",
            "skills.create",
            "skills.edit",
            "skills.delete",
            "skills.export",
        ],
    )
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


@pytest.mark.parametrize("host_root", [False, True])
async def test_single_skill_preferences_are_private_and_control_chat_without_siblings(
    env_with_agent: Any,
    host_root: bool,
) -> None:
    from octop.api.common.validators import validate_chat_skills

    client, server, auth, agent_id = env_with_agent
    registry = server.app_runtime.agent_registry
    if host_root:
        cfg = registry.get_config(agent_id)
        cfg["backend"] = {
            "type": "local_shell",
            "root_dir": registry.resolve_workspace_dir(agent_id).anchor,
            "virtual_mode": True,
        }
        registry.persist_harness_config(agent_id, cfg)
    package_id = (
        await client.post("/api/skill-packages", headers=auth, json={"name": "Pair"})
    ).json()["id"]
    for slug in ("reader", "writer"):
        result = await client.post(
            f"/api/skill-packages/{package_id}/skills",
            headers=auth,
            json={
                "name": slug,
                "content": f"---\nname: {slug}\ndescription: {slug}\n---\nInstructions",
            },
        )
        assert result.status_code == 200, result.text
    bob = await create_user(
        client,
        auth,
        username="skill-bob",
        permissions=[
            "skill_packages.view",
            "skill_packages.use",
            "skill_packages.create",
            "skill_packages.edit",
            "skill_packages.delete",
            "skill_packages.export",
            "skill_packages.publish",
        ],
    )
    path = f"/api/skill-packages/library/{package_id}/skills/reader"
    response = await client.put(path, headers=auth, json={"installed": True})
    assert response.status_code == 200, response.text
    assert response.json()["installed_package_ids"] == []
    assert response.json()["skill_states"][package_id] == {
        "reader": {"installed": True, "enabled": True}
    }
    assert (await client.get("/api/skill-packages/library", headers=bob)).json()[
        "skill_states"
    ] == {}
    listed = (await client.get(f"/api/agents/{agent_id}/skills", headers=auth)).json()
    assert any(skill["slug"] == "reader" and skill["kind"] == "package" for skill in listed)
    assert all(skill["slug"] != "writer" for skill in listed)
    roots = registry.get_agent(agent_id).config.skills_dir
    assert roots
    assert await validate_chat_skills(server, agent_id=agent_id, user=None, names=["reader"]) == [
        "reader"
    ]
    assert all(
        skill["slug"] == "reader"
        for skills in registry._selected_package_skills(agent_id).values()
        for skill in skills
    )
    overwrite = await client.put(
        f"/api/agents/{agent_id}/skills/reader", headers=auth, json={"content": "Unsafe"}
    )
    assert overwrite.status_code == 403
    for body in ({"installed": True, "enabled": False}, {"installed": False}):
        response = await client.put(path, headers=auth, json=body)
        assert response.status_code == 200, response.text
        listed = (await client.get(f"/api/agents/{agent_id}/skills", headers=auth)).json()
        assert all(skill["slug"] not in {"reader", "writer"} for skill in listed)
        assert registry.get_agent(agent_id).config.skills_dir is None


async def test_pausing_package_skill_does_not_disable_same_named_workspace_skill(
    env_with_agent: Any,
) -> None:
    client, server, auth, agent_id = env_with_agent
    manifest = "---\nname: reader\ndescription: Workspace reader\n---\nLocal instructions"
    local = await client.post(
        f"/api/agents/{agent_id}/skills", headers=auth, json={"name": "reader", "content": manifest}
    )
    assert local.status_code == 201, local.text
    package_id = (
        await client.post("/api/skill-packages", headers=auth, json={"name": "Pair"})
    ).json()["id"]
    await client.post(
        f"/api/skill-packages/{package_id}/skills",
        headers=auth,
        json={"name": "reader", "content": manifest},
    )
    path = f"/api/skill-packages/library/{package_id}/skills/reader"
    await client.put(path, headers=auth, json={"installed": True})
    response = await client.put(path, headers=auth, json={"installed": True, "enabled": False})
    assert response.status_code == 200, response.text
    listed = (await client.get(f"/api/agents/{agent_id}/skills", headers=auth)).json()
    skill = next(skill for skill in listed if skill["slug"] == "reader")
    assert skill["kind"] == "workspace"
    assert skill["enabled"] is True
    assert not server.app_runtime.agent_registry.get_agent(agent_id).config.skills_disabled


async def test_individual_preference_permission_and_missing_skill(env: Any) -> None:
    client, _server, admin = env
    package_id = (
        await client.post("/api/skill-packages", headers=admin, json={"name": "Empty"})
    ).json()["id"]
    restricted = await create_user(
        client,
        admin,
        username="limited-single",
        permissions=[
            "skills.view",
            "skills.use",
            "skills.create",
            "skills.edit",
            "skills.delete",
            "skills.export",
        ],
    )
    path = f"/api/skill-packages/library/{package_id}/skills/absent"
    assert (await client.put(path, headers=restricted, json={"installed": True})).status_code == 403
    assert (await client.put(path, headers=admin, json={"installed": True})).status_code == 404


async def test_single_skill_export_preserves_download_permissions_and_excludes_siblings(
    env: Any,
) -> None:
    import io
    import zipfile

    client, _server, admin = env
    package_id = (
        await client.post("/api/skill-packages", headers=admin, json={"name": "Pair"})
    ).json()["id"]
    for slug in ("reader", "writer"):
        await client.post(
            f"/api/skill-packages/{package_id}/skills",
            headers=admin,
            json={"name": slug, "content": f"---\nname: {slug}\n---\nInstructions"},
        )
    bob = await create_user(
        client,
        admin,
        username="export-reader",
        permissions=[
            "skill_packages.view",
            "skill_packages.use",
            "skill_packages.create",
            "skill_packages.edit",
            "skill_packages.delete",
            "skill_packages.export",
            "skill_packages.publish",
        ],
    )
    path = f"/api/skill-packages/{package_id}/export?skill_slug=reader"
    response = await client.get(path, headers=bob)
    assert response.status_code == 200, response.text
    assert "reader.zip" in response.headers["content-disposition"]
    with zipfile.ZipFile(io.BytesIO(response.content)) as archive:
        assert archive.namelist() == ["reader/SKILL.md"]
    missing = await client.get(
        f"/api/skill-packages/{package_id}/export?skill_slug=absent", headers=admin
    )
    assert missing.status_code == 404, missing.text
    await client.patch(
        f"/api/skill-packages/{package_id}", headers=admin, json={"allow_download": False}
    )
    denied = await client.get(path, headers=bob)
    assert denied.status_code == 403, denied.text
    assert (await client.get(path, headers=admin)).status_code == 200


async def test_uninstalled_and_paused_siblings_can_be_created_in_workspace(
    env_with_agent: Any,
) -> None:
    client, server, auth, agent_id = env_with_agent
    package_id = (
        await client.post("/api/skill-packages", headers=auth, json={"name": "Independent"})
    ).json()["id"]
    for slug in ("active-reader", "uninstalled-writer", "paused-researcher"):
        created = await client.post(
            f"/api/skill-packages/{package_id}/skills",
            headers=auth,
            json={"name": slug, "content": f"---\nname: {slug}\n---\nPackage instructions"},
        )
        assert created.status_code == 200, created.text
    for slug, enabled in (("active-reader", True), ("paused-researcher", False)):
        installed = await client.put(
            f"/api/skill-packages/library/{package_id}/skills/{slug}",
            headers=auth,
            json={"installed": True, "enabled": enabled},
        )
        assert installed.status_code == 200, installed.text
    registry = server.app_runtime.agent_registry
    assert registry.selected_skill_package_slugs(agent_id) == {"active-reader"}
    active = await client.post(
        f"/api/agents/{agent_id}/skills",
        headers=auth,
        json={"name": "active-reader", "content": "Workspace overwrite"},
    )
    assert active.status_code == 403, active.text
    for slug in ("uninstalled-writer", "paused-researcher"):
        local = await client.post(
            f"/api/agents/{agent_id}/skills",
            headers=auth,
            json={"name": slug, "content": f"---\nname: {slug}\n---\nWorkspace instructions"},
        )
        assert local.status_code == 201, local.text
    rows = (await client.get(f"/api/agents/{agent_id}/skills", headers=auth)).json()
    by_slug = {row["slug"]: row for row in rows}
    assert by_slug["active-reader"]["kind"] == "package"
    for slug in ("uninstalled-writer", "paused-researcher"):
        assert by_slug[slug]["kind"] == "workspace"
        assert by_slug[slug]["enabled"] is True
