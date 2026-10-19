import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { App } from "antd";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { MemoryRouter, useLocation } from "react-router-dom";
import type { OctopAgent } from "../../context/AgentContext";
import AssistantsPage, { personalAssistants } from "./index";

const mocks = vi.hoisted(() => ({
  agents: [] as OctopAgent[],
  list: vi.fn(),
  removeThread: vi.fn(),
  refresh: vi.fn(),
  setActiveAgent: vi.fn(),
  togglePin: vi.fn(),
  removeAssistant: vi.fn(),
  setRunning: vi.fn(),
}));
vi.mock("../../context/AgentContext", () => ({
  useAgent: () => ({
    agents: mocks.agents,
    loading: false,
    error: null,
    refresh: mocks.refresh,
    setActiveAgent: mocks.setActiveAgent,
  }),
}));
vi.mock("../../hooks/useCurrentUser", () => ({
  useCurrentUser: () => ({ id: 7, role: "admin" }),
}));
vi.mock("../../hooks/useServerTimezone", () => ({
  useServerTimezone: () => "Asia/Shanghai",
}));
vi.mock("../Chat/hooks/usePinnedExperts", () => ({
  usePinnedExperts: () => ({
    pinnedIds: [],
    togglePin: mocks.togglePin,
    isPinned: () => false,
  }),
}));
vi.mock("../../api/modules/octopThreads", () => ({
  octopThreadsApi: { list: mocks.list, delete: mocks.removeThread },
}));
vi.mock("../../api/modules/assistants", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../../api/modules/assistants")>()),
  assistantsApi: {
    remove: mocks.removeAssistant,
    setRunning: mocks.setRunning,
  },
}));
vi.mock("../Chat/components/ExpertAgentAvatar", () => ({
  default: () => <span />,
}));
vi.mock("./AssistantForm", () => ({ default: () => null }));
vi.mock("react-i18next", () => {
  const t = (key: string) => key;
  return { useTranslation: () => ({ t }) };
});
function agent(id: string, fields: Partial<OctopAgent> = {}): OctopAgent {
  return {
    id: 1,
    agent_id: id,
    name: id,
    user_id: 7,
    is_owner: true,
    kind: "expert",
    state: "running",
    config: {},
    description: "分析资料",
    system_prompt: "核验数据",
    ...fields,
  } as OctopAgent;
}
function Location() {
  const location = useLocation();
  return (
    <output data-testid="location">
      {JSON.stringify({ path: location.pathname, state: location.state })}
    </output>
  );
}
function mount() {
  return render(
    <App>
      <MemoryRouter initialEntries={["/assistants?agent=main"]}>
        <AssistantsPage />
        <Location />
      </MemoryRouter>
    </App>,
  );
}
beforeEach(() => {
  vi.clearAllMocks();
  mocks.agents = [
    agent("main"),
    agent("own"),
    agent("foreign", { user_id: 8, is_owner: false }),
  ];
  mocks.refresh.mockResolvedValue(undefined);
  mocks.setRunning.mockResolvedValue(undefined);
  mocks.list.mockResolvedValue([
    {
      thread_id: "past",
      title: "历史任务",
      channel_type: "dashboard",
      created_at: 1,
      last_active: 3,
      has_messages: true,
    },
    {
      thread_id: "active",
      title: "执行任务",
      channel_type: "feishu",
      created_at: 1,
      last_active: 2,
      has_messages: true,
      turn_active: true,
    },
    {
      thread_id: "approval",
      title: "确认任务",
      channel_type: "dashboard",
      created_at: 1,
      last_active: 1,
      has_messages: true,
      awaiting_user: true,
    },
    { thread_id: "blank", title: "空白任务", has_messages: false },
  ]);
});

describe("assistant workspace", () => {
  it("keeps the assistant list scoped to owned local solo runtimes", () => {
    const rows = [
      agent("own"),
      agent("team", { kind: "team" }),
      agent("remote", { bridge: true }),
      agent("foreign", { user_id: 8, is_owner: false }),
      agent("system", { user_id: null, is_owner: false }),
      agent("unknown", { user_id: undefined, is_owner: undefined }),
    ];
    expect(personalAssistants(rows, 7).map((row) => row.agent_id)).toEqual([
      "own",
    ]);
    expect(personalAssistants([rows[5]!], undefined)).toEqual([]);
  });

  it("shows actual task states, excludes empty drafts and opens a fresh chat without sending", async () => {
    mount();
    await waitFor(() =>
      expect(mocks.list).toHaveBeenCalledWith("main", 500, "activity"),
    );
    expect(screen.queryByRole("tab", { name: /foreign/ })).toBeNull();
    expect(screen.queryByRole("tab", { name: /^main/ })).toBeNull();
    expect(
      screen.getByRole("button", { name: /assistants.localAssistant/ }),
    ).toBeVisible();
    fireEvent.click(screen.getByRole("tab", { name: "assistants.tasks" }));
    expect(
      await screen.findByRole("button", { name: "历史任务" }),
    ).toBeTruthy();
    expect(screen.getByText("assistants.taskStates.history")).toBeTruthy();
    expect(screen.getByText("assistants.taskStates.running")).toBeTruthy();
    expect(screen.getByText("assistants.taskStates.waiting")).toBeTruthy();
    expect(screen.queryByText("空白任务")).toBeNull();
    expect(
      screen
        .getAllByRole("button", { name: "assistants.deleteTask" })
        .filter((button) => button.hasAttribute("disabled")),
    ).toHaveLength(2);
    fireEvent.click(screen.getByRole("button", { name: "assistants.newTask" }));
    expect(mocks.setActiveAgent).toHaveBeenCalledWith("main");
    expect(screen.getByTestId("location").textContent).toContain(
      '"state":{"newChat":true}',
    );
    expect(screen.getByTestId("location").textContent).toContain(
      '"path":"/chat/main"',
    );
  });

  it("continues the selected real thread and can stop the selected assistant", async () => {
    mount();
    fireEvent.click(screen.getByRole("button", { name: "assistants.stop" }));
    await waitFor(() =>
      expect(mocks.setRunning).toHaveBeenCalledWith("main", false),
    );
    fireEvent.click(screen.getByRole("tab", { name: "assistants.tasks" }));
    fireEvent.click(await screen.findByRole("button", { name: "历史任务" }));
    expect(screen.getByTestId("location").textContent).toContain(
      '"path":"/chat/main/past"',
    );
  });
});
