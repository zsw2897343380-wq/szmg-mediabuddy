"""Personal installation state and runtime inheritance boundaries."""

from __future__ import annotations

import json
from pathlib import Path
from unittest.mock import MagicMock

import pytest

from octop.config import OctopConfig
from octop.infra.agents.manager import AgentManager
from octop.infra.db.migrate import run_migrations
from octop.infra.db.pool import SqlitePool
from octop.infra.db.services import build_shared_services
from octop.infra.skills.user_library import UserSkillLibrary
from octop.infra.utils.paths import PathLayout


@pytest.fixture
def manager(tmp_path: Path) -> AgentManager:
    paths = PathLayout(tmp_path / "octop")
    paths.ensure_root()
    db = SqlitePool(paths.db)
    run_migrations(db)
    services = build_shared_services(db=db, paths=paths, config=OctopConfig())
    return AgentManager(repos=services.repos, paths=paths)


def _library(manager: AgentManager) -> UserSkillLibrary:
    return UserSkillLibrary(
        settings=manager._repos.settings_repo, packages=manager._repos.skill_package_repo
    )


def _seed(manager: AgentManager) -> tuple[int, int, str]:
    alice = manager._repos.user_repo.create(username="alice", role="user")
    bob = manager._repos.user_repo.create(username="bob", role="user")
    package = manager._repos.skill_package_repo.create(
        id="PACK01", name="Office", created_by=str(alice)
    )
    for agent_id, owner in (("alice-agent", alice), ("bob-agent", bob), ("shared", None)):
        manager._repos.agent_repo.create(agent_id=agent_id, user_id=owner, name=agent_id)
    manager._repos.agent_repo.create(agent_id="team", user_id=alice, name="team", kind="team")
    return alice, bob, package.id


def test_installation_and_pause_are_user_scoped_and_persist_without_agent_changes(
    manager: AgentManager,
) -> None:
    alice, bob, package_id = _seed(manager)
    library = _library(manager)
    library.update(alice, package_id, installed=True, enabled=True)
    assert library.load(bob).installed_package_ids == []
    assert manager.effective_skill_package_ids("alice-agent") == [package_id]
    assert manager.effective_skill_package_ids("bob-agent") == []
    assert manager.effective_skill_package_ids("shared") == []
    assert manager.effective_skill_package_ids("team") == []
    assert manager.get_config("alice-agent").get("skill_package_ids", []) == []

    library.update(alice, package_id, installed=True, enabled=False)
    assert _library(manager).load(alice).installed_package_ids == [package_id]
    assert _library(manager).load(alice).enabled_package_ids == []
    assert manager._resolve_skill_package_dirs("alice-agent") == []
    library.update(alice, package_id, installed=False, enabled=True)
    assert library.load(alice).installed_package_ids == []
    assert library.load(alice).disabled_package_ids == []


@pytest.mark.asyncio
async def test_personal_pause_wins_over_legacy_agent_mount(manager: AgentManager) -> None:
    alice, _bob, package_id = _seed(manager)
    await manager.persist_skill_package_ids("alice-agent", [package_id])
    library = _library(manager)
    library.update(alice, package_id, installed=True, enabled=False)
    assert manager.get_config("alice-agent")["skill_package_ids"] == [package_id]
    assert manager.effective_skill_package_ids("alice-agent") == []
    library.update(alice, package_id, installed=True, enabled=True)
    assert manager.effective_skill_package_ids("alice-agent") == [package_id]


def test_startup_configuration_inherits_personal_library(manager: AgentManager) -> None:
    alice, _bob, package_id = _seed(manager)
    library = _library(manager)
    library.update(alice, package_id, installed=True, enabled=True)
    row = manager._repos.agent_repo.get("alice-agent")
    assert row is not None
    config = manager._build_harness_config(row)
    expected = str((manager.paths.skill_packages_dir / package_id / "skills").resolve())
    assert config.skills_dir == [expected]
    library.update(alice, package_id, installed=True, enabled=False)
    assert manager._build_harness_config(row).skills_dir is None


@pytest.mark.parametrize("backend_type", ["local_shell", "s3"])
def test_personal_library_does_not_mount_into_restricted_or_remote_backends(
    manager: AgentManager, tmp_path: Path, backend_type: str
) -> None:
    alice, _bob, package_id = _seed(manager)
    _library(manager).update(alice, package_id, installed=True, enabled=True)
    cfg = manager.get_config("alice-agent")
    cfg["backend"] = {"type": backend_type, "root_dir": str(tmp_path / "sandbox")}
    manager.persist_harness_config("alice-agent", cfg)
    assert manager.effective_skill_package_ids("alice-agent") == []
    assert manager._resolve_skill_package_dirs("alice-agent") == []


@pytest.mark.asyncio
async def test_library_change_hot_updates_only_owner_agents(manager: AgentManager) -> None:
    alice, _bob, package_id = _seed(manager)
    agents = {name: MagicMock() for name in ("alice-agent", "bob-agent", "shared")}
    harness = MagicMock()
    harness.get_agent.side_effect = lambda aid: MagicMock(agent=agents[aid])
    manager._harness_manager = harness
    _library(manager).update(alice, package_id, installed=True, enabled=True)
    await manager.refresh_user_skill_library(alice)
    expected = str((manager.paths.skill_packages_dir / package_id / "skills").resolve())
    assert agents["alice-agent"].config.skills_dir == [expected]
    agents["alice-agent"].reload_subagents.assert_called_once_with()
    agents["bob-agent"].reload_subagents.assert_not_called()
    agents["shared"].reload_subagents.assert_not_called()

    _library(manager).update(alice, package_id, installed=True, enabled=False)
    await manager.refresh_user_skill_library(alice)
    assert agents["alice-agent"].config.skills_dir is None


@pytest.mark.asyncio
async def test_deleted_packages_are_removed_from_saved_installations(manager: AgentManager) -> None:
    alice, bob, package_id = _seed(manager)
    library = _library(manager)
    library.update(alice, package_id, installed=True, enabled=False)
    library.update(bob, package_id, installed=True, enabled=True)
    manager._repos.skill_package_repo.delete(package_id)
    await manager.strip_skill_package_id(package_id)
    for user_id in (alice, bob):
        assert library.load(user_id).installed_package_ids == []
        raw = manager._repos.settings_repo.get(f"user_skill_library:{user_id}")
        assert raw is not None
        assert json.loads(raw) == {"installed_package_ids": [], "disabled_package_ids": []}
