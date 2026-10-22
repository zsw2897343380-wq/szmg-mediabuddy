import asyncio
from unittest.mock import AsyncMock, Mock

import pytest
from langchain_core.messages import ToolMessage
from langgraph.prebuilt.tool_node import ToolCallRequest
from mcp.shared.exceptions import McpError
from mcp.types import ErrorData

from octop.infra.agents.middleware import mcp_errors


def request(name: str, call_id: str) -> ToolCallRequest:
    return ToolCallRequest(
        tool_call={"name": name, "args": {}, "id": call_id},
        tool=None,
        state={},
        runtime=None,  # type: ignore[arg-type]
    )


@pytest.mark.parametrize("locale,expected", [("zh", "远端 MCP 服务"), ("en", "remote MCP service")])
@pytest.mark.parametrize("synchronous", [True, False])
@pytest.mark.asyncio
async def test_protocol_error_becomes_localized_tool_failure(
    monkeypatch, caplog, locale, expected, synchronous
) -> None:
    monkeypatch.setattr(
        mcp_errors,
        "get_config",
        lambda: {"configurable": {"locale": locale, "thread_id": "thread-1"}},
    )
    error = McpError(ErrorData(code=-32603, message="Internal error"))
    middleware = mcp_errors.McpErrorsMiddleware(agent_id="agent-1")
    req = request("szmg-media_list_dubbing_timbres", "call-1")
    if synchronous:
        handler = Mock(side_effect=error)
        result = middleware.wrap_tool_call(req, handler)
    else:
        handler = AsyncMock(side_effect=error)
        result = await middleware.awrap_tool_call(req, handler)
    assert isinstance(result, ToolMessage)
    assert result.status == "error"
    assert result.tool_call_id == "call-1"
    assert result.name == "szmg-media_list_dubbing_timbres"
    assert expected in result.content
    assert "-32603" in result.content
    assert "Internal error" in result.content
    assert "agent=agent-1 thread=thread-1" in caplog.text
    assert "tool=szmg-media_list_dubbing_timbres" in caplog.text
    assert caplog.records[-1].exc_info is not None
    handler.assert_called_once_with(req)


@pytest.mark.asyncio
async def test_parallel_success_survives_other_mcp_failure(monkeypatch) -> None:
    monkeypatch.setattr(mcp_errors, "get_config", lambda: {"configurable": {}})
    middleware = mcp_errors.McpErrorsMiddleware(agent_id="agent-1")
    success = ToolMessage(content='{"total":21}', tool_call_id="call-good")
    good, bad = await asyncio.gather(
        middleware.awrap_tool_call(
            request("szmg-media_list_digital_humans", "call-good"),
            AsyncMock(return_value=success),
        ),
        middleware.awrap_tool_call(
            request("szmg-media_list_dubbing_timbres", "call-bad"),
            AsyncMock(side_effect=McpError(ErrorData(code=-32603, message="Internal error"))),
        ),
    )
    assert good is success
    assert bad.status == "error"


@pytest.mark.parametrize("error", [RuntimeError("programming failure"), asyncio.CancelledError()])
@pytest.mark.asyncio
async def test_unrelated_errors_and_cancellation_propagate(error) -> None:
    middleware = mcp_errors.McpErrorsMiddleware(agent_id="agent-1")
    with pytest.raises(type(error)):
        await middleware.awrap_tool_call(
            request("read_file", "call-1"), AsyncMock(side_effect=error)
        )
