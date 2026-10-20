import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { Alert, Button, Input, Modal, Spin } from "antd";
import { ArrowRight, Search, UserRound, Users } from "lucide-react";
import { useTranslation } from "react-i18next";
import { useNavigate } from "react-router-dom";
import type { PublishedExpert } from "../../../api/modules/publishedExperts";
import {
  expertMarketApi,
  type MarketExpert,
} from "../../../api/modules/expertMarket";
import { request } from "../../../api/request";
import { useAgent, type OctopAgent } from "../../../context/AgentContext";
import { pickLocale } from "../../../utils/localizedText";
import { apiErrorMessage } from "../../../utils/apiError";
import Markdown from "../../../components/Markdown/LazyMarkdown";
import { CapabilityHeaderActions } from "../../CapabilityCenter/HeaderActions";
import { ExpertIcon } from "./iconForName";
import type { ExpertSummary } from "./ExpertCard";
import type { QuickPrompt } from "./welcomeManifest";
import type { CreateFromTemplateSource } from "./CreateFromExpertDrawer";
import {
  discoveryExpert,
  filterDiscoveryExperts,
  matchesInstalledSource,
  MEDIA_EXPERT_CATEGORIES,
  type DiscoveryExpert,
  type DiscoverySort,
} from "./expertDiscovery";
import styles from "../index.module.less";

interface Props {
  experts: ExpertSummary[];
  publishedExperts: PublishedExpert[];
  agents: OctopAgent[];
  loading: boolean;
  lang: "zh" | "en";
  onManage: () => void;
  onCreate: (source: CreateFromTemplateSource, prompt?: string) => void;
  teamsContent: ReactNode;
}

export default function WorkBuddyExpertCenter({
  experts,
  publishedExperts,
  agents,
  loading,
  lang,
  onManage,
  onCreate,
  teamsContent,
}: Props) {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { setActiveAgent } = useAgent();
  const [market, setMarket] = useState<MarketExpert[]>([]);
  const [marketLoading, setMarketLoading] = useState(false);
  const [marketError, setMarketError] = useState("");
  const [query, setQuery] = useState("");
  const [category, setCategory] = useState("");
  const [section, setSection] = useState<"expert" | "media" | "team">("media");
  const [sort, setSort] = useState<DiscoverySort>("reco");
  const [selected, setSelected] = useState<DiscoveryExpert | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [detailError, setDetailError] = useState("");
  const [detailBody, setDetailBody] = useState("");
  const generation = useRef(0);

  const loadMarket = useCallback(async () => {
    setMarketLoading(true);
    try {
      const response = await expertMarketApi.list("");
      setMarket(response.items);
      setMarketError("");
    } catch (error) {
      setMarketError(
        apiErrorMessage(error, t("experts.marketDetailLoadFailed"), t),
      );
    } finally {
      setMarketLoading(false);
    }
  }, [t]);
  useEffect(() => {
    if (section === "expert") void loadMarket();
  }, [section, loadMarket]);

  useEffect(
    () => () => {
      generation.current += 1;
    },
    [],
  );

  // The restored WorkBuddy collection keeps its original publication slugs.
  const entries = useMemo(
    () => [
      ...(section === "expert"
        ? [
            ...experts.map((expert) =>
              discoveryExpert({ kind: "builtin", expert }, agents, lang),
            ),
            ...market.map((expert) =>
              discoveryExpert({ kind: "market", expert }, agents, lang),
            ),
          ]
        : []),
      ...publishedExperts
        .filter((expert) =>
          section === "expert"
            ? !expert.slug?.startsWith("workbuddy-")
            : expert.slug?.startsWith("workbuddy-"),
        )
        .map((expert) =>
          discoveryExpert({ kind: "published", expert }, agents, lang),
        ),
    ],
    [experts, publishedExperts, market, agents, lang, section],
  );
  const categories =
    section === "expert"
      ? Array.from(
          new Set(entries.map((entry) => entry.category).filter(Boolean)),
        )
      : MEDIA_EXPERT_CATEGORIES;
  const visible = useMemo(
    () => filterDiscoveryExperts(entries, query, category, sort),
    [entries, query, category, sort],
  );
  const categoryLabel = (value: string) => {
    if (!value) return t("experts.sceneAll");
    return t(
      `experts.${section === "media" ? "mediaCategories" : "scenes"}.${value}`,
      { defaultValue: value },
    );
  };
  const openDetail = async (entry: DiscoveryExpert) => {
    const current = ++generation.current;
    setSelected(entry);
    setDetailError("");
    setDetailBody("");
    setDetailLoading(true);
    try {
      if (entry.source.kind === "market") {
        const expert = await expertMarketApi.get(entry.source.expert.slug);
        if (generation.current === current)
          setSelected(
            discoveryExpert({ kind: "market", expert }, agents, lang),
          );
        return;
      }
      const path = `/experts/${
        entry.source.kind === "published" ? "published/" : ""
      }${encodeURIComponent(entry.source.expert.id)}`;
      const detail = await request<{
        file_contents?: { name: string; content: string }[];
        quick_prompts?: QuickPrompt[];
      }>(path);
      if (generation.current === current) {
        setDetailBody(
          detail.file_contents?.find((file) => file.name === "SOUL.md")
            ?.content ?? "",
        );
        const source: CreateFromTemplateSource =
          entry.source.kind === "published"
            ? {
                kind: "published",
                expert: {
                  ...entry.source.expert,
                  quick_prompts:
                    detail.quick_prompts ?? entry.source.expert.quick_prompts,
                },
              }
            : {
                kind: "builtin",
                expert: {
                  ...entry.source.expert,
                  quick_prompts:
                    detail.quick_prompts ?? entry.source.expert.quick_prompts,
                },
              };
        setSelected(discoveryExpert(source, agents, lang));
      }
    } catch (error) {
      if (generation.current === current)
        setDetailError(
          apiErrorMessage(error, t("experts.marketDetailLoadFailed"), t),
        );
    } finally {
      if (generation.current === current) setDetailLoading(false);
    }
  };
  const closeDetail = () => {
    generation.current += 1;
    setSelected(null);
    setDetailLoading(false);
  };
  const summon = (entry: DiscoveryExpert, prompt?: string) => {
    const source = entry.source;
    const installed = agents.find((agent) =>
      matchesInstalledSource(agent, source),
    );
    closeDetail();
    if (installed) {
      setActiveAgent(installed.agent_id);
      navigate(`/chat/${installed.agent_id}`, {
        state: { newChat: true, prefillInput: prompt ?? "" },
      });
    } else onCreate(source, prompt);
  };
  const detailSource = selected?.source;
  const detailContent =
    detailSource?.kind === "market"
      ? pickLocale(detailSource.expert.content, lang)
      : detailBody;
  const quickPrompts = detailSource?.expert.quick_prompts ?? [];
  const examples =
    detailSource && "task_examples" in detailSource.expert
      ? detailSource.expert.task_examples?.[lang] ?? []
      : [];

  return (
    <div className={styles.workbuddyCenter}>
      <CapabilityHeaderActions resource="experts">
        <div className={styles.centerTopbar}>
          <Input
            aria-label={t("experts.searchPlaceholder")}
            placeholder={t("experts.searchPlaceholder")}
            prefix={<Search size={16} />}
            allowClear
            value={query}
            onChange={(event) => setQuery(event.target.value)}
          />
          <Button icon={<UserRound size={16} />} onClick={onManage}>
            {t("experts.myExperts")}
          </Button>
        </div>
      </CapabilityHeaderActions>
      <div className={styles.centerScroll}>
        {!query.trim() && section !== "team" && entries.length > 0 && (
          <section
            className={styles.featuredScenes}
            aria-label={t("experts.workbuddy.featuredScenes")}
          >
            {categories.map((value, index) => (
              <article
                key={value}
                className={styles.featuredScene}
                style={
                  {
                    "--scene-hue": `${index * 47 + 175}`,
                  } as React.CSSProperties
                }
              >
                <div className={styles.featuredSceneCover}>
                  <span>{categoryLabel(value)}</span>
                  <Users aria-hidden size={56} />
                </div>
                <div className={styles.featuredSceneExperts}>
                  {entries
                    .filter((entry) => entry.category === value)
                    .slice(0, 3)
                    .map((entry) => (
                      <button
                        type="button"
                        key={entry.key}
                        onClick={() => void openDetail(entry)}
                      >
                        {entry.name}
                        <ArrowRight size={14} />
                      </button>
                    ))}
                </div>
              </article>
            ))}
          </section>
        )}
        <div className={styles.centerListHeader}>
          <div
            role="tablist"
            aria-label={t("experts.workbuddy.expertType")}
            className={styles.centerListTabs}
          >
            <button
              type="button"
              role="tab"
              aria-selected={section === "expert"}
              onClick={() => {
                setSection("expert");
                setCategory("");
              }}
            >
              {t("experts.workbuddy.experts")}
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={section === "media"}
              onClick={() => {
                setSection("media");
                setCategory("");
              }}
            >
              {t("experts.workbuddy.mediaExperts")}
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={section === "team"}
              onClick={() => setSection("team")}
            >
              {t("experts.workbuddy.teams")}
            </button>
          </div>
          {section !== "team" && (
            <div
              className={styles.centerSort}
              role="group"
              aria-label={t("experts.workbuddy.sort")}
            >
              {(["reco", "popular", "newest"] as const).map((value) => (
                <button
                  type="button"
                  key={value}
                  aria-pressed={sort === value}
                  title={
                    value === "popular"
                      ? t("experts.workbuddy.popularityHint")
                      : value === "newest"
                      ? t("experts.workbuddy.newestHint")
                      : undefined
                  }
                  onClick={() => setSort(value)}
                >
                  {t(`experts.workbuddy.sort_${value}`)}
                </button>
              ))}
            </div>
          )}
        </div>
        {section === "team" ? (
          teamsContent
        ) : (
          <>
            <div
              className={styles.centerCategories}
              role="group"
              aria-label={t("experts.workbuddy.categories")}
            >
              {["", ...categories].map((value) => (
                <button
                  key={value}
                  type="button"
                  aria-pressed={category === value}
                  onClick={() => setCategory(value)}
                >
                  {categoryLabel(value)}
                </button>
              ))}
            </div>
            {section === "expert" && marketError && (
              <Alert
                type="warning"
                showIcon
                message={t("experts.workbuddy.marketUnavailable")}
                description={marketError}
                action={
                  <Button
                    size="small"
                    loading={marketLoading}
                    onClick={() => void loadMarket()}
                  >
                    {t("common.retry")}
                  </Button>
                }
              />
            )}
            {(loading || (section === "expert" && marketLoading)) &&
            entries.length === 0 ? (
              <div className={styles.loadingState}>
                <Spin />
              </div>
            ) : visible.length === 0 ? (
              <div className={styles.searchEmpty}>
                {t("experts.searchEmpty")}
              </div>
            ) : (
              <div className={styles.discoveryGrid}>
                {visible.map((entry) => (
                  <article key={entry.key} className={styles.discoveryCard}>
                    <button
                      type="button"
                      className={styles.discoveryCardMain}
                      onClick={() => void openDetail(entry)}
                    >
                      <div className={styles.discoveryCardHead}>
                        <span className={styles.discoveryAvatar}>
                          <ExpertIcon
                            iconUrl={entry.source.expert.icon_url}
                            iconName={entry.source.expert.icon_name}
                            size={36}
                          />
                        </span>
                        <span className={styles.discoveryCardIdentity}>
                          <span className={styles.discoveryName}>
                            {entry.name}
                          </span>
                          <span className={styles.discoveryTags}>
                            {entry.category && (
                              <span>{categoryLabel(entry.category)}</span>
                            )}
                            {entry.installedCount > 0 && (
                              <span>{t("experts.installedBadge")}</span>
                            )}
                          </span>
                        </span>
                      </div>
                      <span className={styles.discoveryDescription}>
                        {entry.description ||
                          t("experts.workbuddy.noDescription")}
                      </span>
                    </button>
                    <div className={styles.discoveryMetadata}>
                      {entry.installedCount > 0
                        ? t("experts.workbuddy.createdCopies", {
                            count: entry.installedCount,
                          })
                        : entry.category && categoryLabel(entry.category)}
                    </div>
                    <button
                      type="button"
                      className={styles.discoverySummon}
                      onClick={() => summon(entry)}
                    >
                      {t("experts.workbuddy.summon")}
                    </button>
                  </article>
                ))}
              </div>
            )}
          </>
        )}
      </div>
      <Modal
        open={!!selected}
        onCancel={closeDetail}
        width={800}
        centered
        title={selected?.name}
        footer={
          <Button
            type="primary"
            disabled={detailLoading}
            onClick={() => selected && summon(selected)}
          >
            {t("experts.workbuddy.summonNow")}
          </Button>
        }
        className={styles.expertDetailModal}
      >
        {selected && (
          <Spin spinning={detailLoading}>
            <div className={styles.expertDetailHeader}>
              <span className={styles.expertDetailAvatar}>
                <ExpertIcon
                  iconUrl={selected.source.expert.icon_url}
                  iconName={selected.source.expert.icon_name}
                  size={48}
                />
              </span>
              <div>
                <h2>{selected.name}</h2>
                <p>{selected.description}</p>
              </div>
            </div>
            {selected.category && (
              <div className={styles.discoveryTags}>
                <span>{categoryLabel(selected.category)}</span>
              </div>
            )}
            {detailError && (
              <Alert type="warning" showIcon message={detailError} />
            )}
            {quickPrompts.length > 0 && (
              <section className={styles.expertDetailSection}>
                <h3>{t("experts.workbuddy.quickPrompts")}</h3>
                <div className={styles.expertDetailPrompts}>
                  {quickPrompts.map((prompt, index) => (
                    <button
                      type="button"
                      key={index}
                      onClick={() =>
                        summon(selected, pickLocale(prompt.prompt, lang))
                      }
                    >
                      {pickLocale(prompt.title, lang) ||
                        pickLocale(prompt.prompt, lang)}
                    </button>
                  ))}
                </div>
              </section>
            )}
            {examples.length > 0 && (
              <section className={styles.expertDetailSection}>
                <h3>{t("experts.workbuddy.useCases")}</h3>
                <ul>
                  {examples.map((example) => (
                    <li key={example}>{example}</li>
                  ))}
                </ul>
              </section>
            )}
            {detailContent && (
              <section className={styles.expertDetailSection}>
                <h3>{t("experts.workbuddy.abilities")}</h3>
                <Markdown content={detailContent} />
              </section>
            )}
            <section className={styles.expertDetailSection}>
              <h3>{t("experts.workbuddy.more")}</h3>
              <p>ID: {selected.source.expert.id}</p>
            </section>
          </Spin>
        )}
      </Modal>
    </div>
  );
}
