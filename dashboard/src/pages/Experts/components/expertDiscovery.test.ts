import { describe, expect, it } from "vitest";
import type { OctopAgent } from "../../../context/AgentContext";
import {
  discoveryExpert,
  filterDiscoveryExperts,
  matchesInstalledSource,
  MEDIA_EXPERT_CATEGORIES,
  orderMediaExperts,
} from "./expertDiscovery";
import type { CreateFromTemplateSource } from "./CreateFromExpertDrawer";

const builtin: CreateFromTemplateSource = {
  kind: "builtin",
  expert: {
    id: "writer",
    label: { zh: "写作专家", en: "Writer" },
    description: { en: "Draft articles" },
    category: "article-production",
  },
};
const market: CreateFromTemplateSource = {
  kind: "market",
  expert: {
    id: "skillhub:reporter",
    slug: "reporter",
    label: { zh: "采访专家" },
    description: { zh: "整理采访" },
    scene: "media",
  },
};
const published: CreateFromTemplateSource = {
  kind: "published",
  expert: {
    id: "pub-one",
    slug: "pub",
    name: "共享新闻助手",
    description: "编辑稿件",
    created_at: "2026-10-19T00:00:00Z",
    updated_at: "2026-10-19T00:00:00Z",
    created_by: "1",
    creator_username: "alice",
    source_agent_id: "own",
    icon_name: null,
    color: null,
  },
};

describe("expert discovery", () => {
  it("follows document order across categories and within each category, independent of names and API order", () => {
    const entry = (slug: string, name: string) =>
      discoveryExpert(
        {
          ...published,
          expert: { ...published.expert, slug, name },
        } as CreateFromTemplateSource,
        [],
        "zh",
      );
    const items = [
      entry("workbuddy-hot-event-timeline", "热点新闻脉络梳理"),
      entry("workbuddy-new-expert", "新增专家"),
      entry("workbuddy-cn-topic-planner", "国内热点策划"),
      entry("workbuddy-executive-interview-architect", "高端访谈提纲策划师"),
      entry("workbuddy-global-topic-planner", "改名后的国际策划"),
      entry("workbuddy-info-distillation", "信息精炼师"),
    ];
    const ordered = orderMediaExperts(items);
    expect(ordered.map((item) => item.name)).toEqual([
      "改名后的国际策划",
      "国内热点策划",
      "信息精炼师",
      "高端访谈提纲策划师",
      "热点新闻脉络梳理",
      "新增专家",
    ]);
    expect(items[0]?.name).toBe("热点新闻脉络梳理");
    expect(filterDiscoveryExperts(ordered, "", "", "reco")).toEqual(ordered);
  });

  it("matches installed market experts using canonical ids and published experts using their column", () => {
    expect(
      matchesInstalledSource(
        { template_name: "skillhub:reporter", config: {} } as OctopAgent,
        market,
      ),
    ).toBe(true);
    expect(
      matchesInstalledSource(
        { template_name: "reporter", config: {} } as OctopAgent,
        market,
      ),
    ).toBe(false);
    expect(
      matchesInstalledSource(
        { published_expert_id: "pub-one", config: {} } as unknown as OctopAgent,
        published,
      ),
    ).toBe(true);
  });

  it("searches localized labels and descriptions while retaining category scope", () => {
    const entries = [builtin, market, published].map((source) =>
      discoveryExpert(source, [], "zh"),
    );
    expect(
      filterDiscoveryExperts(entries, "采访", "media", "reco").map(
        (item) => item.key,
      ),
    ).toEqual(["market:reporter"]);
    expect(
      filterDiscoveryExperts(entries, "采访", "article-production", "reco"),
    ).toEqual([]);
    expect(
      filterDiscoveryExperts(entries, "ARTICLES", "", "reco").map(
        (item) => item.key,
      ),
    ).toEqual(["builtin:writer"]);
  });

  it("uses the site category order and keeps uncategorized experts only in all", () => {
    expect(MEDIA_EXPERT_CATEGORIES).toEqual([
      "topic-planning",
      "outline-planning",
      "article-production",
      "fact-checking",
      "viral-creation",
      "data-analysis",
      "spoken-script",
      "content-operations",
      "office-collaboration",
    ]);
    const general = discoveryExpert(
      {
        kind: "builtin",
        expert: {
          id: "general-assistant",
          label: { en: "General assistant" },
          description: {},
          category: null,
        },
      },
      [],
      "en",
    );
    expect(general.category).toBe("");
    expect(discoveryExpert(published, [], "zh").category).toBe("");
    expect(filterDiscoveryExperts([general], "general", "", "reco")).toEqual([
      general,
    ]);
    expect(
      filterDiscoveryExperts([general], "", "topic-planning", "reco"),
    ).toEqual([]);
  });

  it("orders by real installed copy counts or known publication dates without inventing timestamps", () => {
    const agents = [
      { template_name: "skillhub:reporter", config: {} },
    ] as OctopAgent[];
    const entries = [builtin, market, published].map((source) =>
      discoveryExpert(source, agents, "zh"),
    );
    expect(
      filterDiscoveryExperts(entries, "", "", "popular").map(
        (item) => item.key,
      ),
    ).toEqual(["market:reporter", "builtin:writer", "published:pub-one"]);
    expect(
      filterDiscoveryExperts(entries, "", "", "newest").map((item) => item.key),
    ).toEqual(["published:pub-one", "builtin:writer", "market:reporter"]);
    expect(entries[0]?.createdAt).toBeNull();
    expect(entries[1]?.createdAt).toBeNull();
  });
});
