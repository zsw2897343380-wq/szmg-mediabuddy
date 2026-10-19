import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { OctopAgent } from "../../../context/AgentContext";
import type { Session } from "../hooks/useSessions";
import MinimalAgentSessionNav from "./MinimalAgentSessionNav";

const mocks = vi.hoisted(() => ({
  list: vi.fn(),
  archived: {} as Record<string, Session[]>,
  pinned: [] as string[],
  working: new Set<string>(),
  patch: vi.fn(),
}));

vi.mock("../../../api/modules/octopThreads", async (original) => ({
  ...(await original<typeof import("../../../api/modules/octopThreads")>()),
  octopThreadsApi: { list: mocks.list, patch: mocks.patch, rename: vi.fn() },
}));
vi.mock("../hooks/useExpertSessionCatalog", () => ({
  useExpertSessionCatalog: () => ({
    byAgent: mocks.archived,
    loading: false,
    patch: mocks.patch,
  }),
}));
vi.mock("../hooks/usePinnedExperts", () => ({
  usePinnedExperts: () => ({
    pinnedIds: mocks.pinned,
    isPinned: () => false,
    togglePin: vi.fn(),
  }),
}));
vi.mock("../hooks/useSessionWorkIds", () => ({
  useSessionWorkIds: () => mocks.working,
}));
vi.mock("../../../hooks/useServerTimezone", () => ({
  useServerTimezone: () => "Asia/Shanghai",
}));

const agents = [
  { agent_id: "a", name: "Assistant A", state: "running", kind: "expert" },
  { agent_id: "b", name: "Assistant B", state: "running", kind: "team" },
] as OctopAgent[];
const emptySessions: Session[] = [];
const callbacks = () => ({
  onSelect: vi.fn(),
  onAgentSelect: vi.fn(),
  onNewChat: vi.fn(),
  onDeleteActive: vi.fn(),
  onRenameActive: vi.fn(),
  onPinActive: vi.fn(),
  onFork: vi.fn(),
});

describe("task navigation", () => {
  beforeEach(() => {
    mocks.list.mockImplementation(async (agentId: string) =>
      agentId === "a"
        ? [
            {
              thread_id: "same-id",
              title: "Older task",
              last_active: 100,
              pinned: true,
            },
          ]
        : [{ thread_id: "same-id", title: "Latest task", last_active: 200 }],
    );
  });

  it("lists tasks across assistants, preserves pins, and opens the correct assistant", async () => {
    const handlers = callbacks();
    render(
      <MemoryRouter>
        <MinimalAgentSessionNav
          agents={agents}
          activeId="same-id"
          activeAgentId="a"
          activeSessions={emptySessions}
          {...handlers}
        />
      </MemoryRouter>,
    );
    const pinned = await screen.findByTitle("Older task · Assistant A");
    const other = await screen.findByTitle("Latest task · Assistant B");
    expect(
      pinned.compareDocumentPosition(other) & Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();
    expect(pinned).toHaveAttribute("aria-current", "page");
    expect(other).not.toHaveAttribute("aria-current");
    fireEvent.click(other);
    expect(handlers.onSelect).toHaveBeenCalledWith("same-id", "b");
    fireEvent.keyDown(other, { key: " " });
    expect(handlers.onSelect).toHaveBeenCalledTimes(2);
  });

  it("searches tasks and assistant names without switching the active conversation", async () => {
    const handlers = callbacks();
    render(
      <MemoryRouter>
        <MinimalAgentSessionNav
          agents={agents}
          activeId="same-id"
          activeAgentId="a"
          activeSessions={emptySessions}
          {...handlers}
        />
      </MemoryRouter>,
    );
    await screen.findByTitle("Latest task · Assistant B");
    expect(screen.queryByRole("searchbox")).not.toBeInTheDocument();
    fireEvent.click(
      screen.getByRole("button", { name: "chat.searchSessions" }),
    );
    fireEvent.change(screen.getByRole("searchbox"), {
      target: { value: "Assistant B" },
    });
    await waitFor(() =>
      expect(
        screen.queryByTitle("Older task · Assistant A"),
      ).not.toBeInTheDocument(),
    );
    expect(screen.getByTitle("Latest task · Assistant B")).toBeVisible();
    expect(handlers.onSelect).not.toHaveBeenCalled();
  });
});
