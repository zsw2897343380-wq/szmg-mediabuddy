"""Public withdrawal is enforced while independent private resources survive."""

from typing import Any

from tests.support.auth import create_user


async def test_template_seed_and_legacy_builtin_are_managed_and_private_replacements_survive(
    env_with_agent: Any,
) -> None:
    from octop.infra.agents.experts.catalog import default_library_root

    client, server, admin, agent_id = env_with_agent
    registry = server.app_runtime.agent_registry
    registry.persist_harness_config(
        agent_id, {**registry.get_config(agent_id), "general_chat": True}
    )
    workspace = registry.get_agent(agent_id).workspace
    seed = (default_library_root() / "general-assistant/skills/octop-assistant/SKILL.md").read_text(
        encoding="utf-8"
    )
    await workspace.awrite_text("skills/octop-assistant/SKILL.md", seed)
    await workspace.awrite_text(
        "_builtin_skills/mcporter/SKILL.md",
        "---\nname: legacy-mcp-cli\ndescription: Legacy MCP tools\n---\nLegacy builtin",
    )
    listing = await client.get("/api/admin/public-resources", headers=admin)
    assert listing.status_code == 200, listing.text
    slugs = {
        item["resource_id"] for item in listing.json() if item["resource_type"] == "builtin_skill"
    }
    assert {"octop-assistant", "mcporter"} <= slugs
    await _toggle(client, admin, "builtin_skill", ["octop-assistant", "mcporter"], False)
    assert {"octop-assistant", "mcporter", "legacy-mcp-cli"} <= registry.get_agent(
        agent_id
    ).config.skills_disabled
    summaries = (await client.get(f"/api/agents/{agent_id}/skills", headers=admin)).json()
    assert not {"octop-assistant", "mcporter"} & {item["slug"] for item in summaries}
    for slug in ("octop-assistant", "mcporter"):
        assert (
            await client.get(f"/api/agents/{agent_id}/skills/{slug}", headers=admin)
        ).status_code == 404
        assert (
            await client.post(f"/api/agents/{agent_id}/skills/{slug}/enable", headers=admin)
        ).status_code == 204
        assert slug in registry.get_agent(agent_id).config.skills_disabled
    await registry.stop(agent_id)
    await registry.start(agent_id)
    assert {"octop-assistant", "mcporter"} <= registry.get_agent(agent_id).config.skills_disabled
    # Legacy inventory remains manageable even after its runtime is stopped.
    await registry.stop(agent_id)
    stopped_inventory = (await client.get("/api/admin/public-resources", headers=admin)).json()
    assert any(item["resource_id"] == "mcporter" for item in stopped_inventory)
    await registry.start(agent_id)
    await _toggle(client, admin, "builtin_skill", ["octop-assistant", "mcporter"], True)
    assert (
        not {"octop-assistant", "mcporter", "legacy-mcp-cli"}
        & registry.get_agent(agent_id).config.skills_disabled
    )
    for slug in ("octop-assistant", "mcporter"):
        await workspace.awrite_text(
            f"skills/{slug}/SKILL.md",
            f"---\nname: {slug}\ndescription: Private replacement\n---\nIndependent private instructions",
        )
    await _toggle(client, admin, "builtin_skill", ["octop-assistant", "mcporter"], False)
    assert not {"octop-assistant", "mcporter"} & registry.get_agent(agent_id).config.skills_disabled
    summaries = (await client.get(f"/api/agents/{agent_id}/skills", headers=admin)).json()
    assert {item["slug"] for item in summaries if item["kind"] == "workspace"} >= {
        "octop-assistant",
        "mcporter",
    }
    await registry.stop(agent_id)
    await registry.start(agent_id)
    assert not {"octop-assistant", "mcporter"} & registry.get_agent(agent_id).config.skills_disabled
    # An identical copy in a separately created expert is independent as well.
    registry.persist_harness_config(
        agent_id, {**registry.get_config(agent_id), "general_chat": False}
    )
    await workspace.awrite_text("skills/octop-assistant/SKILL.md", seed)
    await _toggle(client, admin, "builtin_skill", ["octop-assistant"], False)
    assert "octop-assistant" not in registry.get_agent(agent_id).config.skills_disabled


async def _toggle(client: Any, admin: Any, source: str, ids: list[str], enabled: bool) -> None:
    response = await client.put(
        f"/api/admin/public-resources/{source}",
        headers=admin,
        json={"ids": ids, "enabled": enabled},
    )
    assert response.status_code == 204, response.text


async def test_inventory_and_updates_are_superadministrator_only(env: Any) -> None:
    client, _server, admin = env
    ordinary = await create_user(
        client,
        admin,
        username="resource-manager",
        permissions=[
            "users.view",
            "users.create",
            "users.edit",
            "users.delete",
            "users.reset_password",
            "users.permissions",
            "users.roles",
            "experts.view",
            "experts.use",
            "experts.create",
            "experts.edit",
            "experts.delete",
            "experts.publish",
            "skills.view",
            "skills.use",
            "skills.create",
            "skills.edit",
            "skills.delete",
            "skills.export",
            "skill_packages.view",
            "skill_packages.use",
            "skill_packages.create",
            "skill_packages.edit",
            "skill_packages.delete",
            "skill_packages.export",
            "skill_packages.publish",
            "connectors.view",
            "connectors.use",
            "connectors.create",
            "connectors.edit",
            "connectors.delete",
            "connectors.publish",
        ],
    )
    assert (await client.get("/api/admin/public-resources")).status_code == 401
    assert (await client.get("/api/admin/public-resources", headers=ordinary)).status_code == 403
    denied = await client.put(
        "/api/admin/public-resources/builtin_skill",
        headers=ordinary,
        json={"ids": ["skill-manager"], "enabled": False},
    )
    assert denied.status_code == 403
    resources = await client.get("/api/admin/public-resources", headers=admin)
    assert resources.status_code == 200, resources.text
    assert {"experts", "skills", "connectors"} <= {row["category"] for row in resources.json()}
    invalid = await client.put(
        "/api/admin/public-resources/builtin_skill",
        headers=admin,
        json={"ids": ["skill-manager", "not-a-resource"], "enabled": False},
    )
    assert invalid.status_code == 404
    resources = (await client.get("/api/admin/public-resources", headers=admin)).json()
    assert next(
        row
        for row in resources
        if row["resource_type"] == "builtin_skill" and row["resource_id"] == "skill-manager"
    )["enabled"]


async def test_withdrawn_template_cannot_be_installed_but_private_expert_is_retained(
    env_with_provider: Any,
) -> None:
    client, server, admin = env_with_provider
    user = await create_user(client, admin, username="template-viewer")
    created = await client.post(
        "/api/agents/from-expert/general-assistant", headers=user, json={"name": "Private expert"}
    )
    assert created.status_code == 201, created.text
    agent_id = created.json()["agent_id"]
    await _toggle(client, admin, "expert_template", ["general-assistant"], False)
    assert "general-assistant" not in {
        row["id"] for row in (await client.get("/api/experts", headers=user)).json()
    }
    assert (await client.get("/api/experts/general-assistant", headers=user)).status_code == 404
    assert (
        await client.post("/api/agents/from-expert/general-assistant", headers=user, json={})
    ).status_code == 404
    assert (await client.get(f"/api/agents/{agent_id}", headers=user)).status_code == 200
    assert server.app_runtime.agent_registry.get_row(agent_id) is not None
    await _toggle(client, admin, "expert_template", ["general-assistant"], True)
    assert (await client.get("/api/experts/general-assistant", headers=user)).status_code == 200


async def test_withdrawn_shared_expert_is_hidden_and_direct_chat_is_blocked(
    env_with_agent: Any,
) -> None:
    client, server, admin, agent_id = env_with_agent
    user = await create_user(client, admin, username="shared-viewer")
    await server.app_runtime.agent_registry.set_shared(agent_id, True)
    assert agent_id in {
        row["agent_id"] for row in (await client.get("/api/agents", headers=user)).json()
    }
    await _toggle(client, admin, "shared_expert", [agent_id], False)
    assert agent_id not in {
        row["agent_id"] for row in (await client.get("/api/agents", headers=user)).json()
    }
    assert (
        await client.get(f"/api/agents/{agent_id}/chat/welcome", headers=user)
    ).status_code == 404
    assert (await client.get(f"/api/agents/{agent_id}", headers=admin)).status_code == 200
    blocked_team = await client.post(
        "/api/teams", headers=user, json={"name": "Blocked team", "member_ids": [agent_id]}
    )
    assert blocked_team.status_code == 400
    assert blocked_team.json()["error"]["code"] == "TEAM_MEMBER_INVALID"


async def test_stopped_expert_cannot_be_submitted_as_a_team_member(env_with_agent: Any) -> None:
    client, _server, admin, agent_id = env_with_agent
    stopped = await client.post(f"/api/agents/{agent_id}/stop", headers=admin)
    assert stopped.status_code == 204, stopped.text
    blocked_team = await client.post(
        "/api/teams", headers=admin, json={"name": "Blocked team", "member_ids": [agent_id]}
    )
    assert blocked_team.status_code == 400
    assert blocked_team.json()["error"]["code"] == "TEAM_MEMBER_INVALID"


async def test_public_builtin_withdrawal_cannot_be_undone_personally_and_private_copy_survives(
    env_with_agent: Any,
) -> None:
    client, server, admin, agent_id = env_with_agent
    registry = server.app_runtime.agent_registry
    await _toggle(client, admin, "builtin_skill", ["skill-manager"], False)
    assert "skill-manager" in registry.get_agent(agent_id).config.skills_disabled
    assert "skill-manager" not in {
        row["slug"]
        for row in (await client.get(f"/api/agents/{agent_id}/skills", headers=admin)).json()
    }
    response = await client.post(
        f"/api/agents/{agent_id}/skills/skill-manager/enable", headers=admin
    )
    assert response.status_code == 204, response.text
    assert "skill-manager" in registry.get_agent(agent_id).config.skills_disabled
    workspace = registry.get_agent(agent_id).workspace
    await workspace.awrite_text(
        f"{workspace.system_rel('skills')}/skill-manager/SKILL.md",
        "---\nname: skill-manager\ndescription: Independent private copy\n---\nPrivate instructions",
    )
    await _toggle(client, admin, "builtin_skill", ["skill-manager"], False)
    assert "skill-manager" not in registry.get_agent(agent_id).config.skills_disabled
    detail = await client.get(f"/api/agents/{agent_id}/skills/skill-manager", headers=admin)
    assert detail.status_code == 200, detail.text
    assert detail.json()["kind"] == "workspace"
    assert "Private instructions" in detail.json()["raw"]


async def test_public_package_skill_stops_live_mount_and_keeps_private_workspace_copy(
    env_with_agent: Any,
) -> None:
    client, server, admin, agent_id = env_with_agent
    package = await client.post(
        "/api/skill-packages", headers=admin, json={"name": "Public helpers"}
    )
    package_id = package.json()["id"]
    for slug in ("public-reader", "public-writer"):
        response = await client.post(
            f"/api/skill-packages/{package_id}/skills",
            headers=admin,
            json={
                "name": slug,
                "content": f"---\nname: {slug}\ndescription: Public\n---\nPublic instructions",
            },
        )
        assert response.status_code == 200, response.text
    await client.put(
        f"/api/skill-packages/library/{package_id}", headers=admin, json={"installed": True}
    )
    registry = server.app_runtime.agent_registry
    workspace = registry.get_agent(agent_id).workspace
    await workspace.awrite_text(
        f"{workspace.system_rel('skills')}/public-reader/SKILL.md",
        "---\nname: public-reader\ndescription: Private\n---\nPrivate copy",
    )
    await _toggle(
        client,
        admin,
        "package_skill",
        [f"{package_id}/public-reader", f"{package_id}/public-writer"],
        False,
    )
    public = await client.get(f"/api/skill-packages/{package_id}/skills", headers=admin)
    assert public.json() == []
    assert (
        await client.get(f"/api/skill-packages/{package_id}/skills/public-writer", headers=admin)
    ).status_code == 404
    assert "public-writer" in registry.get_agent(agent_id).config.skills_disabled
    assert "public-reader" not in registry.get_agent(agent_id).config.skills_disabled
    assert "Private copy" in (
        await workspace.aread_text(f"{workspace.system_rel('skills')}/public-reader/SKILL.md") or ""
    )


async def test_connector_type_and_shared_instance_are_filtered_from_live_configs(env: Any) -> None:
    from octop.api.routers.connectors import _connector_service

    client, server, admin = env
    viewer = await create_user(client, admin, username="connector-viewer")
    owner_id = (await client.get("/api/auth/me", headers=admin)).json()["id"]
    repo = server.services.repos.connector_repo
    repo.create(
        instance_id="PUBLIC-CONNECTOR",
        user_id=owner_id,
        kind="notion",
        display_name="Shared Notion",
        mcp_server_name="notion-shared",
        shared=True,
    )
    service = _connector_service(server)
    service.encrypt_and_store(
        instance_id="PUBLIC-CONNECTOR", payload={"access_token": "fake-token"}
    )
    viewer_id = (await client.get("/api/auth/me", headers=viewer)).json()["id"]
    assert "notion-shared" in service.list_active_mcp_server_names(viewer_id)
    await _toggle(client, admin, "shared_connector", ["PUBLIC-CONNECTOR"], False)
    assert "notion-shared" not in service.list_active_mcp_server_names(viewer_id)
    assert not (await client.get("/api/connector-instances", headers=viewer)).json()
    await _toggle(client, admin, "connector_catalog", ["notion"], False)
    assert "notion" not in {
        row["kind"] for row in (await client.get("/api/connectors/catalog", headers=viewer)).json()
    }
    assert (
        await client.post(
            "/api/connector-instances",
            headers=viewer,
            json={"kind": "notion", "display_name": "Hidden", "credentials": {}},
        )
    ).status_code == 404


async def test_withdrawing_shared_custom_mcp_preserves_an_independent_private_connection(
    env: Any,
) -> None:
    from octop.api.routers.connectors import _connector_service

    client, server, admin = env
    viewer = await create_user(client, admin, username="private-mcp-viewer")
    owner_id = (await client.get("/api/auth/me", headers=admin)).json()["id"]
    viewer_id = (await client.get("/api/auth/me", headers=viewer)).json()["id"]
    service = _connector_service(server)
    service.put_custom_servers(
        owner_id,
        {
            "weather": {
                "url": "https://public.example/mcp",
                "transport": "streamable_http",
                "shared": True,
            }
        },
    )
    service.put_custom_servers(
        viewer_id,
        {"weather": {"url": "https://private.example/mcp", "transport": "streamable_http"}},
    )
    parent = server.services.repos.connector_repo.get_by_user_kind(owner_id, "custom-mcp")
    assert parent is not None
    public_id = f"custom:{parent.instance_id}:weather"
    shared_name = f"custom__{parent.instance_id}__weather"
    assert shared_name in service.custom_harness_configs(viewer_id)
    await _toggle(client, admin, "shared_connector", [public_id], False)
    configs = service.custom_harness_configs(viewer_id)
    assert shared_name not in configs
    assert "weather" in configs
    visible = (await client.get("/api/connector-instances", headers=viewer)).json()
    assert len(visible) == 1
    assert visible[0]["mcp_server_name"] == "weather" and not visible[0]["shared"]
