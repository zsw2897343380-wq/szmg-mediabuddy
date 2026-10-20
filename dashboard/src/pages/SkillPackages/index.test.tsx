import type { ReactNode } from "react";
import {
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import SkillPackagesPage from "./index";

const state = vi.hoisted(() => ({
  t: (key: string) => key,
  library: {
    installed_package_ids: [] as string[],
    disabled_package_ids: [] as string[],
    skill_states: {} as Record<
      string,
      Record<string, { installed: boolean; enabled: boolean }>
    >,
  },
  api: {
    list: vi.fn(),
    get: vi.fn(),
    getSkill: vi.fn(),
    library: vi.fn(),
    updateSkillLibrary: vi.fn(),
    importSkill: vi.fn(),
    create: vi.fn(),
    delete: vi.fn(),
    createSkill: vi.fn(),
    hubRankings: vi.fn(),
    hubSearch: vi.fn(),
    hubInstall: vi.fn(),
  },
}));
const rows = [
  {
    id: "office",
    name: "Office",
    created_by: "1",
    can_write: true,
    description: "Office skills",
    skill_count: 2,
  },
];
const skills = [
  {
    slug: "reader",
    name: "Reader",
    description: "Read files",
    package_id: "office",
    kind: "package",
    path: "reader",
  },
  {
    slug: "writer",
    name: "Writer",
    description: "Write files",
    package_id: "office",
    kind: "package",
    path: "writer",
  },
];
const getComputedStyle = window.getComputedStyle.bind(window);
vi.mock("react-i18next", () => ({
  useTranslation: () => ({ t: state.t, i18n: { language: "en" } }),
}));
vi.mock("../../api/modules/skillPackages", () => ({
  skillPackagesApi: state.api,
}));
vi.mock("../../api/modules/auth", () => ({
  authApi: { me: async () => ({ id: 1, role: "admin" }) },
}));
vi.mock("../../layouts/PageShell", () => ({
  default: ({ children }: { children: ReactNode }) => children,
}));
vi.mock("../Agent/Skills/components/SkillDrawer", () => ({
  SkillDrawer: () => null,
}));
vi.mock("../../components/Markdown/LazyMarkdown", () => ({
  default: ({ content }: { content: string }) => <p>{content}</p>,
}));
vi.mock("../Agent/Skills/components/SkillHubTab", () => ({
  default: () => null,
}));
vi.mock("./SkillsetFromHubDrawer", () => ({
  SkillsetFromHubDrawer: () => null,
}));
vi.mock("./SkillImportModal", () => ({
  SkillImportModal: ({
    open,
    onImportUrl,
  }: {
    open: boolean;
    onImportUrl: (url: string, options: { overwrite: boolean }) => void;
  }) =>
    open ? (
      <button
        onClick={() =>
          onImportUrl("https://github.com/example/reader", { overwrite: false })
        }
      >
        confirm-url-import
      </button>
    ) : null,
}));
vi.mock("../../utils/confirmModal", () => ({
  showConfirmModal: ({ onOk }: { onOk: () => void }) => onOk(),
}));
vi.mock("../../utils/antdMessage", () => ({
  message: { success: vi.fn(), error: vi.fn(), warning: vi.fn() },
}));

beforeEach(() => {
  vi.spyOn(window, "getComputedStyle").mockImplementation((element) =>
    getComputedStyle(element),
  );
  vi.clearAllMocks();
  state.library = {
    installed_package_ids: [],
    disabled_package_ids: [],
    skill_states: {},
  };
  state.api.list.mockResolvedValue(rows);
  state.api.get.mockImplementation(async (id: string) => ({
    ...rows[0],
    id,
    skills,
  }));
  state.api.getSkill.mockImplementation(async (_id: string, slug: string) => ({
    ...skills.find((skill) => skill.slug === slug),
    raw: `---\nname: ${slug}\n---\n# ${slug} instructions`,
    body: `${slug} instructions`,
    frontmatter: {},
  }));
  state.api.library.mockImplementation(async () => ({ ...state.library }));
  state.api.importSkill.mockResolvedValue({ slug: "reader" });
  state.api.create.mockResolvedValue({
    ...rows[0],
    id: "imported",
    skills: [],
  });
  state.api.hubRankings.mockResolvedValue({
    rankings: {
      recommended: {
        skills: [
          {
            slug: "market-reader",
            name: "Market Reader",
            description: "Read from the market",
            category: "Documents",
          },
        ],
      },
    },
  });
  state.api.hubSearch.mockResolvedValue([
    { slug: "searched", name: "Searched skill", description: "Search result" },
  ]);
  state.api.hubInstall.mockResolvedValue({
    installed: true,
    name: "market-reader",
  });
  state.api.updateSkillLibrary.mockImplementation(
    async (id: string, slug: string, installed: boolean, enabled = true) => {
      state.library = {
        ...state.library,
        skill_states: {
          ...state.library.skill_states,
          [id]: {
            ...state.library.skill_states[id],
            [slug]: { installed, enabled: installed && enabled },
          },
        },
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
async function showLocal() {
  fireEvent.click(
    await screen.findByRole("tab", { name: "skillsCenter.instance" }),
  );
  return screen.findByRole("button", { name: "Reader" });
}

describe("WorkBuddy unified skill center", () => {
  it("does not retain repeated market cards when switching to installed skills", async () => {
    state.library.installed_package_ids = ["office"];
    const marketSkill = {
      slug: "market-reader",
      name: "Market Reader",
      description: "Repeated marketplace result",
    };
    state.api.hubRankings.mockResolvedValue({
      rankings: { recommended: { skills: [marketSkill, marketSkill] } },
    });
    setup();
    await screen.findAllByRole("button", { name: "Market Reader" });
    fireEvent.click(screen.getByRole("button", { name: /skillLibrary.title/ }));
    expect(
      await screen.findByRole("button", { name: "Reader" }),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "Market Reader" }),
    ).not.toBeInTheDocument();
  });

  it("installs one skill from a multi-skill package, then pauses and removes only that skill", async () => {
    setup();
    const reader = await showLocal();
    fireEvent.click(
      within(reader).getByRole("button", { name: "skillsCenter.install" }),
    );
    await waitFor(() =>
      expect(state.api.updateSkillLibrary).toHaveBeenLastCalledWith(
        "office",
        "reader",
        true,
        true,
      ),
    );
    fireEvent.click(screen.getByRole("button", { name: /skillLibrary.title/ }));
    expect(
      await screen.findByRole("button", { name: "Reader" }),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "Writer" }),
    ).not.toBeInTheDocument();
    fireEvent.click(
      screen.getByRole("switch", { name: "skillsCenter.enable" }),
    );
    await waitFor(() =>
      expect(state.api.updateSkillLibrary).toHaveBeenLastCalledWith(
        "office",
        "reader",
        true,
        false,
      ),
    );
    expect(screen.getByRole("switch")).toHaveAttribute("aria-checked", "false");
    fireEvent.click(screen.getByRole("button", { name: "skillsCenter.more" }));
    fireEvent.click(await screen.findByText("skillLibrary.uninstall"));
    await waitFor(() =>
      expect(state.api.updateSkillLibrary).toHaveBeenLastCalledWith(
        "office",
        "reader",
        false,
        true,
      ),
    );
    await waitFor(() =>
      expect(
        screen.queryByRole("button", { name: "Reader" }),
      ).not.toBeInTheDocument(),
    );
  });
  it("preserves legacy package installation while honoring per-skill overrides", async () => {
    state.library = {
      installed_package_ids: ["office"],
      disabled_package_ids: [],
      skill_states: {
        office: { writer: { installed: false, enabled: false } },
      },
    };
    setup();
    fireEvent.click(
      await screen.findByRole("button", { name: /skillLibrary.title/ }),
    );
    expect(
      await screen.findByRole("button", { name: "Reader" }),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "Writer" }),
    ).not.toBeInTheDocument();
  });
  it("imports directly into unified management and enables the returned skill slug", async () => {
    setup("/skills?import=1");
    fireEvent.click(
      await screen.findByRole("button", { name: "confirm-url-import" }),
    );
    await waitFor(() =>
      expect(state.api.create).toHaveBeenCalledWith({ name: "reader" }),
    );
    expect(state.api.importSkill).toHaveBeenCalledWith("imported", {
      bundle_url: "https://github.com/example/reader",
      overwrite: false,
    });
    await waitFor(() =>
      expect(state.api.updateSkillLibrary).toHaveBeenCalledWith(
        "imported",
        "reader",
        true,
      ),
    );
  });
  it("searches the real market and installs through the catalog API without selecting an expert", async () => {
    setup();
    const card = await screen.findByRole("button", { name: "Market Reader" });
    fireEvent.click(
      within(card).getByRole("button", { name: "skillsCenter.install" }),
    );
    await waitFor(() =>
      expect(state.api.hubInstall).toHaveBeenCalledWith("imported", {
        skill_name: "market-reader",
        display_name: "Market Reader",
        icon_url: undefined,
      }),
    );
    expect(state.api.updateSkillLibrary).toHaveBeenCalledWith(
      "imported",
      "market-reader",
      true,
    );
    fireEvent.change(
      screen.getByRole("textbox", { name: "skillsCenter.search" }),
      { target: { value: "searched" } },
    );
    expect(
      await screen.findByRole("button", { name: "Searched skill" }),
    ).toBeInTheDocument();
    expect(state.api.hubSearch).toHaveBeenLastCalledWith("searched");
  });
  it("opens a local skill detail with keyboard and searches its real manifest", async () => {
    setup();
    fireEvent.keyDown(await showLocal(), { key: " " });
    const dialog = await screen.findByRole("dialog");
    expect(
      await within(dialog).findByText("reader instructions"),
    ).toBeInTheDocument();
    fireEvent.change(
      within(dialog).getByRole("textbox", {
        name: "skillsCenter.searchOverview",
      }),
      { target: { value: "reader" } },
    );
    expect(
      within(dialog).getByText("reader", { selector: "mark" }),
    ).toBeInTheDocument();
  });
  it("keeps the installed skill enabled when the server rejects a toggle", async () => {
    state.library = {
      installed_package_ids: ["office"],
      disabled_package_ids: [],
      skill_states: {},
    };
    state.api.updateSkillLibrary.mockRejectedValue(
      new Error("server unavailable"),
    );
    setup();
    fireEvent.click(
      await screen.findByRole("button", { name: /skillLibrary.title/ }),
    );
    const card = await screen.findByRole("button", { name: "Reader" });
    const toggle = within(card).getByRole("switch");
    fireEvent.click(toggle);
    await waitFor(() =>
      expect(state.api.updateSkillLibrary).toHaveBeenCalledWith(
        "office",
        "reader",
        true,
        false,
      ),
    );
    expect(toggle).toHaveAttribute("aria-checked", "true");
  });
  it("keeps local skills available when the real market is offline", async () => {
    state.api.hubRankings.mockRejectedValue(new Error("offline"));
    setup();
    expect(
      await screen.findByText("skillsCenter.marketUnavailable"),
    ).toBeInTheDocument();
    expect(await showLocal()).toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "Market Reader" }),
    ).not.toBeInTheDocument();
  });
  it("removes only the empty package created by a failed import", async () => {
    state.api.importSkill.mockRejectedValue(new Error("import failed"));
    state.api.get.mockImplementation(async (id: string) => ({
      ...rows[0],
      id,
      skills: id === "imported" ? [] : skills,
    }));
    setup("/skills?import=1");
    fireEvent.click(
      await screen.findByRole("button", { name: "confirm-url-import" }),
    );
    await waitFor(() =>
      expect(state.api.delete).toHaveBeenCalledWith("imported"),
    );
    expect(state.api.delete).not.toHaveBeenCalledWith("office");
    expect(state.api.updateSkillLibrary).not.toHaveBeenCalled();
  });
});
