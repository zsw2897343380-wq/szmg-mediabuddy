import { act, renderHook, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { notifySkillsUpdated } from "../../../utils/skillsEvents";
import { skillPackagesApi } from "../../../api/modules/skillPackages";
import { useSkills } from "./useSkills";

const state = vi.hoisted(() => ({
  request: vi.fn(),
  app: { modal: {}, message: { warning: vi.fn() } },
  t: (key: string) => key,
}));

vi.mock("../../../api/request", () => ({
  request: state.request,
  requestBlob: vi.fn(),
}));
vi.mock("antd", () => ({ App: { useApp: () => state.app } }));
vi.mock("react-i18next", () => ({ useTranslation: () => ({ t: state.t }) }));

beforeEach(() => {
  state.request.mockReset();
});

describe("unified library updates", () => {
  it("refreshes chat after an individual install has finished updating the runtime", async () => {
    let finishInstall!: (value: unknown) => void;
    const installation = new Promise((resolve) => {
      finishInstall = resolve;
    });
    let installed = false;
    state.request.mockImplementation((path: string) => {
      if (path === "/skill-packages/library/package/skills/reader") {
        return installation;
      }
      return Promise.resolve(
        installed
          ? [{ slug: "reader", name: "Reader", enabled: true, kind: "package" }]
          : [],
      );
    });
    const { result } = renderHook(() => useSkills("my-agent"));
    await waitFor(() => expect(result.current.loading).toBe(false));
    const pending = skillPackagesApi.updateSkillLibrary(
      "package",
      "reader",
      true,
    );
    expect(state.request).toHaveBeenCalledTimes(2);
    expect(result.current.skills).toEqual([]);
    await act(async () => {
      installed = true;
      finishInstall({
        skill_states: {
          package: { reader: { installed: true, enabled: true } },
        },
      });
      await pending;
    });
    await waitFor(() =>
      expect(result.current.skills.map((skill) => skill.slug)).toEqual([
        "reader",
      ]),
    );
    expect(state.request).toHaveBeenLastCalledWith("/agents/my-agent/skills", {
      cache: "no-store",
    });
  });

  it("refreshes a mounted chat skill catalog when a library update succeeds", async () => {
    state.request.mockResolvedValueOnce([]);
    const { result, unmount } = renderHook(() => useSkills("my-agent"));
    await waitFor(() => expect(state.request).toHaveBeenCalledTimes(1));
    await waitFor(() => expect(result.current.loading).toBe(false));
    state.request.mockResolvedValueOnce([
      { slug: "reader", name: "Reader", enabled: true, kind: "package" },
    ]);
    act(() => notifySkillsUpdated());
    await waitFor(() =>
      expect(result.current.skills.map((skill) => skill.slug)).toEqual([
        "reader",
      ]),
    );
    state.request.mockResolvedValueOnce([]);
    act(() => notifySkillsUpdated());
    await waitFor(() => expect(result.current.skills).toEqual([]));
    expect(state.request).toHaveBeenCalledTimes(3);
    unmount();
    act(() => notifySkillsUpdated());
    expect(state.request).toHaveBeenCalledTimes(3);
  });
});
