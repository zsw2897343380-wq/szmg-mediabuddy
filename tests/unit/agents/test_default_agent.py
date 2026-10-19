"""Unit tests for default-agent bootstrap helper."""

from __future__ import annotations

import asyncio
import json
from dataclasses import replace
from pathlib import Path
from unittest.mock import AsyncMock, MagicMock

import pytest

from octop.infra.agents.experts.catalog import ExpertCatalog, default_library_root
from octop.infra.agents.experts.default_agent import (
    DEFAULT_EXPERT_ID,
    SETUP_DEFAULT_AGENT_ID,
    bootstrap_default_agent,
    default_home_local_backend,
    ensure_default_chat_agent,
)
from octop.infra.agents.manager import AgentManager
from octop.infra.db.repos.agents import AgentRow
from octop.infra.errors import ErrorCode, OctopError
from octop.infra.utils.host_dirs import host_fs_tree_root


@pytest.fixture(scope="module")
def catalog() -> ExpertCatalog:
    cat = ExpertCatalog(default_library_root())
    cat.refresh()
    return cat


async def test_bootstrap_skips_when_user_has_agents(catalog: ExpertCatalog) -> None:
    registry = MagicMock()
    registry.list_agents.return_value = [object()]
    registry.get_row.return_value = None
    registry.create = AsyncMock()
    result = await bootstrap_default_agent(registry, catalog, user_id=2, locale="zh", agent_id=None)
    assert result is None
    registry.create.assert_not_called()


async def test_bootstrap_skips_when_main_exists(catalog: ExpertCatalog) -> None:
    registry = MagicMock()
    registry.get_row.return_value = object()
    registry.list_agents.return_value = []
    registry.create = AsyncMock()
    result = await bootstrap_default_agent(
        registry,
        catalog,
        user_id=1,
        locale="zh",
        agent_id=SETUP_DEFAULT_AGENT_ID,
    )
    assert result is None
    registry.create.assert_not_called()


async def test_bootstrap_creates_general_assistant(catalog: ExpertCatalog) -> None:
    registry = MagicMock()
    registry.get_row.return_value = None
    registry.list_agents.return_value = []
    created = object()
    registry.create = AsyncMock(return_value=created)
    result = await bootstrap_default_agent(registry, catalog, user_id=3, locale="en", agent_id=None)
    assert result is created
    registry.create.assert_awaited_once()
    spec = registry.create.await_args.args[0]
    assert spec.user_id == 3
    assert spec.agent_id is None
    assert spec.template_name == DEFAULT_EXPERT_ID
    assert spec.config["backend"] == default_home_local_backend()
    assert spec.config["backend"]["root_dir"] == host_fs_tree_root()
    assert spec.config["general_chat"] is True
    assert registry.create.await_args.kwargs["defer_bootstrap"] is True


async def test_bootstrap_main_uses_fs_root_backend(catalog: ExpertCatalog) -> None:
    registry = MagicMock()
    registry.get_row.return_value = None
    registry.list_agents.return_value = []
    registry.create = AsyncMock(return_value=object())

    await bootstrap_default_agent(
        registry,
        catalog,
        user_id=1,
        agent_id=SETUP_DEFAULT_AGENT_ID,
    )

    spec = registry.create.await_args.args[0]
    assert spec.config["backend"] == default_home_local_backend()
    assert spec.config["backend"]["root_dir"] == host_fs_tree_root()


async def test_bootstrap_respects_policy_root_dir(catalog: ExpertCatalog, tmp_path: Path) -> None:
    registry = MagicMock()
    registry.get_row.return_value = None
    registry.list_agents.return_value = []
    registry.create = AsyncMock(return_value=object())
    jail = (tmp_path / "jail").resolve().as_posix()

    await bootstrap_default_agent(
        registry,
        catalog,
        user_id=1,
        agent_id=None,
        root_dir=jail,
    )

    spec = registry.create.await_args.args[0]
    assert spec.config["backend"] == default_home_local_backend(root_dir=jail)
    assert spec.config["backend"]["root_dir"] == jail


async def test_bootstrap_requires_catalog() -> None:
    registry = MagicMock()
    registry.get_row.return_value = None
    registry.list_agents.return_value = []
    with pytest.raises(OctopError):
        await bootstrap_default_agent(registry, None, user_id=1, locale="zh")


def _row(agent_id: str = "general", **changes) -> AgentRow:
    return replace(
        AgentRow(
            id=1,
            agent_id=agent_id,
            user_id=4,
            name="My general assistant",
            description="My existing profile",
            persona_mbti=None,
            default_model="openai/my-model",
            system_prompt="Keep my instructions",
            enabled=1,
            config_json='{"backend":{"type":"local_shell"},"plugins":["mine"]}',
            last_state="running",
            last_error=None,
            created_at=1,
            updated_at=1,
            template_name=DEFAULT_EXPERT_ID,
        ),
        **changes,
    )


def _registry(rows: list[AgentRow]) -> MagicMock:
    registry = MagicMock()
    registry.list_agents.return_value = rows
    registry.get_row.side_effect = lambda agent_id: next(
        (row for row in rows if row.agent_id == agent_id), None
    )
    registry.create = AsyncMock(return_value=_row("new-general"))
    registry.start = AsyncMock()
    return registry


@pytest.mark.parametrize("has_specialist", [False, True])
async def test_general_chat_created_even_with_only_specialist(
    catalog: ExpertCatalog, has_specialist: bool, tmp_path: Path
) -> None:
    rows = [_row("doctor", template_name="doctor")] if has_specialist else []
    registry = _registry(rows)
    result = await ensure_default_chat_agent(
        registry, catalog, user_id=4, root_dir=tmp_path.as_posix()
    )
    assert result.agent_id == "new-general"
    spec = registry.create.await_args.args[0]
    assert spec.user_id == 4
    assert spec.is_shared is False
    assert spec.agent_id is None
    assert spec.config["general_chat"] is True
    assert spec.config["backend"]["root_dir"] == tmp_path.as_posix()


async def test_general_chat_legacy_preserves_profile_and_config(catalog: ExpertCatalog) -> None:
    row = _row()
    registry = _registry([row])
    result = await ensure_default_chat_agent(registry, catalog, user_id=4)
    assert result is row
    registry.create.assert_not_awaited()
    registry.start.assert_not_awaited()
    registry.persist_harness_config.assert_called_once_with(
        row.agent_id, {**json.loads(row.config_json), "general_chat": True}
    )
    assert result.name == "My general assistant"
    assert result.system_prompt == "Keep my instructions"
    assert result.default_model == "openai/my-model"


async def test_general_chat_prefers_marked_over_legacy_main(catalog: ExpertCatalog) -> None:
    marked = _row("marked", config_json='{"general_chat":true}')
    registry = _registry([_row("main"), marked])
    result = await ensure_default_chat_agent(registry, catalog, user_id=4)
    assert result is marked
    registry.persist_harness_config.assert_not_called()


async def test_general_chat_legacy_main_then_oldest(catalog: ExpertCatalog) -> None:
    first = _row("first", created_at=1)
    main = _row("main", created_at=2)
    registry = _registry([first, main])
    assert await ensure_default_chat_agent(registry, catalog, user_id=4) is main
    registry = _registry([_row("newer", created_at=3), first])
    assert await ensure_default_chat_agent(registry, catalog, user_id=4) is first


@pytest.mark.parametrize("changes", [{"user_id": 9}, {"is_shared": 1}, {"kind": "team"}])
async def test_general_chat_never_reuses_foreign_shared_or_team(
    catalog: ExpertCatalog, changes: dict
) -> None:
    row = _row("main", config_json='{"general_chat":true}', **changes)
    registry = _registry([row])
    result = await ensure_default_chat_agent(registry, catalog, user_id=4)
    assert result.agent_id == "new-general"
    registry.create.assert_awaited_once()
    registry.persist_harness_config.assert_not_called()


@pytest.mark.parametrize("code", [ErrorCode.AGENT_NOT_RUNNING, ErrorCode.AGENT_FAILED])
async def test_general_chat_starts_existing_unavailable_runtime(
    catalog: ExpertCatalog, code: ErrorCode
) -> None:
    row = _row(config_json='{"general_chat":true}', last_state="stopped")
    registry = _registry([row])
    registry.get_agent.side_effect = [OctopError(code, "not available"), object()]
    assert await ensure_default_chat_agent(registry, catalog, user_id=4) is row
    registry.start.assert_awaited_once_with(row.agent_id)


async def test_general_chat_failed_start_is_reported(catalog: ExpertCatalog) -> None:
    registry = _registry([])
    registry.get_agent.side_effect = OctopError(ErrorCode.AGENT_FAILED, "no models configured")
    with pytest.raises(OctopError) as caught:
        await ensure_default_chat_agent(registry, catalog, user_id=4)
    assert caught.value.code == ErrorCode.AGENT_FAILED


async def test_general_chat_manager_serializes_concurrent_requests(catalog: ExpertCatalog) -> None:
    rows: list[AgentRow] = []
    registry = _registry(rows)
    registry._default_chat_locks = {}
    registry._expert_catalog = catalog

    async def create(spec):
        await asyncio.sleep(0)
        row = _row("allocated", config_json=json.dumps(spec.config))
        rows.append(row)
        return row

    registry.create.side_effect = create
    results = await asyncio.gather(
        *[AgentManager.ensure_default_chat_agent(registry, 4) for _ in range(6)]
    )
    assert {row.agent_id for row in results} == {"allocated"}
    registry.create.assert_awaited_once()
    assert set(registry._default_chat_locks) == {4}
