import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  assistantPayload,
  assistantsApi,
  type AssistantFormValues,
} from "./assistants";
import type { OctopAgent } from "../../context/AgentContext";
import { request } from "../request";

vi.mock("../request", () => ({ request: vi.fn() }));
const values: AssistantFormValues = {
  name: "  数字助理  ",
  role: "  数据分析  ",
  description: "  核对原始数据并交付图表。  ",
  template_name: "general-assistant",
  default_model: "",
  knowledge_base_ids: ["kb-own"],
};

beforeEach(() => vi.clearAllMocks());

describe("assistant persistence", () => {
  it("persists role, actual model instructions and reference IDs without replacing runtime configuration", async () => {
    const payload = assistantPayload(values);
    expect(payload).toEqual({
      name: "数字助理",
      description: "数据分析",
      system_prompt: "核对原始数据并交付图表。",
      default_model: null,
      template_name: "general-assistant",
      knowledge_base_ids: ["kb-own"],
    });
    await assistantsApi.update(
      {
        agent_id: "assistant/a",
        config: {
          backend: { type: "host", root_dir: "private" },
          plugins: ["existing"],
        },
      } as unknown as OctopAgent,
      values,
    );
    expect(request).toHaveBeenCalledWith("/agents/assistant%2Fa", {
      method: "PATCH",
      body: JSON.stringify(payload),
    });
    expect(payload).not.toHaveProperty("config");
  });

  it("creates a real template-backed agent and uses encoded lifecycle routes", async () => {
    await assistantsApi.create(values);
    expect(request).toHaveBeenCalledWith("/agents", {
      method: "POST",
      body: JSON.stringify(assistantPayload(values)),
    });
    await assistantsApi.setRunning("a/b", false);
    expect(request).toHaveBeenLastCalledWith("/agents/a%2Fb/stop", {
      method: "POST",
    });
    await assistantsApi.remove("a/b");
    expect(request).toHaveBeenLastCalledWith("/agents/a%2Fb", {
      method: "DELETE",
    });
  });
});
