import pytest
from langchain.agents.middleware import ModelRequest
from langchain_anthropic import ChatAnthropic
from langchain_core.messages import SystemMessage
from langchain_openai import ChatOpenAI

from octop.i18n import tr
from octop.infra.agents.middleware import reasoning


def test_reasoning_middleware_updates_openai_field_and_extra_body(monkeypatch) -> None:
    monkeypatch.setattr(
        reasoning,
        "get_config",
        lambda: {
            "configurable": {
                reasoning.CONFIG_KEY: {
                    "model_fields": {"reasoning_effort": "high"},
                    "extra_body": {"thinking": {"type": "enabled"}},
                }
            }
        },
    )
    model = ChatOpenAI(model="gpt-5.4", api_key="test")
    request = ModelRequest(model=model, messages=[])

    configured = reasoning._configured_request(request)

    assert configured.model is not model
    assert configured.model.reasoning_effort == "high"
    assert configured.model.extra_body == {"thinking": {"type": "enabled"}}


@pytest.mark.parametrize("locale", [None, "zh", "en"])
@pytest.mark.asyncio
async def test_language_instruction_preserves_system_blocks_and_model_overrides(
    monkeypatch, locale
) -> None:
    monkeypatch.setattr(
        reasoning,
        "get_config",
        lambda: {
            "configurable": {
                "locale": locale,
                reasoning.CONFIG_KEY: {"model_fields": {"reasoning_effort": "high"}},
            }
        },
    )
    original = SystemMessage(
        content=[{"type": "text", "text": "Expert instructions"}], additional_kwargs={"cache": True}
    )
    request = ModelRequest(
        model=ChatOpenAI(model="gpt-5.4", api_key="test"), messages=[], system_message=original
    )
    captured = []

    def handler(configured):
        captured.append(configured)
        return configured

    async def ahandler(configured):
        return handler(configured)

    middleware = reasoning.ReasoningRequestMiddleware()
    middleware.wrap_model_call(request, handler)
    await middleware.awrap_model_call(request, ahandler)
    for configured in captured:
        assert configured.model.reasoning_effort == "high"
        assert configured.system_message.content == [
            {"type": "text", "text": "Expert instructions"},
            {"type": "text", "text": tr("agents.output_language_instruction", locale or "zh")},
        ]
        assert configured.system_message.additional_kwargs == {"cache": True}
    assert original.content == [{"type": "text", "text": "Expert instructions"}]


@pytest.mark.parametrize("prompt", [None, "Expert instructions"])
def test_language_instruction_applies_without_reasoning_override(monkeypatch, prompt) -> None:
    monkeypatch.setattr(reasoning, "get_config", lambda: {"configurable": {"locale": "zh"}})
    request = ModelRequest(
        model=ChatOpenAI(model="gpt-5.4", api_key="test"), messages=[], system_prompt=prompt
    )
    configured = reasoning._localized_request(request)
    assert isinstance(configured.system_message.content, str)
    assert tr("agents.output_language_instruction", "zh") in configured.system_message.text
    if prompt:
        assert prompt in configured.system_message.text


def test_reasoning_middleware_updates_native_anthropic_fields(monkeypatch) -> None:
    monkeypatch.setattr(
        reasoning,
        "get_config",
        lambda: {
            "configurable": {
                reasoning.CONFIG_KEY: {
                    "model_fields": {
                        "thinking": {"type": "adaptive"},
                        "reasoning_effort": "high",
                    }
                }
            }
        },
    )
    model = ChatAnthropic(model="claude-opus-4-6", api_key="test", max_tokens=1024)
    request = ModelRequest(model=model, messages=[])

    configured = reasoning._configured_request(request)

    assert configured.model.thinking == {"type": "adaptive"}
    assert configured.model.reasoning_effort == "high"
