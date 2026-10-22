import {
  act,
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import { MemoryRouter, useLocation } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";
import WorkBuddyExpertCenter from "./WorkBuddyExpertCenter";
import type { OctopAgent } from "../../../context/AgentContext";
import type { PublishedExpert } from "../../../api/modules/publishedExperts";
import { MEDIA_EXPERT_CATEGORIES } from "./expertDiscovery";

const mocks = vi.hoisted(() => ({
  list: vi.fn(),
  get: vi.fn(),
  request: vi.fn(),
  setActiveAgent: vi.fn(),
}));
vi.mock("../../../api/modules/expertMarket", () => ({
  expertMarketApi: { list: mocks.list, get: mocks.get },
}));
vi.mock("../../../api/request", () => ({ request: mocks.request }));
vi.mock("../../../context/AgentContext", () => ({
  useAgent: () => ({ setActiveAgent: mocks.setActiveAgent }),
}));
vi.mock("react-i18next", () => {
  const t = (key: string) => key;
  return { useTranslation: () => ({ t }) };
});
vi.mock("../../../components/Markdown/LazyMarkdown", () => ({
  default: ({ content }: { content: string }) => <p>{content}</p>,
}));
vi.mock("./iconForName", () => ({ ExpertIcon: () => <span /> }));

const expert = {
  id: "media-reporter",
  slug: "workbuddy-reporter",
  name: "采访专家",
  description: "整理采访记录",
  category: "article-production",
  quick_prompts: [
    {
      title: { zh: "拟采访提纲" },
      description: {},
      prompt: { zh: "为我拟定采访提纲" },
    },
  ],
} as PublishedExpert;
const general = {
  id: "media-general",
  slug: "workbuddy-general",
  name: "通用媒体专家",
  description: "通用任务",
} as PublishedExpert;
const defaultProps = {
  experts: [
    {
      id: "original-writer",
      label: { zh: "原版写作专家" },
      description: { zh: "原版能力" },
      category: "article-production",
    },
  ],
  publishedExperts: [general, expert],
  agents: [],
  loading: false,
  lang: "zh" as const,
  onManage: vi.fn(),
  onCreate: vi.fn(),
  teamsContent: <p>Teams management</p>,
};
function Location() {
  const location = useLocation();
  return (
    <output data-testid="route">
      {JSON.stringify({ path: location.pathname, state: location.state })}
    </output>
  );
}
function renderCenter(
  props: Partial<Parameters<typeof WorkBuddyExpertCenter>[0]> = {},
) {
  return render(
    <MemoryRouter>
      <WorkBuddyExpertCenter {...defaultProps} {...props} />
      <Location />
    </MemoryRouter>,
  );
}
function openReporter() {
  const cards = screen.getAllByRole("button", { name: /采访专家/ });
  fireEvent.click(cards[cards.length - 1]!);
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.request.mockResolvedValue({
    file_contents: [{ name: "SOUL.md", content: "采访能力详情" }],
    quick_prompts: expert.quick_prompts,
  });
  mocks.list.mockResolvedValue({ items: [], scenes: [] });
});

describe("WorkBuddy expert center", () => {
  it("opens catalog details and routes a quick question to the installed expert", async () => {
    renderCenter({
      agents: [
        {
          agent_id: "own-reporter",
          published_expert_id: expert.id,
          config: {},
        } as OctopAgent,
      ],
    });
    openReporter();
    const dialog = await screen.findByRole("dialog");
    await waitFor(() =>
      expect(mocks.request).toHaveBeenCalledWith(
        "/experts/published/media-reporter",
      ),
    );
    expect(await within(dialog).findByText("采访能力详情")).toBeTruthy();
    fireEvent.click(
      await within(dialog).findByRole("button", { name: "拟采访提纲" }),
    );
    expect(mocks.setActiveAgent).toHaveBeenCalledWith("own-reporter");
    expect(screen.getByTestId("route").textContent).toContain(
      '"path":"/chat/own-reporter"',
    );
    expect(screen.getByTestId("route").textContent).toContain(
      '"prefillInput":"为我拟定采访提纲"',
    );
    expect(defaultProps.onCreate).not.toHaveBeenCalled();
  });

  it("ignores a detail request that finishes after its dialog is dismissed", async () => {
    let resolve!: (value: object) => void;
    mocks.request.mockImplementation(
      () =>
        new Promise<object>((done) => {
          resolve = done;
        }),
    );
    renderCenter();
    openReporter();
    const dialog = await screen.findByRole("dialog");
    fireEvent.click(within(dialog).getByRole("button", { name: "Close" }));
    await act(async () => {
      resolve({ file_contents: [{ name: "SOUL.md", content: "过期详情" }] });
    });
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    expect(screen.queryByText("过期详情")).toBeNull();
  });

  it("uses the eight site categories in order and combines category filtering with search", () => {
    renderCenter();
    const filters = screen.getByRole("group", {
      name: "experts.workbuddy.categories",
    });
    expect(
      within(filters)
        .getAllByRole("button")
        .map((button) => button.textContent),
    ).toEqual([
      "experts.sceneAll",
      ...MEDIA_EXPERT_CATEGORIES.map(
        (category) => `experts.mediaCategories.${category}`,
      ),
    ]);
    fireEvent.click(
      within(filters).getByRole("button", {
        name: "experts.mediaCategories.article-production",
      }),
    );
    fireEvent.change(screen.getByRole("textbox"), {
      target: { value: "采访" },
    });
    expect(screen.getByRole("button", { name: /采访专家/ })).toBeTruthy();
    expect(screen.queryByRole("button", { name: /通用媒体专家/ })).toBeNull();
    fireEvent.click(
      within(filters).getByRole("button", {
        name: "experts.mediaCategories.topic-planning",
      }),
    );
    expect(screen.getByText("experts.searchEmpty")).toBeTruthy();
    fireEvent.click(
      within(filters).getByRole("button", { name: "experts.sceneAll" }),
    );
    fireEvent.change(screen.getByRole("textbox"), {
      target: { value: "通用" },
    });
    expect(screen.getByRole("button", { name: /通用媒体专家/ })).toBeTruthy();
  });

  it("includes public snapshots without fetching external listings and preserves personal/team management", () => {
    renderCenter({
      publishedExperts: [
        expert,
        {
          id: "own-publication",
          name: "我的发布专家",
          description: "个人数据",
        } as PublishedExpert,
      ],
    });
    expect(mocks.list).not.toHaveBeenCalled();
    expect(mocks.get).not.toHaveBeenCalled();
    expect(screen.queryByText("我的发布专家")).toBeNull();
    expect(screen.getAllByText("采访专家").length).toBeGreaterThan(0);
    fireEvent.click(screen.getByRole("button", { name: "experts.myExperts" }));
    expect(defaultProps.onManage).toHaveBeenCalledOnce();
    fireEvent.click(
      screen.getByRole("tab", { name: "experts.workbuddy.teams" }),
    );
    expect(screen.getByText("Teams management")).toBeTruthy();
  });

  it("filters an imported public expert and opens its prompt and install flow", async () => {
    const published = {
      id: "workbuddy-import",
      slug: "workbuddy-topic-planner",
      name: "导入的选题专家",
      description: "公共选题模板",
      category: "topic-planning",
    } as PublishedExpert;
    renderCenter({ publishedExperts: [published] });
    fireEvent.click(
      screen.getByRole("tab", { name: "experts.workbuddy.mediaExperts" }),
    );
    fireEvent.click(
      screen.getByRole("button", {
        name: "experts.mediaCategories.topic-planning",
      }),
    );
    const cards = screen.getAllByRole("button", { name: /导入的选题专家/ });
    fireEvent.click(cards[cards.length - 1]!);
    const dialog = await screen.findByRole("dialog");
    expect(await within(dialog).findByText("采访能力详情")).toBeTruthy();
    expect(mocks.request).toHaveBeenCalledWith(
      "/experts/published/workbuddy-import",
    );
    fireEvent.click(within(dialog).getByRole("button", { name: "拟采访提纲" }));
    expect(defaultProps.onCreate).toHaveBeenCalledWith(
      {
        kind: "published",
        expert: { ...published, quick_prompts: expert.quick_prompts },
      },
      "为我拟定采访提纲",
    );
  });

  it("opens all 42 media publications by default and preserves team management", () => {
    const publishedExperts = Array.from(
      { length: 42 },
      (_, index) =>
        ({
          id: `import-${index}`,
          slug: `workbuddy-media-${index}`,
          name: `媒体模板 ${index}`,
          description: "已恢复的媒体专家",
          category:
            MEDIA_EXPERT_CATEGORIES[index % MEDIA_EXPERT_CATEGORIES.length],
        }) as PublishedExpert,
    );
    renderCenter({ publishedExperts });
    expect(screen.getAllByRole("tab").map((tab) => tab.textContent)).toEqual([
      "experts.workbuddy.experts",
      "experts.workbuddy.mediaExperts",
      "experts.workbuddy.teams",
    ]);
    expect(
      screen.getByRole("tab", { name: "experts.workbuddy.mediaExperts" }),
    ).toHaveAttribute("aria-selected", "true");
    expect(
      screen.getAllByText("experts.workbuddy.summon", { selector: "button" }),
    ).toHaveLength(42);
    expect(screen.queryByText("通用媒体专家")).toBeNull();
    fireEvent.click(
      screen.getByRole("button", {
        name: "experts.mediaCategories.topic-planning",
      }),
    );
    expect(
      screen.getAllByText("experts.workbuddy.summon", { selector: "button" }),
    ).toHaveLength(5);
    fireEvent.change(screen.getByRole("textbox"), {
      target: { value: "媒体模板 36" },
    });
    expect(
      screen.getAllByText("experts.workbuddy.summon", { selector: "button" }),
    ).toHaveLength(1);
    fireEvent.change(screen.getByRole("textbox"), { target: { value: "" } });
    fireEvent.click(
      screen.getByRole("tab", { name: "experts.workbuddy.teams" }),
    );
    expect(screen.getByText("Teams management")).toBeTruthy();
    expect(screen.queryByText("媒体模板 0")).toBeNull();
    fireEvent.click(
      screen.getByRole("tab", { name: "experts.workbuddy.mediaExperts" }),
    );
    expect(
      screen.getAllByText("experts.workbuddy.summon", { selector: "button" }),
    ).toHaveLength(42);
  });

  it("restores original experts separately from the media collection", async () => {
    renderCenter({
      publishedExperts: [
        expert,
        { id: "custom-original", name: "原版发布专家" } as PublishedExpert,
      ],
    });
    expect(screen.queryByText("原版写作专家")).toBeNull();
    fireEvent.click(
      screen.getByRole("tab", { name: "experts.workbuddy.experts" }),
    );
    expect(screen.getAllByText("原版写作专家").length).toBeGreaterThan(0);
    expect(screen.getAllByText("原版发布专家").length).toBeGreaterThan(0);
    expect(screen.queryByText("采访专家")).toBeNull();
    const cards = screen.getAllByRole("button", { name: /原版写作专家/ });
    fireEvent.click(cards[cards.length - 1]!);
    await screen.findByRole("dialog");
    await waitFor(() =>
      expect(mocks.request).toHaveBeenCalledWith("/experts/original-writer"),
    );
  });

  it("reconnects the cloud catalog, detail, and create flow without mixing media experts", async () => {
    const cloud = {
      id: "skillhub:cloud-writer",
      slug: "cloud-writer",
      label: { zh: "云端写作专家" },
      description: { zh: "云端推荐" },
      scene: "media",
    };
    const detail = {
      ...cloud,
      content: { zh: "云端完整说明" },
      quick_prompts: expert.quick_prompts,
    };
    mocks.list.mockResolvedValue({ items: [cloud], scenes: ["media"] });
    mocks.get.mockResolvedValue(detail);
    renderCenter();
    expect(mocks.list).not.toHaveBeenCalled();
    fireEvent.click(
      screen.getByRole("tab", { name: "experts.workbuddy.experts" }),
    );
    const cards = await screen.findAllByRole("button", {
      name: /云端写作专家/,
    });
    expect(mocks.list).toHaveBeenCalledWith("");
    expect(screen.queryByText("采访专家")).toBeNull();
    fireEvent.click(cards[cards.length - 1]!);
    const dialog = await screen.findByRole("dialog");
    expect(await within(dialog).findByText("云端完整说明")).toBeTruthy();
    expect(mocks.get).toHaveBeenCalledWith("cloud-writer");
    fireEvent.click(within(dialog).getByRole("button", { name: "拟采访提纲" }));
    expect(defaultProps.onCreate).toHaveBeenCalledWith(
      { kind: "market", expert: detail },
      "为我拟定采访提纲",
    );
    fireEvent.click(
      screen.getByRole("tab", { name: "experts.workbuddy.mediaExperts" }),
    );
    expect(screen.queryByRole("button", { name: /云端写作专家/ })).toBeNull();
    expect(screen.getAllByText("采访专家").length).toBeGreaterThan(0);
  });

  it("creates an uninstalled configured expert without changing its source", () => {
    renderCenter();
    fireEvent.change(screen.getByRole("textbox"), {
      target: { value: "采访" },
    });
    fireEvent.click(
      screen.getByRole("button", { name: "experts.workbuddy.summon" }),
    );
    expect(defaultProps.onCreate).toHaveBeenCalledWith(
      { kind: "published", expert },
      undefined,
    );
  });
});
