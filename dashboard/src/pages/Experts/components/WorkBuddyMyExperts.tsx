import { useMemo, useState } from "react";
import { Alert, Button, Dropdown, Empty, Input, Spin } from "antd";
import { ArrowLeft, MoreHorizontal, Plus, Search } from "lucide-react";
import { useTranslation } from "react-i18next";
import type { OctopAgent } from "../../../context/AgentContext";
import type { PublishedExpert } from "../../../api/modules/publishedExperts";
import { CapabilityHeaderActions } from "../../CapabilityCenter/HeaderActions";
import { AgentCard } from "./AgentCard";
import { useRecentExperts } from "./useRecentExperts";
import styles from "../index.module.less";

interface Props {
  agents: OctopAgent[];
  publishedByAgentId: Record<string, PublishedExpert>;
  creating: boolean;
  onBack: () => void;
  onCreate: () => void;
  onManage: (tab: "my" | "teams" | "library" | "market") => void;
  onCreateTeam: () => void;
  onEdit: (id: string) => void;
  onDeleted: (id: string) => void;
  onStateChange: (id: string, state: string) => void;
  onPublishedChange: () => void;
}

export default function WorkBuddyMyExperts({
  agents,
  publishedByAgentId,
  creating,
  onBack,
  onCreate,
  onManage,
  onCreateTeam,
  onEdit,
  onDeleted,
  onStateChange,
  onPublishedChange,
}: Props) {
  const { t } = useTranslation();
  const [tab, setTab] = useState<"created" | "recent">("created");
  const [query, setQuery] = useState("");
  const soloExperts = useMemo(
    () => agents.filter((agent) => agent.kind !== "team"),
    [agents],
  );
  const { recent, loading, failed } = useRecentExperts(
    soloExperts,
    tab === "recent",
  );
  const items = (tab === "recent" ? recent : soloExperts).filter((agent) =>
    `${agent.name} ${agent.description ?? ""}`
      .toLocaleLowerCase()
      .includes(query.trim().toLocaleLowerCase()),
  );

  return (
    <section className={styles.myExpertPage}>
      <CapabilityHeaderActions resource="experts">
        <div className={styles.myExpertHeaderActions}>
          <Button type="text" icon={<ArrowLeft size={17} />} onClick={onBack}>
            {t("experts.workbuddy.backToCenter")}
          </Button>
          <Input
            prefix={<Search size={15} />}
            value={query}
            allowClear
            placeholder={t("experts.searchPlaceholder")}
            aria-label={t("experts.searchPlaceholder")}
            onChange={(event) => setQuery(event.target.value)}
          />
          <Button
            type="primary"
            icon={<Plus size={16} />}
            loading={creating}
            onClick={onCreate}
          >
            {t("experts.workbuddy.createExpert")}
          </Button>
          <Dropdown
            trigger={["click"]}
            menu={{
              items: [
                {
                  key: "team-create",
                  label: t("experts.workbuddy.createTeam"),
                  onClick: onCreateTeam,
                },
                { type: "divider" },
                {
                  key: "teams",
                  label: t("experts.myTeams"),
                  onClick: () => onManage("teams"),
                },
                {
                  key: "library",
                  label: t("experts.expertLibrary"),
                  onClick: () => onManage("library"),
                },
                {
                  key: "market",
                  label: t("experts.expertMarket"),
                  onClick: () => onManage("market"),
                },
                {
                  key: "manage",
                  label: t("experts.workbuddy.advancedManagement"),
                  onClick: () => onManage("my"),
                },
              ],
            }}
          >
            <Button
              type="text"
              icon={<MoreHorizontal size={18} />}
              aria-label={t("experts.workbuddy.moreManagement")}
            />
          </Dropdown>
        </div>
      </CapabilityHeaderActions>
      <div className={styles.myExpertScroll}>
        <h2 className={styles.myExpertTitle}>{t("experts.myExperts")}</h2>
        <div
          className={styles.centerListTabs}
          role="tablist"
          aria-label={t("experts.myExperts")}
        >
          <button
            type="button"
            role="tab"
            aria-selected={tab === "created"}
            onClick={() => setTab("created")}
          >
            {t("experts.workbuddy.created")}
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={tab === "recent"}
            onClick={() => setTab("recent")}
          >
            {t("experts.workbuddy.recent")}
          </button>
        </div>
        {tab === "recent" && (
          <p className={styles.myExpertRecentHint}>
            {t("experts.workbuddy.recentHint")}
          </p>
        )}
        {tab === "recent" && failed && (
          <Alert
            type="warning"
            showIcon
            message={t("experts.workbuddy.recentFailed")}
          />
        )}
        {loading && tab === "recent" ? (
          <div className={styles.loadingState}>
            <Spin />
          </div>
        ) : (
          <div className={styles.myExpertGrid}>
            {items.map((agent) => (
              <AgentCard
                key={agent.agent_id}
                agent={agent}
                compact
                iconName={agent.icon_name}
                iconUrl={agent.icon_url}
                accentColor={agent.color}
                publishedExpert={publishedByAgentId[agent.agent_id] ?? null}
                onEdit={onEdit}
                onDeleted={onDeleted}
                onStateChange={onStateChange}
                onPublishedChange={onPublishedChange}
              />
            ))}
            {tab === "created" && !query.trim() && (
              <button
                type="button"
                className={styles.myExpertCreateCard}
                onClick={onCreate}
                disabled={creating}
              >
                <Plus size={28} strokeWidth={1.4} />
                <span>{t("experts.workbuddy.createExpert")}</span>
              </button>
            )}
          </div>
        )}
        {!loading &&
          items.length === 0 &&
          (tab === "recent" || query.trim()) && (
            <Empty
              image={Empty.PRESENTED_IMAGE_SIMPLE}
              description={t(
                query.trim()
                  ? "experts.searchEmpty"
                  : "experts.workbuddy.recentEmpty",
              )}
            />
          )}
      </div>
    </section>
  );
}
