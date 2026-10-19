import { App } from "antd";
import {
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import { MemoryRouter, Route, Routes, useLocation } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type {
  ConnectorCatalogEntry,
  ConnectorInstance,
} from "../../../api/modules/connectors";
import {
  peekPendingAttachConnector,
  consumePendingAttachConnector,
} from "../../Chat/utils/pendingAttachConnector";
import { ConnectorCenter } from "./ConnectorCenter";

const mocks = vi.hoisted(() => ({
  patch: vi.fn(),
  test: vi.fn(),
  remove: vi.fn(),
  refresh: vi.fn(),
  configure: vi.fn(),
  agents: [
    { agent_id: "a", name: "A", state: "running", config: {}, is_owner: true },
  ],
}));
vi.mock("../../../api/modules/connectors", () => ({
  connectorsApi: {
    patchInstance: mocks.patch,
    testInstance: mocks.test,
    deleteInstance: mocks.remove,
  },
}));
vi.mock("../../../context/AgentContext", () => ({
  useAgent: () => ({
    activeAgentId: "a",
    agents: mocks.agents,
  }),
}));
vi.mock("../../../hooks/useCurrentUser", () => ({
  useCurrentUser: () => ({ id: 1 }),
}));
vi.mock("./CustomMcpTab", () => ({
  CustomMcpTab: () => <div>custom-editor</div>,
}));

const catalog = [
  {
    kind: "notion",
    name: "Notion",
    description: "Read documents",
    phase: "available",
    category: "knowledge",
    icon: "notion",
  },
  {
    kind: "github",
    name: "GitHub",
    description: "Read code",
    phase: "available",
    category: "productivity",
    icon: "github",
  },
] as ConnectorCatalogEntry[];
const instance = {
  instance_id: "n",
  kind: "notion",
  display_name: "My Notion",
  description: "Notes",
  status: "active",
  has_credentials: true,
  mcp_server_name: "my-notion",
  can_manage: true,
  owner_user_id: 1,
  shared: false,
} as ConnectorInstance;
function LocationProbe() {
  const location = useLocation();
  return <output>{location.pathname}</output>;
}
function setup(overrides: Partial<ConnectorInstance> = {}) {
  render(
    <App>
      <MemoryRouter>
        <Routes>
          <Route
            path="/"
            element={
              <ConnectorCenter
                catalog={catalog}
                instances={[{ ...instance, ...overrides }]}
                loading={false}
                onRefresh={mocks.refresh}
                onConfigure={mocks.configure}
              />
            }
          />
          <Route path="/chat/:agent" element={<LocationProbe />} />
        </Routes>
      </MemoryRouter>
    </App>,
  );
}
beforeEach(() => {
  vi.clearAllMocks();
  consumePendingAttachConnector("a");
  consumePendingAttachConnector("owned");
  mocks.agents = [
    { agent_id: "a", name: "A", state: "running", config: {}, is_owner: true },
  ];
  mocks.patch.mockResolvedValue({});
  mocks.refresh.mockResolvedValue(undefined);
  mocks.test.mockResolvedValue({
    ok: true,
    tools: [{ name: "read_notes", description: "Read notes" }],
  });
});

describe("connector center", () => {
  it("merges installed and available connectors, searches, and connects through the real configuration callback", () => {
    setup();
    expect(screen.queryByText("Notion")).not.toBeInTheDocument();
    expect(screen.getByText("My Notion")).toBeVisible();
    fireEvent.change(
      screen.getByRole("textbox", { name: "connectorCenter.search" }),
      { target: { value: "code" } },
    );
    expect(screen.queryByText("My Notion")).not.toBeInTheDocument();
    fireEvent.click(
      screen.getByRole("button", { name: "connectorCenter.connectNamed" }),
    );
    expect(mocks.configure).toHaveBeenCalledWith(catalog[1], null);
  });
  it("loads actual tools only on request and persists the enable switch", async () => {
    setup();
    fireEvent.click(screen.getByText("My Notion"));
    const dialog = await screen.findByRole("dialog");
    expect(mocks.test).not.toHaveBeenCalled();
    fireEvent.click(
      within(dialog).getByRole("button", { name: "connectorCenter.tools" }),
    );
    await waitFor(() => expect(screen.getByText("read_notes")).toBeVisible());
    expect(mocks.test).toHaveBeenCalledWith("n");
    fireEvent.click(
      within(dialog).getByRole("switch", { name: "connectorCenter.enable" }),
    );
    await waitFor(() =>
      expect(mocks.patch).toHaveBeenCalledWith("n", { status: "disabled" }),
    );
    expect(mocks.refresh).toHaveBeenCalled();
  });
  it("does not expose management on shared read-only connections", async () => {
    setup({ can_manage: false, owner_user_id: 2, shared: true });
    fireEvent.click(screen.getByText("My Notion"));
    const dialog = await screen.findByRole("dialog");
    expect(within(dialog).queryByRole("switch")).not.toBeInTheDocument();
    expect(
      within(dialog).queryByRole("button", { name: "connectorCenter.manage" }),
    ).not.toBeInTheDocument();
  });
  it("retries a failed tool probe directly from the error action", async () => {
    mocks.test.mockRejectedValueOnce(new Error("Probe unavailable"));
    setup();
    fireEvent.click(screen.getByText("My Notion"));
    const dialog = await screen.findByRole("dialog");
    fireEvent.click(
      within(dialog).getByRole("button", { name: "connectorCenter.tools" }),
    );
    fireEvent.click(
      await within(dialog).findByRole("button", { name: "common.retry" }),
    );
    await waitFor(() => expect(screen.getByText("read_notes")).toBeVisible());
    expect(mocks.test).toHaveBeenCalledTimes(2);
  });
  it("tries a connector by preparing a new chat without sending a message", async () => {
    setup();
    fireEvent.click(
      screen.getByRole("button", { name: "connectorCenter.tryNamed" }),
    );
    expect(await screen.findByText("/chat/a")).toBeVisible();
    expect(peekPendingAttachConnector("a")).toBe("my-notion");
    expect(peekPendingAttachConnector("another-agent")).toBeNull();
  });
  it("uses an owned assistant when the active shared assistant has a different connector owner", async () => {
    mocks.agents = [
      {
        agent_id: "a",
        name: "Shared",
        state: "running",
        config: {},
        is_owner: false,
      },
      {
        agent_id: "owned",
        name: "Mine",
        state: "running",
        config: {},
        is_owner: true,
      },
    ];
    setup();
    fireEvent.click(
      screen.getByRole("button", { name: "connectorCenter.tryNamed" }),
    );
    expect(await screen.findByText("/chat/owned")).toBeVisible();
    expect(peekPendingAttachConnector("owned")).toBe("my-notion");
    expect(peekPendingAttachConnector("a")).toBeNull();
  });
});
