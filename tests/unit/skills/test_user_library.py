"""Personal installation state and runtime inheritance boundaries."""

from __future__ import annotations

import json
from pathlib import Path
from unittest.mock import MagicMock

import pytest

from octop.config import OctopConfig
from octop.infra.agents.manager import AgentManager
from octop.infra.backend.skill_mounts import PACKAGE_SKILL_MOUNT, USER_SKILL_MOUNT
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


def _expected_package_root(manager: AgentManager, agent_id: str, package_id: str) -> str:
    return f"{PACKAGE_SKILL_MOUNT}{package_id}/skills"


def _cache_root(manager: AgentManager, user_id: int, root: str) -> Path:
    if root.startswith(USER_SKILL_MOUNT):
        return manager.paths.user_skill_library_cache(user_id) / root.removeprefix(USER_SKILL_MOUNT)
    return Path(root)


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
    expected = _expected_package_root(manager, "alice-agent", package_id)
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
    expected = _expected_package_root(manager, "alice-agent", package_id)
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
        assert json.loads(raw) == {
            "installed_package_ids": [],
            "disabled_package_ids": [],
            "skill_states": {},
        }


def _skill_store(manager: AgentManager, package_id: str) -> None:
    from octop.infra.skills.skill_package_store import SkillPackageStore

    store = SkillPackageStore(
        repo=manager._repos.skill_package_repo, root=manager.paths.skill_packages_dir
    )
    for slug in ("reader", "writer"):
        store.write_skill(
            package_id,
            slug,
            [
                ("SKILL.md", f"---\nname: {slug}\ndescription: {slug}\n---\nInstructions".encode()),
                ("references/help.txt", slug.encode()),
            ],
        )


def test_individual_install_mounts_only_that_skill_and_preserves_relative_resources(
    manager: AgentManager,
) -> None:
    alice, bob, package_id = _seed(manager)
    _skill_store(manager, package_id)
    library = _library(manager)
    library.update_skill(alice, package_id, "reader", installed=True, enabled=True)
    assert library.load(alice).installed_package_ids == []
    assert library.load(bob).skill_states == {}
    row = manager.get_row("alice-agent")
    assert row is not None
    config = manager._build_harness_config(row)
    roots = list(config.skills_dir or [])
    assert len(roots) == 1
    root = _cache_root(manager, alice, str(roots[0]))
    assert root.is_relative_to(manager.paths.user_skill_library_cache(alice))
    assert {entry.name for entry in root.iterdir()} == {"reader"}
    assert (root / "reader/references/help.txt").read_text() == "reader"
    assert not (root / "writer").exists()
    assert manager.get_config("alice-agent").get("skill_package_ids", []) == []
    assert manager._resolve_skill_package_dirs("bob-agent") == []


@pytest.mark.asyncio
async def test_individual_override_preserves_legacy_sibling_and_never_changes_global_disable(
    manager: AgentManager,
) -> None:
    alice, _bob, package_id = _seed(manager)
    _skill_store(manager, package_id)
    await manager.persist_skill_package_ids("alice-agent", [package_id])
    library = _library(manager)
    library.update_skill(alice, package_id, "reader", installed=True, enabled=False)
    root = _cache_root(manager, alice, manager._resolve_skill_package_dirs("alice-agent")[0])
    assert {entry.name for entry in root.iterdir()} == {"writer"}
    assert manager.get_config("alice-agent").get("skills_disabled", []) == []
    assert manager.get_config("alice-agent")["skill_package_ids"] == [package_id]
    library.update_skill(alice, package_id, "writer", installed=False, enabled=False)
    assert manager._resolve_skill_package_dirs("alice-agent") == []
    # Legacy package operation deliberately resets individual overrides.
    library.update(alice, package_id, installed=True, enabled=True)
    assert manager._resolve_skill_package_dirs("alice-agent") == [
        _expected_package_root(manager, "alice-agent", package_id)
    ]


@pytest.mark.asyncio
async def test_individual_cache_tracks_edits_deletions_and_hot_refresh(
    manager: AgentManager,
) -> None:
    from octop.infra.skills.skill_package_store import SkillPackageStore

    alice, _bob, package_id = _seed(manager)
    _skill_store(manager, package_id)
    library = _library(manager)
    library.update_skill(alice, package_id, "reader", installed=True, enabled=True)
    fake_agent = MagicMock()
    harness = MagicMock()
    harness.get_agent.return_value = MagicMock(agent=fake_agent)
    manager._harness_manager = harness
    await manager.refresh_user_skill_library(alice)
    original_root = _cache_root(manager, alice, fake_agent.config.skills_dir[0])
    store = SkillPackageStore(
        repo=manager._repos.skill_package_repo, root=manager.paths.skill_packages_dir
    )
    store.write_skill(
        package_id, "reader", [("SKILL.md", b"---\nname: reader\n---\nUpdated instructions")]
    )
    await manager.refresh_agents_for_package(package_id)
    new_root = _cache_root(manager, alice, fake_agent.config.skills_dir[0])
    assert new_root != original_root
    assert "Updated instructions" in (new_root / "reader/SKILL.md").read_text()
    assert "Updated instructions" not in (original_root / "reader/SKILL.md").read_text()
    store.delete_skill(package_id, "reader")
    await manager.refresh_agents_for_package(package_id)
    assert fake_agent.config.skills_dir is None
    assert fake_agent.reload_subagents.call_count == 3


@pytest.mark.asyncio
@pytest.mark.parametrize("virtual_mode", [False, True])
async def test_real_harness_catalog_scans_only_selected_package_and_preserves_workspace_names(
    manager: AgentManager,
    virtual_mode: bool,
) -> None:
    from octop_harness.backends import resolve_backend
    from octop_harness.backends.workspace import BackendWorkspace
    from octop_harness.skills.catalog import list_skill_summaries

    alice, _bob, package_id = _seed(manager)
    _skill_store(manager, package_id)
    library = _library(manager)
    workspace_dir = manager.resolve_workspace_dir("alice-agent")
    workspace_dir.mkdir(parents=True, exist_ok=True)
    saved = manager.get_config("alice-agent")
    saved["backend"] = {
        "type": "filesystem",
        "root_dir": str(workspace_dir),
        "virtual_mode": virtual_mode,
    }
    manager.persist_harness_config("alice-agent", saved)
    library.update_skill(alice, package_id, "reader", installed=True, enabled=True)
    row = manager.get_row("alice-agent")
    assert row is not None
    config = manager._build_harness_config(row)
    backend = resolve_backend(config.backend, workspace_dir=workspace_dir)
    workspace = BackendWorkspace(backend, workspace_dir)
    assert manager.get_config("alice-agent")["backend"] == saved["backend"]
    rows = await list_skill_summaries(
        workspace, skills_dir=manager._resolve_skill_package_dirs("alice-agent")
    )
    assert {row["slug"] for row in rows} == {"reader"}
    assert rows[0]["enabled"] is True
    # All workspace content goes through the workspace facade.
    await workspace.awrite_text("skills/reader/SKILL.md", "---\nname: reader\n---\nWorkspace copy")
    library.update_skill(alice, package_id, "reader", installed=True, enabled=False)
    rows = await list_skill_summaries(
        workspace, skills_dir=manager._resolve_skill_package_dirs("alice-agent")
    )
    assert {row["slug"] for row in rows} == {"reader"}
    assert rows[0]["enabled"] is True
    library.update_skill(alice, package_id, "reader", installed=False, enabled=False)
    rows = await list_skill_summaries(
        workspace, skills_dir=manager._resolve_skill_package_dirs("alice-agent")
    )
    assert rows[0]["slug"] == "reader" and rows[0]["enabled"] is True


@pytest.mark.asyncio
@pytest.mark.parametrize("virtual_mode", [False, True])
async def test_readonly_runtime_mounts_reject_all_mutations_and_preserve_default_workspace(
    manager: AgentManager,
    virtual_mode: bool,
) -> None:
    from octop_harness.backends import resolve_backend
    from octop_harness.backends.workspace import BackendWorkspace

    from octop.infra.backend.skill_mounts import ReadOnlySkillMounts

    alice, _bob, package_id = _seed(manager)
    _skill_store(manager, package_id)
    workspace_dir = manager.resolve_workspace_dir("alice-agent")
    workspace_dir.mkdir(parents=True, exist_ok=True)
    saved = manager.get_config("alice-agent")
    saved["backend"] = {
        "type": "filesystem",
        "root_dir": str(workspace_dir),
        "virtual_mode": virtual_mode,
    }
    manager.persist_harness_config("alice-agent", saved)
    _library(manager).update_skill(alice, package_id, "reader", installed=True, enabled=True)
    row = manager.get_row("alice-agent")
    assert row is not None
    config = manager._build_harness_config(row)
    backend = resolve_backend(config.backend, workspace_dir=workspace_dir)
    assert isinstance(backend, ReadOnlySkillMounts)
    assert config.skills_dir
    workspace = BackendWorkspace(backend, workspace_dir)
    selected_path = f"{config.skills_dir[0]}/reader/SKILL.md"
    original_path = f"{PACKAGE_SKILL_MOUNT}{package_id}/skills/reader/SKILL.md"
    for path in (selected_path, original_path):
        before = await workspace.aread_text(path)
        assert before and "Instructions" in before
        assert backend.write(path, "Overwrite").error == "permission_denied"
        assert (await backend.awrite(path, "Overwrite")).error == "permission_denied"
        assert backend.edit(path, "Instructions", "Changed").error == "permission_denied"
        assert (await backend.aedit(path, "Instructions", "Changed")).error == "permission_denied"
        assert backend.delete(path).error == "permission_denied"
        assert (await backend.adelete(path)).error == "permission_denied"
        assert backend.upload_files([(path, b"Changed")])[0].error == "permission_denied"
        assert (await backend.aupload_files([(path, b"Changed")]))[0].error == "permission_denied"
        with pytest.raises(Exception, match="permission_denied"):
            await workspace.awrite_text(path, "Overwrite", force=True)
        with pytest.raises(PermissionError, match="permission_denied"):
            workspace.mkdir(f"{path}.dir")
        with pytest.raises(PermissionError, match="permission_denied"):
            await workspace.amkdir(f"{path}.dir")
        with pytest.raises(PermissionError, match="permission_denied"):
            workspace.delete(path)
        with pytest.raises(PermissionError, match="permission_denied"):
            await workspace.adelete(path)
        with pytest.raises(PermissionError, match="permission_denied"):
            workspace.move(path, "inbound/copied.md")
        with pytest.raises(PermissionError, match="permission_denied"):
            await workspace.amove(path, "inbound/copied.md")
        with pytest.raises(PermissionError, match="permission_denied"):
            await workspace.amove("inbound/attachment.txt", path)
        assert await workspace.aread_text(path) == before
    for mounted in backend.routes.values():
        assert not callable(getattr(mounted, "execute", None))
    await workspace.aupload_bytes("inbound/attachment.txt", b"Attachment")
    assert await workspace.adownload_bytes("inbound/attachment.txt") == b"Attachment"
    assert (workspace_dir / "inbound/attachment.txt").read_bytes() == b"Attachment"
    await workspace.amkdir("local-dir")
    await workspace.amove("inbound/attachment.txt", "local-dir/renamed.txt")
    assert await workspace.aread_text("local-dir/renamed.txt") == "Attachment"
    await workspace.adelete("local-dir")
    assert not (workspace_dir / "local-dir").exists()
    current = await workspace.als(".")
    root = await workspace.als("/")
    assert current is not None and root is not None
    baseline = BackendWorkspace(backend.default, workspace_dir)
    for path, result in ((".", current), ("/", root)):
        original = await baseline.als(path)
        assert original is not None
        extra_names = {mount.rstrip("/") for mount in (PACKAGE_SKILL_MOUNT, USER_SKILL_MOUNT)} | {
            mount.strip("/") for mount in (PACKAGE_SKILL_MOUNT, USER_SKILL_MOUNT)
        }
        actual_paths = {entry["path"].rstrip("/") for entry in result.entries}
        original_paths = {entry["path"].rstrip("/") for entry in original.entries}
        assert actual_paths - extra_names == original_paths - extra_names
    assert manager.get_config("alice-agent")["backend"] == saved["backend"]


@pytest.mark.asyncio
async def test_running_virtual_agent_adds_readonly_mounts_once_then_hot_refreshes(
    manager: AgentManager, monkeypatch: pytest.MonkeyPatch
) -> None:
    from unittest.mock import AsyncMock

    from deepagents.backends.filesystem import FilesystemBackend

    from octop.infra.backend.skill_mounts import ReadOnlySkillBackend, ReadOnlySkillMounts

    alice, _bob, package_id = _seed(manager)
    _skill_store(manager, package_id)
    workspace_dir = manager.resolve_workspace_dir("alice-agent")
    saved = manager.get_config("alice-agent")
    saved["backend"] = {"type": "filesystem", "root_dir": str(workspace_dir), "virtual_mode": True}
    manager.persist_harness_config("alice-agent", saved)
    fake_agent = MagicMock()
    fake_agent.config.backend = saved["backend"]
    harness = MagicMock()
    harness.get_agent.return_value = MagicMock(agent=fake_agent)
    manager._harness_manager = harness

    async def add_mounts(agent_id: str) -> None:
        assert agent_id == "alice-agent"
        fake_agent.config.backend = ReadOnlySkillMounts(
            default=FilesystemBackend(root_dir=workspace_dir, virtual_mode=True),
            routes={
                USER_SKILL_MOUNT: ReadOnlySkillBackend(
                    root_dir=manager.paths.user_skill_library_cache(alice), virtual_mode=True
                )
            },
            workspace_dir=workspace_dir,
        )

    reload_agent = AsyncMock(side_effect=add_mounts)
    monkeypatch.setattr(manager, "_reload_agent", reload_agent)
    library = _library(manager)
    library.update_skill(alice, package_id, "reader", installed=True, enabled=True)
    await manager.refresh_user_skill_library(alice)
    reload_agent.assert_awaited_once_with("alice-agent")
    library.update_skill(alice, package_id, "reader", installed=True, enabled=False)
    await manager.refresh_user_skill_library(alice)
    reload_agent.assert_awaited_once()
    assert fake_agent.config.skills_dir is None
    assert manager.get_config("alice-agent")["backend"] == saved["backend"]
