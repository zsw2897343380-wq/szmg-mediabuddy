"""Execution authorization shared by dashboard and external expert callers."""

from typing import Any

from octop.infra.agents.settings.profile import parse_config_json
from octop.infra.errors import ErrorCode, OctopError
from octop.infra.users.permissions import user_has_permission


def assert_expert_use(user: Any, row: Any) -> None:
    if user.is_admin:
        return
    config = parse_config_json(getattr(row, "config_json", None))
    if (
        row.user_id == user.id
        and getattr(row, "template_name", None) == "general-assistant"
        and config.get("general_chat") is True
    ):
        allowed = user_has_permission(user, "chat.use")
    else:
        allowed = any(user_has_permission(user, key) for key in ("experts.use", "assistants.use"))
    if not allowed:
        raise OctopError(ErrorCode.FORBIDDEN, "expert use permission required")
