"""Bootstrap a first default agent (general-assistant) for a user.

Used by the setup wizard (pinned ``agent_id=main``) and by invite redeem
(auto-allocated agent id) so every new account starts with the same expert.
"""

from __future__ import annotations

import logging
from typing import Any, cast

from octop.infra.agents.experts.catalog import ExpertCatalog, build_create_spec_from_expert
from octop.infra.agents.settings.profile import parse_config_json
from octop.infra.agents.teams import is_team_agent
from octop.infra.db.repos.agents import AgentRow
from octop.infra.errors import ErrorCode, OctopError
from octop.infra.users.resource_policy import (
    POLICY_WORKSPACE_ROOT_DIR,
    effective_workspace_root_dir,
)
from octop.infra.utils.host_dirs import host_fs_tree_root
from octop.infra.utils.locale import normalize_locale

logger = logging.getLogger(__name__)

DEFAULT_EXPERT_ID = "general-assistant"
SETUP_DEFAULT_AGENT_ID = "main"


def default_home_local_backend(*, root_dir: str | None = None) -> dict[str, Any]:
    """Same local backend as the dashboard create-from-expert default.

    Defaults to host filesystem root; pass *root_dir* when a user
    ``workspace_root_dir`` policy applies.
    """
    resolved = (root_dir or "").strip() or host_fs_tree_root()
    return {
        "type": "local_shell",
        "root_dir": resolved,
        "virtual_mode": True,
    }


def user_policy_workspace_root(server: Any, user_id: int) -> str | None:
    """Effective ``workspace_root_dir`` policy for *user_id*, or ``None``."""
    return effective_workspace_root_dir(
        server.services.user_policy_repo.get(user_id, POLICY_WORKSPACE_ROOT_DIR)
    )


async def bootstrap_default_agent(
    registry: Any,
    catalog: ExpertCatalog | None,
    *,
    user_id: int,
    locale: str = "zh",
    agent_id: str | None = None,
    root_dir: str | None = None,
) -> Any | None:
    """Create ``general-assistant`` for *user_id* when they have no agents yet.

    Returns the created agent row, or ``None`` when skipped (user already has
    agents, or ``main`` already exists when *agent_id* is ``main``).
    """
    if agent_id == SETUP_DEFAULT_AGENT_ID and registry.get_row(SETUP_DEFAULT_AGENT_ID) is not None:
        return None
    if registry.list_agents(user_id):
        return None
    if catalog is None:
        raise OctopError(ErrorCode.INTERNAL_ERROR, "expert catalog not available")
    expert = catalog.get(DEFAULT_EXPERT_ID)
    if expert is None:
        raise OctopError(
            ErrorCode.INTERNAL_ERROR,
            f"{DEFAULT_EXPERT_ID} expert template missing",
        )
    loc = normalize_locale(locale)
    spec = build_create_spec_from_expert(
        expert_id=DEFAULT_EXPERT_ID,
        expert=expert,
        user_id=user_id,
        agent_id=agent_id,
        locale=loc,
        config_extra={
            "backend": default_home_local_backend(root_dir=root_dir),
            "general_chat": True,
        },
    )
    return await registry.create(spec, defer_bootstrap=True)


async def ensure_default_chat_agent(
    registry: Any,
    catalog: ExpertCatalog | None,
    *,
    user_id: int,
    locale: str = "zh",
    root_dir: str | None = None,
) -> AgentRow:
    """Resolve a private general runtime independently of installed experts.

    The manager serializes this operation per user. Legacy bootstrap instances
    retain their profile, workspace, model, and all existing configuration.
    """
    user_rows = registry.list_agents(user_id, include_disabled=True)
    owned = [
        row
        for row in user_rows
        if row.user_id == user_id and row.enabled and not row.is_shared and not is_team_agent(row)
    ]
    marked = [
        row for row in owned if parse_config_json(row.config_json).get("general_chat") is True
    ]
    legacy = [row for row in owned if row.template_name == DEFAULT_EXPERT_ID]
    candidates = marked or legacy
    if candidates:
        row = min(
            candidates,
            key=lambda candidate: (
                candidate.agent_id != SETUP_DEFAULT_AGENT_ID,
                candidate.created_at,
                candidate.agent_id,
            ),
        )
        config = parse_config_json(row.config_json)
        if config.get("general_chat") is not True:
            registry.persist_harness_config(row.agent_id, {**config, "general_chat": True})
        try:
            registry.get_agent(row.agent_id)
        except OctopError as exc:
            if exc.code not in {ErrorCode.AGENT_FAILED, ErrorCode.AGENT_NOT_RUNNING}:
                raise
            await registry.start(row.agent_id)
    else:
        if catalog is None:
            raise OctopError(ErrorCode.INTERNAL_ERROR, "expert catalog not available")
        expert = catalog.get(DEFAULT_EXPERT_ID)
        if expert is None:
            raise OctopError(
                ErrorCode.INTERNAL_ERROR, f"{DEFAULT_EXPERT_ID} expert template missing"
            )
        spec = build_create_spec_from_expert(
            expert_id=DEFAULT_EXPERT_ID,
            expert=expert,
            user_id=user_id,
            locale=normalize_locale(locale),
            config_extra={
                "backend": default_home_local_backend(root_dir=root_dir),
                "general_chat": True,
            },
        )
        used_names = {row.name for row in user_rows if row.user_id == user_id}
        base_name = spec.name
        suffix = 2
        while spec.name in used_names:
            spec.name = f"{base_name} ({suffix})"
            suffix += 1
        row = await registry.create(spec)
    # Startup may persist a failed state instead of raising (e.g. no model).
    registry.get_agent(row.agent_id)
    return cast(AgentRow, registry.get_row(row.agent_id) or row)


async def try_bootstrap_default_agent(
    server: Any,
    *,
    user_id: int,
    locale: str = "zh",
    agent_id: str | None = None,
) -> None:
    """Best-effort wrapper used by HTTP adapters (setup / invite)."""
    if server.app_runtime is None:
        logger.warning("skip default agent bootstrap: app_runtime not ready")
        return
    try:
        await bootstrap_default_agent(
            server.app_runtime.agent_registry,
            server.expert_catalog,
            user_id=user_id,
            locale=locale,
            agent_id=agent_id,
            root_dir=user_policy_workspace_root(server, user_id),
        )
    except Exception as exc:  # pragma: no cover - logged; user creation should still succeed
        logger.warning("could not auto-create default agent for user %s: %s", user_id, exc)
