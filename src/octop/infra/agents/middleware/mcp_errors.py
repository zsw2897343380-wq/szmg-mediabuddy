"""Keep remote MCP protocol errors local to their tool call."""

from __future__ import annotations

import logging
from collections.abc import Awaitable, Callable
from typing import Any

from langchain.agents.middleware import AgentMiddleware
from langchain_core.messages import ToolMessage
from langgraph.config import get_config
from langgraph.prebuilt.tool_node import ToolCallRequest
from langgraph.types import Command
from mcp.shared.exceptions import McpError

from octop.i18n import tr
from octop.infra.utils.locale import normalize_locale
from octop.infra.utils.turn_failure import log_turn_failure


class McpErrorsMiddleware(AgentMiddleware[Any, Any]):
    """Report MCP errors to the model without aborting other tools or the turn."""

    def __init__(self, *, agent_id: str) -> None:
        self.agent_id = agent_id

    def _error_result(self, request: ToolCallRequest, exc: McpError) -> ToolMessage:
        configurable = get_config().get("configurable") or {}
        tool = str(request.tool_call.get("name") or "")
        log_turn_failure(
            "tool",
            agent_id=self.agent_id,
            thread_id=str(configurable.get("thread_id") or ""),
            tool=tool,
            detail=f"MCP code={exc.error.code}: {exc.error.message}",
            exc=exc,
            level=logging.ERROR,
        )
        return ToolMessage(
            content=tr(
                "agents.mcp_tool_failed",
                normalize_locale(configurable.get("locale")),
                tool=tool,
                code=exc.error.code,
                detail=exc.error.message,
            ),
            name=tool,
            tool_call_id=str(request.tool_call.get("id") or ""),
            status="error",
        )

    def wrap_tool_call(
        self,
        request: ToolCallRequest,
        handler: Callable[[ToolCallRequest], ToolMessage | Command[Any]],
    ) -> ToolMessage | Command[Any]:
        try:
            return handler(request)
        except McpError as exc:
            return self._error_result(request, exc)

    async def awrap_tool_call(
        self,
        request: ToolCallRequest,
        handler: Callable[[ToolCallRequest], Awaitable[ToolMessage | Command[Any]]],
    ) -> ToolMessage | Command[Any]:
        try:
            return await handler(request)
        except McpError as exc:
            return self._error_result(request, exc)
