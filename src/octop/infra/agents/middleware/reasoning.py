"""Apply per-turn reasoning parameters and the user's output language."""

from __future__ import annotations

from collections.abc import Awaitable, Callable
from typing import Any

from langchain.agents.middleware import AgentMiddleware, ModelRequest, ModelResponse
from langchain_core.messages import SystemMessage
from langgraph.config import get_config

from octop.i18n import tr
from octop.infra.utils.locale import normalize_locale

CONFIG_KEY = "octop_reasoning_overrides"


def _localized_request(request: ModelRequest[Any]) -> ModelRequest[Any]:
    configurable = get_config().get("configurable") or {}
    locale = normalize_locale(configurable.get("locale"))
    instruction = tr("agents.output_language_instruction", locale)
    original = request.system_message
    if original is None:
        message = SystemMessage(content=instruction)
    else:
        content: str | list[str | dict[str, Any]]
        if isinstance(original.content, str):
            content = f"{original.content}\n\n{instruction}"
        else:
            content = [*original.content, {"type": "text", "text": instruction}]
        message = original.model_copy(update={"content": content})
    return request.override(system_message=message)


def _configured_request(request: ModelRequest[Any]) -> ModelRequest[Any]:
    configurable = dict(get_config().get("configurable") or {})
    overrides = configurable.get(CONFIG_KEY)
    if not isinstance(overrides, dict) or not overrides:
        return request
    model = request.model
    if not hasattr(model, "model_copy"):
        return request
    updates = dict(overrides.get("model_fields") or {})
    extra = overrides.get("extra_body")
    if isinstance(extra, dict) and extra and hasattr(model, "extra_body"):
        current = dict(getattr(model, "extra_body", None) or {})
        current.update(extra)
        updates["extra_body"] = current
    if not updates:
        return request
    configured = model.model_copy(update=updates)
    return request.override(model=configured)


class ReasoningRequestMiddleware(AgentMiddleware[Any, Any]):
    def wrap_model_call(
        self,
        request: ModelRequest[Any],
        handler: Callable[[ModelRequest[Any]], ModelResponse[Any]],
    ) -> ModelResponse[Any]:
        return handler(_localized_request(_configured_request(request)))

    async def awrap_model_call(
        self,
        request: ModelRequest[Any],
        handler: Callable[[ModelRequest[Any]], Awaitable[ModelResponse[Any]]],
    ) -> ModelResponse[Any]:
        return await handler(_localized_request(_configured_request(request)))


__all__ = ["CONFIG_KEY", "ReasoningRequestMiddleware"]
