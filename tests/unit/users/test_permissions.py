"""Unit tests for the module permission catalog."""

from __future__ import annotations

from dataclasses import dataclass

import pytest

from octop.infra.users.permissions import (
    ALL_PERMISSION_KEYS,
    BASELINE_PERMISSIONS,
    PERMISSIONS,
    effective_permissions,
    expand_permissions,
    user_has_permission,
    validate_permission_keys,
)


@dataclass
class _FakeUser:
    is_admin: bool
    permissions: list[str] | None = None


def test_catalog_has_no_empty_keys_and_no_deferred_dead_keys() -> None:
    assert PERMISSIONS
    for key in PERMISSIONS:
        assert key == PERMISSIONS[key].key
        assert PERMISSIONS[key].label_zh and PERMISSIONS[key].label_en
    assert {
        "acp",
        "bridge",
        "workspace",
        "public_resources",
        "assistants",
        "chat",
        "records",
    } <= set(PERMISSIONS)


def test_user_has_permission_admin_bypass() -> None:
    admin = _FakeUser(is_admin=True, permissions=[])
    for key in ALL_PERMISSION_KEYS:
        assert user_has_permission(admin, key) is True


def test_user_has_permission_normal_hit_and_miss() -> None:
    u = _FakeUser(is_admin=False, permissions=["browser.view", "users.view"])
    assert user_has_permission(u, "browser") is True
    assert user_has_permission(u, "providers") is False
    assert user_has_permission(u, "unknown_key") is False


def test_baseline_is_settings_group() -> None:
    assert {
        key for key, p in PERMISSIONS.items() if p.parent and p.category in {"settings", "nav"}
    } == BASELINE_PERMISSIONS
    assert BASELINE_PERMISSIONS
    assert "experts.view" in BASELINE_PERMISSIONS
    assert "tasks.view" in BASELINE_PERMISSIONS
    assert "token_usage.view" in BASELINE_PERMISSIONS


def test_categories_match_nav_groups() -> None:
    allowed = {"settings", "control", "admin", "nav"}
    for p in PERMISSIONS.values():
        assert p.category in allowed
    assert {k for k, p in PERMISSIONS.items() if not p.parent and p.category == "settings"} == {
        "skills",
        "subagents",
        "tools",
        "agent_plugins",
        "mbti",
        "memory",
        "channels",
        "connectors",
        "skill_packages",
        "knowledge_bases",
        "bridge",
        "workspace",
    }
    assert PERMISSIONS["skills"].page == "personalization"
    assert PERMISSIONS["agent_plugins"].page == "personalization"
    assert {k for k, p in PERMISSIONS.items() if not p.parent and p.category == "control"} == {
        "terminal",
        "acp",
        "browser",
        "desktop",
        "mobile",
    }
    assert PERMISSIONS["envs"].page == "advanced"
    assert PERMISSIONS["voice"].page == "models"
    assert PERMISSIONS["search"].page == "models"
    assert PERMISSIONS["knowledge_settings"].page == "advanced"
    assert PERMISSIONS["knowledge_settings"].category == "admin"
    assert "knowledge_settings" not in BASELINE_PERMISSIONS
    assert PERMISSIONS["users"].page == "users"
    assert PERMISSIONS["plugins"].page == "plugins"
    assert not PERMISSIONS["plugins"].extra_tabs
    assert "agents" not in PERMISSIONS


def test_validate_permission_keys_rejects_unknown() -> None:
    assert validate_permission_keys(["browser.view", "users.view"]) == [
        "browser.view",
        "users.view",
    ]
    with pytest.raises(ValueError):
        validate_permission_keys(["browser", "not_a_real_key"])


def test_effective_permissions_admin_gets_catalog() -> None:
    admin = _FakeUser(is_admin=True, permissions=[])
    assert effective_permissions(admin) == sorted(ALL_PERMISSION_KEYS)


@pytest.mark.parametrize("module", ["experts", "skills", "connectors", "tasks", "users", "backup"])
def test_view_does_not_grant_mutations(module: str) -> None:
    user = _FakeUser(False, [f"{module}.view"])
    assert user_has_permission(user, module)
    assert user_has_permission(user, f"{module}.view")
    assert not user_has_permission(user, f"{module}.delete")
    assert not user_has_permission(user, f"{module}.edit")


def test_retired_module_names_grant_nothing() -> None:
    user = _FakeUser(False, ["users", "token_usage"])
    assert not user_has_permission(user, "users")
    assert not user_has_permission(user, "users.permissions")
    assert not user_has_permission(user, "token_usage.all")
    assert expand_permissions(user.permissions or []) == set()
    assert effective_permissions(user) == []
    with pytest.raises(ValueError):
        validate_permission_keys(["users"])
