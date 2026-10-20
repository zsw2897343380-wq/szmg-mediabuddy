import { act, renderHook, waitFor } from "@testing-library/react";
import type { ReactNode } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { AgentProvider, useAgent, type OctopAgent } from "./AgentContext";

const mocks = vi.hoisted(() => ({ list: vi.fn(), setActiveAgentId: vi.fn() }));
vi.mock("../api/modules/agent", () => ({ agentApi: { list: mocks.list } }));
vi.mock("../api/modules/bridge", () => ({
  bridgeApi: { list: async () => [] },
}));
vi.mock("../api/request", () => ({ setActiveAgentId: mocks.setActiveAgentId }));

function agent(id: string): OctopAgent {
  return {
    id: 1,
    agent_id: id,
    name: id,
    description: "Old role",
    system_prompt: "Old responsibilities",
    persona_mbti: null,
    default_model: null,
    template_name: null,
    state: "running",
    last_error: null,
    icon: null,
    icon_name: null,
    icon_url: null,
    color: null,
    config: {},
  };
}
function wrapper({ children }: { children: ReactNode }) {
  return <AgentProvider>{children}</AgentProvider>;
}
beforeEach(() => {
  vi.clearAllMocks();
  localStorage.clear();
  mocks.list.mockResolvedValue([agent("A"), agent("B")]);
});

describe("agent refresh during browser workflows", () => {
  it("updates saved assistant role and responsibilities immediately", async () => {
    const { result } = renderHook(() => useAgent(), { wrapper });
    await waitFor(() => expect(result.current.loading).toBe(false));
    mocks.list.mockResolvedValue([
      {
        ...agent("A"),
        description: "New role",
        system_prompt: "New responsibilities",
      },
      agent("B"),
    ]);
    await act(() => result.current.refresh());
    expect(result.current.agents[0].description).toBe("New role");
    expect(result.current.agents[0].system_prompt).toBe("New responsibilities");
  });

  it("keeps this tab's selected expert when another tab changes the saved preference", async () => {
    const { result } = renderHook(() => useAgent(), { wrapper });
    await waitFor(() => expect(result.current.loading).toBe(false));
    act(() => result.current.setActiveAgent("B"));
    localStorage.setItem("octop:active-agent", "A");
    await act(() => result.current.refresh({ silent: true }));
    expect(result.current.activeAgentId).toBe("B");
    expect(mocks.setActiveAgentId).toHaveBeenLastCalledWith("B");
  });

  it("falls back when the selected expert is no longer available", async () => {
    const { result } = renderHook(() => useAgent(), { wrapper });
    await waitFor(() => expect(result.current.loading).toBe(false));
    act(() => result.current.setActiveAgent("B"));
    mocks.list.mockResolvedValue([agent("A")]);
    await act(() => result.current.refresh({ silent: true }));
    expect(result.current.activeAgentId).toBe("A");
  });
});
