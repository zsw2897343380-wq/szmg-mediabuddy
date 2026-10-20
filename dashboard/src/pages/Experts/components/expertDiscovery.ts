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
  "article-production",
  "viral-creation",
  "international-communication",
  "content-operations",
  "data-analysis",
  "office-collaboration",
  "review-proofreading",
] as const;

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
