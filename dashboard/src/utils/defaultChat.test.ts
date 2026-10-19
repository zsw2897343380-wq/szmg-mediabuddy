import { describe, expect, it } from "vitest";
import { isDefaultChatAgent } from "./defaultChat";

describe("general chat runtime identity", () => {
  it("recognizes a marked runtime independently of its id", () => {
    expect(
      isDefaultChatAgent({
        agent_id: "user-2-runtime",
        config: { general_chat: true },
      }),
    ).toBe(true);
  });
  it("recognizes the legacy setup assistant without hiding custom specialists", () => {
    expect(
      isDefaultChatAgent({
        agent_id: "main",
        template_name: "general-assistant",
      }),
    ).toBe(true);
    expect(
      isDefaultChatAgent({
        agent_id: "custom",
        template_name: "general-assistant",
      }),
    ).toBe(false);
    expect(
      isDefaultChatAgent({ agent_id: "main", template_name: "medical" }),
    ).toBe(false);
    expect(
      isDefaultChatAgent({
        agent_id: "main",
        template_name: "general-assistant",
        bridge: true,
      }),
    ).toBe(false);
    expect(isDefaultChatAgent(null)).toBe(false);
  });
});
