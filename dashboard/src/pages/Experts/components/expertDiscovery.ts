import type { OctopAgent } from "../../../context/AgentContext";
import type { CreateFromTemplateSource } from "./CreateFromExpertDrawer";
import { pickLocale } from "../../../utils/localizedText";

export interface DiscoveryExpert {
  key: string;
  name: string;
  description: string;
  category: string;
  source: CreateFromTemplateSource;
  installedCount: number;
  createdAt: number | null;
}

export type DiscoverySort = "reco" | "popular" | "newest";

export const MEDIA_EXPERT_CATEGORIES = [
  "topic-planning",
  "outline-planning",
  "article-production",
  "fact-checking",
  "viral-creation",
  "data-analysis",
  "spoken-script",
  "content-operations",
  "office-collaboration",
] as const;

// MediaBuddy catalog order from the approved expert naming document.
const MEDIA_EXPERT_SLUG_ORDER = [
  // 策划能手
  "workbuddy-global-topic-planner",
  "workbuddy-cn-topic-planner",
  "workbuddy-trendradar-forecast",
  "workbuddy-geo-strategy-architect",
  "workbuddy-daily-topic-recommender",
  "workbuddy-weekly-review-forecaster",
  "workbuddy-shenzhen-event-planner",
  // 提纲巧手
  "workbuddy-info-distillation",
  "workbuddy-executive-interview-architect",
  "workbuddy-hot-event-timeline",
  // 写稿专家
  "workbuddy-hot-news-writer",
  "workbuddy-global-affairs-commentator",
  "workbuddy-longform-content-slicer",
  "workbuddy-ad-copywriter",
  "workbuddy-manuscript-polish-editor",
  "workbuddy-content-expansion-writer",
  "workbuddy-bilingual-news-editor",
  "workbuddy-sea-languages-translator",
  "workbuddy-cn-en-bilingual-translator",
  "workbuddy-deai-tone-editor",
  // 信息核查官
  "workbuddy-multi-engine-search",
  "workbuddy-youtube-video-scout",
  "workbuddy-hot-asset-harvester",
  // 爆款标题王
  "workbuddy-viral-title-generator",
  "workbuddy-multiplatform-rewriter",
  "workbuddy-douyin-viral-alchemist",
  "workbuddy-douyin-hook-designer",
  // 数据分析
  "workbuddy-global-hotspot-radar",
  "workbuddy-cn-hotspot-radar",
  "workbuddy-account-data-analyst",
  // 口播脚本
  "workbuddy-viral-video-analyzer",
  "workbuddy-shortvideo-storyboard",
  "workbuddy-ai-image-prompt",
  "workbuddy-ai-video-prompt",
  "workbuddy-suno-music-composer",
  // 内容运营
  "workbuddy-cn-social-operator",
  "workbuddy-global-social-strategist",
  "workbuddy-weibo-trend-copywriter",
  "workbuddy-xiaohongshu-note-writer",
  // 办公协作
  "workbuddy-official-letter-writer",
  "workbuddy-work-report-assistant",
  "workbuddy-meeting-minutes-assistant",
] as const;

const mediaExpertRanks = new Map<string, number>(
  MEDIA_EXPERT_SLUG_ORDER.map((slug, index) => [slug, index]),
);

export function orderMediaExperts(items: DiscoveryExpert[]): DiscoveryExpert[] {
  const rank = (item: DiscoveryExpert) =>
    item.source.kind === "published"
      ? mediaExpertRanks.get(item.source.expert.slug ?? "") ?? Infinity
      : Infinity;
  return [...items].sort((a, b) => rank(a) - rank(b));
}

export function matchesInstalledSource(
  agent: OctopAgent,
  source: CreateFromTemplateSource,
): boolean {
  const id = source.expert.id;
  return source.kind === "published"
    ? ("published_expert_id" in agent && agent.published_expert_id === id) ||
        agent.config?.published_expert_id === id
    : agent.template_name === id || agent.config?.expert_id === id;
}

export function discoveryExpert(
  source: CreateFromTemplateSource,
  agents: OctopAgent[],
  lang: "zh" | "en",
): DiscoveryExpert {
  const expert = source.expert;
  const id = source.kind === "market" ? source.expert.slug : expert.id;
  const name =
    source.kind === "published"
      ? source.expert.name
      : pickLocale(source.expert.label, lang) || id;
  const description =
    source.kind === "published"
      ? source.expert.description
      : pickLocale(source.expert.description, lang);
  return {
    key: `${source.kind}:${id}`,
    name,
    description,
    category:
      source.kind === "builtin"
        ? source.expert.category || ""
        : source.kind === "market"
        ? source.expert.scene || ""
        : source.expert.category || "",
    source,
    installedCount: agents.filter((agent) =>
      matchesInstalledSource(agent, source),
    ).length,
    createdAt:
      source.kind === "published"
        ? Date.parse(source.expert.created_at) || null
        : null,
  };
}

export function filterDiscoveryExperts(
  items: DiscoveryExpert[],
  query: string,
  category: string,
  sort: DiscoverySort,
): DiscoveryExpert[] {
  const needle = query.trim().toLocaleLowerCase();
  const filtered = items.filter(
    (item) =>
      (!category || item.category === category) &&
      (!needle ||
        [item.name, item.description, item.key, item.category].some((text) =>
          text.toLocaleLowerCase().includes(needle),
        )),
  );
  if (sort === "popular")
    filtered.sort((a, b) => b.installedCount - a.installedCount);
  if (sort === "newest")
    filtered.sort((a, b) => (b.createdAt ?? 0) - (a.createdAt ?? 0));
  return filtered;
}
