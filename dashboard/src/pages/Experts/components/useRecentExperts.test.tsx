import { act, renderHook, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { OctopAgent } from "../../../context/AgentContext";
import type { OctopThread } from "../../../api/modules/octopThreads";
import { latestExpertActivity, useRecentExperts } from "./useRecentExperts";

const mocks = vi.hoisted(() => ({ list: vi.fn() }));
vi.mock("../../../api/modules/octopThreads", () => ({
  octopThreadsApi: { list: mocks.list },
}));
const agent = (id: string, extra = {}) =>
  ({ agent_id: id, kind: "expert", ...extra }) as OctopAgent;
const thread = (last_active: number, extra = {}) =>
  ({ last_active, has_messages: true, ...extra }) as OctopThread;

beforeEach(() => {
  vi.clearAllMocks();
});

describe("real recent expert activity", () => {
  it("takes the newest real activity rather than the first pinned or empty thread", () => {
    expect(
      latestExpertActivity([
        thread(10, { pinned: true }),
        thread(90),
        thread(500, { has_messages: false }),
        thread(0),
        thread(NaN),
      ]),
    ).toBe(90);
    expect(
      latestExpertActivity([
        thread(0),
        thread(-1),
        thread(100, { has_messages: false }),
      ]),
    ).toBeNull();
  });

  it("shows only three experts with observed activity, omitting empty, team and remote experts", async () => {
    const agents = [
      agent("one"),
      agent("two"),
      agent("three"),
      agent("four"),
      agent("empty"),
      agent("remote", { bridge: true }),
      agent("team", { kind: "team" }),
    ];
    mocks.list.mockImplementation(
      async (id: string) =>
        ({
          one: [thread(10)],
          two: [thread(20)],
          three: [thread(30)],
          four: [thread(40)],
          empty: [thread(0)],
        })[id as "one"],
    );
    const { result } = renderHook(() => useRecentExperts(agents, true));
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.recent.map((item) => item.agent_id)).toEqual([
      "four",
      "three",
      "two",
    ]);
    expect(mocks.list).toHaveBeenCalledTimes(5);
    expect(mocks.list).toHaveBeenCalledWith("one", 1, "activity");
  });

  it("rejects an old request that finishes after the visible expert set changes", async () => {
    let resolveOld!: (rows: OctopThread[]) => void;
    mocks.list.mockImplementation((id: string) =>
      id === "old"
        ? new Promise<OctopThread[]>((resolve) => {
            resolveOld = resolve;
          })
        : Promise.resolve([thread(20)]),
    );
    const { result, rerender } = renderHook(
      ({ agents }) => useRecentExperts(agents, true),
      { initialProps: { agents: [agent("old")] } },
    );
    rerender({ agents: [agent("new")] });
    await waitFor(() =>
      expect(result.current.recent.map((item) => item.agent_id)).toEqual([
        "new",
      ]),
    );
    await act(async () => {
      resolveOld([thread(100)]);
    });
    expect(result.current.recent.map((item) => item.agent_id)).toEqual(["new"]);
  });

  it("does not apply a request after leaving the recent tab", async () => {
    let resolve!: (rows: OctopThread[]) => void;
    const agents = [agent("one")];
    mocks.list.mockReturnValue(
      new Promise<OctopThread[]>((done) => {
        resolve = done;
      }),
    );
    const { result, rerender } = renderHook(
      ({ enabled }) => useRecentExperts(agents, enabled),
      { initialProps: { enabled: true } },
    );
    rerender({ enabled: false });
    await act(async () => {
      resolve([thread(100)]);
    });
    expect(result.current.recent).toEqual([]);
    expect(result.current.loading).toBe(false);
  });

  it("reports partial failures without replacing missing activity with invented dates", async () => {
    mocks.list.mockRejectedValue(new Error("unavailable"));
    const agents = [agent("one")];
    const { result } = renderHook(() => useRecentExperts(agents, true));
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.failed).toBe(true);
    expect(result.current.recent).toEqual([]);
  });
});
