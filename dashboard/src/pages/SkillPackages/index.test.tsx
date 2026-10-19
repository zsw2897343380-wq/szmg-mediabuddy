import type { ReactNode } from "react";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import SkillPackagesPage from "./index";

const state = vi.hoisted(() => ({
  t: (key: string) => key,
  rows: [
    {
      id: "office",
      name: "Office",
      created_by: "1",
      can_write: true,
      description: "Office skills",
      skill_count: 1,
    },
  ],
  library: {
    installed_package_ids: [] as string[],
    disabled_package_ids: [] as string[],
  },
  api: {
    list: vi.fn(),
    get: vi.fn(),
    library: vi.fn(),
    updateLibrary: vi.fn(),
    importSkill: vi.fn(),
  },
}));

const getComputedStyle = window.getComputedStyle.bind(window);

vi.mock("react-i18next", () => ({ useTranslation: () => ({ t: state.t }) }));
vi.mock("../../api/modules/skillPackages", () => ({
  skillPackagesApi: state.api,
}));
vi.mock("../../api/modules/auth", () => ({
  authApi: { me: async () => ({ id: 1, role: "admin" }) },
}));
vi.mock("../../layouts/PageShell", () => ({
  default: ({ children }: { children: ReactNode }) => children,
}));
vi.mock("../../hooks/useIsMobile", () => ({ useIsMobile: () => false }));
vi.mock("../Agent/Skills/components/SkillDrawer", () => ({
  SkillDrawer: () => null,
}));
vi.mock("../Agent/Skills/components/SkillHubTab", () => ({
  default: () => null,
}));
vi.mock("./SkillsetFromHubDrawer", () => ({
  SkillsetFromHubDrawer: () => null,
}));
vi.mock("../Agent/Skills/components/SkillImportModal", () => ({
  SkillImportModal: ({
    open,
    onImportUrl,
  }: {
    open: boolean;
    onImportUrl: (url: string) => void;
  }) =>
    open ? (
      <button onClick={() => onImportUrl("https://github.com/example/reader")}>
        confirm-url-import
      </button>
    ) : null,
}));
vi.mock("../../utils/antdMessage", () => ({
  message: { success: vi.fn(), error: vi.fn() },
}));

beforeEach(() => {
  vi.spyOn(window, "getComputedStyle").mockImplementation((element) =>
    getComputedStyle(element),
  );
  vi.clearAllMocks();
  state.library = { installed_package_ids: [], disabled_package_ids: [] };
  state.rows[0].can_write = true;
  state.api.list.mockImplementation(async () => [...state.rows]);
  state.api.get.mockImplementation(async () => ({
    ...state.rows[0],
    skills: [
      {
        slug: "reader",
        name: "Reader",
        description: "Read files",
        package_id: "office",
      },
    ],
  }));
  state.api.library.mockImplementation(async () => ({ ...state.library }));
  state.api.importSkill.mockResolvedValue({ slug: "reader" });
  state.api.updateLibrary.mockImplementation(
    async (id: string, installed: boolean, enabled = true) => {
      state.library = {
        installed_package_ids: installed ? [id] : [],
        disabled_package_ids: installed && !enabled ? [id] : [],
      };
      return { ...state.library };
    },
  );
});

afterEach(() => vi.mocked(window.getComputedStyle).mockRestore());

function setup(path = "/skills") {
  render(
    <MemoryRouter initialEntries={[path]}>
      <SkillPackagesPage unified embedded />
    </MemoryRouter>,
  );
}

describe("unified skill library", () => {
  it("installs, pauses and removes skills without choosing an expert", async () => {
    setup();
    fireEvent.click(
      await screen.findByRole("button", { name: "skillLibrary.install" }),
    );
    const toggle = await screen.findByRole("switch", {
      name: "skillLibrary.enablePackage",
    });
    expect(toggle).toHaveAttribute("aria-checked", "true");
    fireEvent.click(toggle);
    await waitFor(() =>
      expect(state.api.updateLibrary).toHaveBeenLastCalledWith(
        "office",
        true,
        false,
      ),
    );
    expect(toggle).toHaveAttribute("aria-checked", "false");
    fireEvent.click(
      screen.getByRole("button", { name: "skillLibrary.uninstall" }),
    );
    await screen.findByRole("button", { name: "skillLibrary.install" });
    expect(state.api.updateLibrary).toHaveBeenLastCalledWith(
      "office",
      false,
      true,
    );
  });

  it("imports into the unified package then installs it for the current user", async () => {
    setup("/skills?import=1");
    fireEvent.click(
      await screen.findByRole("button", { name: "confirm-url-import" }),
    );
    await waitFor(() =>
      expect(state.api.importSkill).toHaveBeenCalledWith("office", {
        bundle_url: "https://github.com/example/reader",
        overwrite: false,
      }),
    );
    await waitFor(() =>
      expect(state.api.updateLibrary).toHaveBeenCalledWith("office", true),
    );
    expect(state.api.get.mock.calls.every(([id]) => id === "office")).toBe(
      true,
    );
  });

  it("asks for a writable package instead of importing into another creator's package", async () => {
    state.rows[0].can_write = false;
    setup("/skills?import=1");
    await screen.findByRole("dialog", { name: "skillPackages.createPackage" });
    expect(
      screen.queryByRole("button", { name: "confirm-url-import" }),
    ).not.toBeInTheDocument();
    expect(state.api.importSkill).not.toHaveBeenCalled();
  });
});
